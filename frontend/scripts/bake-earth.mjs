/**
 * Bake the Earth texture the globe samples.
 *
 * Renders Natural Earth's 50m land polygons into an equirectangular RGB image:
 *
 *   R — land mask
 *   G — distance from the coastline, inward and outward (continental shelf, and
 *       interior shading so land does not read as a flat cut-out)
 *   B — unused, held at zero
 *
 * Terrain variation is generated in the shader rather than baked: noise is
 * incompressible, and carrying it in the PNG cost 2.6 MB of the 2.9 MB the
 * first version weighed.
 *
 * Output is a PNG written into `public/`, so the app carries no runtime
 * dependency on any of this — the data package is devDependencies only.
 *
 *   node scripts/bake-earth.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";
import { deflateSync } from "node:zlib";
import { feature } from "topojson-client";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const W = 2048;
const H = 1024;

// ── land mask via scanline polygon fill ─────────────────────────────────────
// A canvas would be simpler, but pulling a native module in for one build step
// is not worth it; the fill below is exact and takes under a second.
const topo = require("world-atlas/land-50m.json");
const land = feature(topo, topo.objects.land);

const x = (lng) => ((lng + 180) / 360) * W;
const y = (lat) => ((90 - lat) / 180) * H;

/** Every ring of every polygon, as flat [x,y] pixel arrays. */
const rings = [];
for (const geom of land.features ?? [land]) {
  const polys = geom.geometry.type === "Polygon" ? [geom.geometry.coordinates] : geom.geometry.coordinates;
  for (const poly of polys) {
    for (const ring of poly) {
      rings.push(ring.map(([lng, lat]) => [x(lng), y(lat)]));
    }
  }
}

const mask = new Uint8Array(W * H);
// Scanline through the row centre; a point is land when it is inside an odd
// number of rings, which handles lakes-in-islands correctly for free.
for (let row = 0; row < H; row++) {
  const sy = row + 0.5;
  const xs = [];
  for (const ring of rings) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i];
      const [xj, yj] = ring[j];
      if (yi > sy !== yj > sy) {
        xs.push(xi + ((sy - yi) / (yj - yi)) * (xj - xi));
      }
    }
  }
  xs.sort((a, b) => a - b);
  for (let k = 0; k + 1 < xs.length; k += 2) {
    const from = Math.max(0, Math.ceil(xs[k] - 0.5));
    const to = Math.min(W - 1, Math.floor(xs[k + 1] - 0.5));
    for (let col = from; col <= to; col++) mask[row * W + col] = 255;
  }
}

// ── signed distance to the coast, two-pass chamfer ──────────────────────────
// Wraps horizontally so the dateline is not a seam.
function chamfer(seed) {
  const INF = 1e9;
  const d = new Float32Array(W * H).fill(INF);
  for (let i = 0; i < W * H; i++) if (seed[i]) d[i] = 0;
  const at = (c, r) => ((c + W) % W) + r * W;
  for (let r = 0; r < H; r++)
    for (let c = 0; c < W; c++) {
      const i = at(c, r);
      if (r > 0) {
        d[i] = Math.min(d[i], d[at(c, r - 1)] + 1, d[at(c - 1, r - 1)] + 1.41, d[at(c + 1, r - 1)] + 1.41);
      }
      d[i] = Math.min(d[i], d[at(c - 1, r)] + 1);
    }
  for (let r = H - 1; r >= 0; r--)
    for (let c = W - 1; c >= 0; c--) {
      const i = at(c, r);
      if (r < H - 1) {
        d[i] = Math.min(d[i], d[at(c, r + 1)] + 1, d[at(c - 1, r + 1)] + 1.41, d[at(c + 1, r + 1)] + 1.41);
      }
      d[i] = Math.min(d[i], d[at(c + 1, r)] + 1);
    }
  return d;
}

const isLand = (i) => mask[i] > 0;
const coast = new Uint8Array(W * H);
for (let r = 0; r < H; r++)
  for (let c = 0; c < W; c++) {
    const i = r * W + c;
    const l = isLand(i);
    const n = [
      isLand(((c + 1) % W) + r * W),
      isLand(((c - 1 + W) % W) + r * W),
      isLand(c + Math.max(0, r - 1) * W),
      isLand(c + Math.min(H - 1, r + 1) * W),
    ];
    if (n.some((v) => v !== l)) coast[i] = 1;
  }
const dist = chamfer(coast);

// ── compose RGB ─────────────────────────────────────────────────────────────
const rgb = Buffer.alloc(W * H * 3);
for (let r = 0; r < H; r++)
  for (let c = 0; c < W; c++) {
    const i = r * W + c;
    const l = mask[i] > 0;
    // 40 px ≈ 7° — enough to read as shelf offshore and as interior inland
    const d = Math.min(1, dist[i] / 40);
    rgb[i * 3] = l ? 255 : 0;
    rgb[i * 3 + 1] = Math.round(d * 255);
    rgb[i * 3 + 2] = 0;
  }

// ── minimal PNG encoder ─────────────────────────────────────────────────────
const CRC = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return (buf) => {
    let c = -1;
    for (const b of buf) c = t[(c ^ b) & 0xff] ^ (c >>> 8);
    return (c ^ -1) >>> 0;
  };
})();

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(CRC(body));
  return Buffer.concat([len, body, crc]);
}

const stride = W * 3;
const raw = Buffer.alloc(H * (stride + 1));
for (let r = 0; r < H; r++) {
  const out = r * (stride + 1);
  raw[out] = 2; // filter: Up — each byte as a delta from the row above
  for (let k = 0; k < stride; k++) {
    const cur = rgb[r * stride + k];
    const above = r === 0 ? 0 : rgb[(r - 1) * stride + k];
    raw[out + 1 + k] = (cur - above) & 0xff;
  }
}
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(W, 0);
ihdr.writeUInt32BE(H, 4);
ihdr[8] = 8;   // bit depth
ihdr[9] = 2;   // truecolour
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk("IHDR", ihdr),
  chunk("IDAT", deflateSync(raw, { level: 9 })),
  chunk("IEND", Buffer.alloc(0)),
]);

writeFileSync(new URL("../public/earth.png", import.meta.url), png);
const landPct = ((mask.reduce((a, b) => a + (b > 0 ? 1 : 0), 0) / (W * H)) * 100).toFixed(1);
console.log(`public/earth.png — ${W}×${H}, ${(png.length / 1024).toFixed(0)} KB, ${landPct}% land`);
