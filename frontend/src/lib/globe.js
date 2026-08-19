/**
 * The Earth on the home screen.
 *
 * A raymarched sphere in a single fragment shader — no geometry, no library.
 * A full-screen triangle is drawn and every pixel casts a ray at a sphere; the
 * hit point converts straight to lat/lng, which samples the equirectangular
 * texture baked by `scripts/bake-earth.mjs`.
 *
 * Doing it this way rather than with a textured mesh buys three things: perfect
 * silhouette at any size, an atmosphere that is genuinely integrated along the
 * ray rather than a sprite, and a dependency-free ~7 KB instead of a 3D engine.
 *
 * Returns a controller: `roam()` idles, `diveTo()` flies to a coordinate.
 */

const VERT = `#version 300 es
void main() {
  // one oversized triangle covers the viewport with no vertex buffer
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

const FRAG = `#version 300 es
precision highp float;

uniform vec2  uRes;
uniform float uTime;
uniform sampler2D uEarth;
uniform float uLon;      // camera longitude, degrees
uniform float uLat;      // camera latitude, degrees
uniform float uDist;     // camera distance in sphere radii: 3.2 orbit → 1.02 surface
uniform vec3  uOcean;
uniform vec3  uLand;
uniform vec3  uAtmo;
uniform float uNight;    // 0 = daylit globe, 1 = full terminator
uniform float uMark;     // 0..1 reveal of the destination marker
uniform vec2  uMarkLL;   // marker lat/lng, degrees

out vec4 fragColor;

const float PI = 3.14159265359;

mat3 rotY(float a){ float s=sin(a), c=cos(a); return mat3(c,0,-s, 0,1,0, s,0,c); }
mat3 rotX(float a){ float s=sin(a), c=cos(a); return mat3(1,0,0, 0,c,s, 0,-s,c); }

// cheap value noise for terrain variation — baking this cost 2.6 MB, so it lives here
float hash(vec3 p){ return fract(sin(dot(p, vec3(17.1, 31.7, 74.7))) * 43758.5453); }
float noise(vec3 p){
  vec3 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(hash(i), hash(i+vec3(1,0,0)), f.x), mix(hash(i+vec3(0,1,0)), hash(i+vec3(1,1,0)), f.x), f.y),
    mix(mix(hash(i+vec3(0,0,1)), hash(i+vec3(1,0,1)), f.x), mix(hash(i+vec3(0,1,1)), hash(i+vec3(1,1,1)), f.x), f.y),
    f.z);
}
float fbm(vec3 p){
  return 0.55 * noise(p) + 0.28 * noise(p * 2.7) + 0.17 * noise(p * 6.1);
}

vec3 unitToLatLng(vec3 n){
  return vec3(asin(clamp(n.y, -1.0, 1.0)) * 180.0 / PI,
              atan(n.z, n.x) * 180.0 / PI, 0.0);
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * uRes) / min(uRes.x, uRes.y);

  // Camera pulled back along +Z, sphere of radius 1 at the origin. Narrowing
  // the ray spread as we approach keeps the horizon curving rather than
  // ballooning, which is what makes the dive read as descent and not as zoom.
  float fov = mix(0.42, 1.05, clamp((uDist - 1.02) / 2.2, 0.0, 1.0));
  vec3 ro = vec3(0.0, 0.0, uDist);
  vec3 rd = normalize(vec3(uv * fov, -1.0));

  // Place the camera above (uLat, uLon) by rotating the ray, not the world.
  //
  // Mind the convention: GLSL's mat3(...) takes *columns*, so rotX/rotY above
  // are the transpose of the same numbers written out as rows. Working through
  // it column-major, rotX(-lat) applied to (0,0,d) gives (0, d·sin(lat),
  // d·cos(lat)), and rotY(90° - lng) then swings that to
  // (d·cos(lat)·cos(lng), d·sin(lat), d·cos(lat)·sin(lng)) — exactly the vector
  // unitToLatLng maps back to (lat, lng). Get the convention wrong and the
  // camera lands on the antipode, which is how the first two attempts at this
  // dived into the South Pacific.
  mat3 cam = rotY(radians(90.0 - uLon)) * rotX(radians(-uLat));
  ro = cam * ro;
  rd = cam * rd;

  float b = dot(ro, rd);
  float c = dot(ro, ro) - 1.0;
  float disc = b * b - c;

  vec3 col;
  float alpha = 1.0;

  if (disc > 0.0) {
    float t = -b - sqrt(disc);
    vec3 pos = ro + rd * t;
    vec3 n = normalize(pos);

    vec3 ll = unitToLatLng(n);
    vec2 tc = vec2((ll.y + 180.0) / 360.0, (90.0 - ll.x) / 180.0);
    vec3 tex = texture(uEarth, tc).rgb;
    float land = smoothstep(0.35, 0.65, tex.r);
    float coast = tex.g;

    // Ocean: shelf lightens toward land, deep water darkens away from it.
    vec3 shallow = uOcean * 1.55 + vec3(0.02, 0.06, 0.05);
    vec3 sea = mix(shallow, uOcean * 0.72, smoothstep(0.0, 0.45, coast));

    // Land: latitude drives the broad biome bands, noise breaks up the bands.
    float absLat = abs(ll.x) / 90.0;
    // One texel is ~20 km, so close in there is nothing left to sample; the
    // noise takes over as the texture runs out, which keeps the surface from
    // flattening into one colour on the final approach.
    float closeness = clamp((3.2 - uDist) / 1.9, 0.0, 1.0);
    float terrain = mix(fbm(n * 9.0), fbm(n * 46.0), closeness * 0.85);
    vec3 arid   = uLand * vec3(1.45, 1.24, 0.70);
    vec3 forest = uLand * vec3(0.72, 1.05, 0.66);
    vec3 tundra = uLand * vec3(1.02, 1.06, 1.00);
    vec3 ground = mix(forest, arid, smoothstep(0.12, 0.34, absLat) * (1.0 - smoothstep(0.42, 0.62, absLat)));
    ground = mix(ground, tundra, smoothstep(0.58, 0.78, absLat));
    ground = mix(ground * 0.86, ground * 1.16, terrain);
    ground = mix(ground, ground * 1.32, smoothstep(0.25, 0.9, coast) * 0.55);

    // Ice caps, following the coastline distance so they are not a hard band.
    float ice = smoothstep(0.80, 0.93, absLat);
    ground = mix(ground, vec3(0.93, 0.96, 0.98), ice);
    sea    = mix(sea, vec3(0.80, 0.88, 0.93), smoothstep(0.86, 0.96, absLat));

    col = mix(sea, ground, land);

    // Sun from the upper right, sweeping slowly. uNight scales how much of the
    // terminator shows — at street level the sun is effectively overhead.
    vec3 sun = normalize(vec3(cos(uTime * 0.05) * 0.7 + 0.5, 0.55, 0.75));
    float day = mix(1.0, 0.18 + 0.82 * smoothstep(-0.08, 0.42, dot(n, sun)), uNight);
    col *= day;

    // Specular, ocean only — land has no business glinting.
    vec3 h = normalize(sun - rd);
    col += (1.0 - land) * pow(clamp(dot(n, h), 0.0, 1.0), 48.0) * 0.30 * day;

    // Rim: atmosphere seen edge-on through more air.
    float rim = pow(1.0 - clamp(dot(n, -rd), 0.0, 1.0), 3.0);
    col += uAtmo * rim * 0.75;

    // Destination marker — a ring that blooms open on the surface.
    if (uMark > 0.001) {
      vec3 m = vec3(cos(radians(uMarkLL.x)) * cos(radians(uMarkLL.y)),
                    sin(radians(uMarkLL.x)),
                    cos(radians(uMarkLL.x)) * sin(radians(uMarkLL.y)));
      float ang = acos(clamp(dot(n, normalize(m)), -1.0, 1.0));
      float scale = clamp((uDist - 1.0) / 2.2, 0.10, 1.0);   // shrink as we close
      float ring = smoothstep(0.055 * scale, 0.026 * scale, abs(ang - (0.030 + 0.045 * uMark) * scale));
      float core = smoothstep(0.013 * scale, 0.005 * scale, ang);
      col = mix(col, vec3(1.0), clamp(ring * 0.70 + core * 0.85, 0.0, 1.0) * uMark);
    }
  } else {
    // Space: the glow around the limb, plus a sparse starfield.
    float d = length(uv);
    float limb = 1.0 / max(0.10, uDist);
    float glow = exp(-max(0.0, d - limb * 0.42) * 7.0);
    col = uAtmo * glow * 0.55;

    vec3 sdir = normalize(vec3(uv, -1.0));
    float star = pow(hash(floor(sdir * 340.0)), 220.0);
    col += vec3(star) * (1.0 - glow) * 0.75;
    alpha = 1.0;
  }

  // Gentle filmic curve, then gamma. The curve lifts midtones hard, which
  // drains colour as the lighting flattens — so pull saturation back toward
  // the mean by the same amount the terminator was faded out.
  float lumv = dot(col, vec3(0.2126, 0.7152, 0.0722));
  col = mix(vec3(lumv), col, 1.0 + (1.0 - uNight) * 0.30);
  col = col / (col + 0.82);
  fragColor = vec4(pow(clamp(col, 0.0, 1.0), vec3(1.0 / 2.2)), alpha);
}`;

function compile(gl, type, src) {
  const sh = gl.createShader(type);
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(sh);
    gl.deleteShader(sh);
    throw new Error(`globe shader: ${log}`);
  }
  return sh;
}

const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

/** Shortest signed distance between two longitudes, in degrees. */
function lonDelta(from, to) {
  let d = ((to - from + 540) % 360) - 180;
  return d;
}

/**
 * Mount the globe on a canvas.
 *
 * `onFail` fires when WebGL2 is unavailable so the caller can fall back —
 * headless browsers, ancient hardware and some locked-down enterprise builds
 * all land there, and a black rectangle would be worse than a static panel.
 */
export function createGlobe(canvas, { texture, palette, reducedMotion = false, onFail } = {}) {
  const gl = canvas.getContext("webgl2", { antialias: false, alpha: false, powerPreference: "low-power" });
  if (!gl) {
    onFail?.(new Error("WebGL2 unavailable"));
    return null;
  }

  let program;
  try {
    program = gl.createProgram();
    gl.attachShader(program, compile(gl, gl.VERTEX_SHADER, VERT));
    gl.attachShader(program, compile(gl, gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw new Error(gl.getProgramInfoLog(program));
    }
  } catch (err) {
    onFail?.(err);
    return null;
  }
  gl.useProgram(program);

  const u = Object.fromEntries(
    ["uRes", "uTime", "uEarth", "uLon", "uLat", "uDist", "uOcean", "uLand", "uAtmo", "uNight", "uMark", "uMarkLL"]
      .map((n) => [n, gl.getUniformLocation(program, n)])
  );

  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  // 1×1 ocean-blue placeholder so the first frames are a plausible planet
  // rather than a black disc while the real texture decodes.
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, 1, 1, 0, gl.RGB, gl.UNSIGNED_BYTE, new Uint8Array([20, 60, 90]));
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.uniform1i(u.uEarth, 0);

  let textureReady = false;
  if (texture) {
    const img = new Image();
    img.decoding = "async";
    img.onload = () => {
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, img);
      textureReady = true;
    };
    img.onerror = () => { textureReady = false; };  // stays on the placeholder
    img.src = texture;
  }

  const setPalette = (p) => {
    gl.useProgram(program);
    gl.uniform3fv(u.uOcean, p.ocean);
    gl.uniform3fv(u.uLand, p.land);
    gl.uniform3fv(u.uAtmo, p.atmo);
  };
  setPalette(palette);

  // ── camera ────────────────────────────────────────────────────────────────
  const cam = { lon: 74, lat: 16, dist: 3.2, night: 1, mark: 0, markLat: 0, markLon: 0 };
  let flight = null;
  let raf = 0;
  let running = true;
  const t0 = performance.now();

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(1, Math.round(canvas.clientWidth * dpr));
    const h = Math.max(1, Math.round(canvas.clientHeight * dpr));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
      gl.viewport(0, 0, w, h);
    }
  }

  function frame(now) {
    if (!running) return;
    resize();
    const secs = (now - t0) / 1000;

    if (flight) {
      const t = Math.min(1, (now - flight.start) / flight.ms);
      const e = easeInOut(t);
      cam.lon = flight.fromLon + flight.dLon * e;
      cam.lat = flight.fromLat + (flight.toLat - flight.fromLat) * e;
      // Distance eases on its own curve, biased late, so the descent
      // accelerates as it closes — the way falling actually looks.
      cam.dist = flight.fromDist + (flight.toDist - flight.fromDist) * (e * e * (3 - 2 * e));
      cam.night = flight.fromNight + (flight.toNight - flight.fromNight) * e;
      // Blooms on approach to show where we are heading, then dissolves as we
      // arrive: close in it is a milky disc over the very thing it points at,
      // and the map's own pin takes the job from here.
      cam.mark = flight.marker ? Math.sin(t * Math.PI) : Math.max(0, 1 - t * 1.6);
      if (t >= 1) {
        const done = flight.onDone;
        flight = null;
        done?.();
      }
    } else if (!reducedMotion) {
      cam.lon += 0.028;   // ~1 revolution every 3.5 minutes
    }

    gl.useProgram(program);
    gl.uniform2f(u.uRes, canvas.width, canvas.height);
    gl.uniform1f(u.uTime, secs);
    gl.uniform1f(u.uLon, cam.lon);
    gl.uniform1f(u.uLat, cam.lat);
    gl.uniform1f(u.uDist, cam.dist);
    gl.uniform1f(u.uNight, cam.night);
    gl.uniform1f(u.uMark, cam.mark);
    gl.uniform2f(u.uMarkLL, cam.markLat, cam.markLon);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    raf = requestAnimationFrame(frame);
  }
  raf = requestAnimationFrame(frame);

  return {
    /** Turn slowly, seen from orbit. */
    roam() {
      flight = null;
      cam.mark = 0;
    },
    /**
     * Fly to a coordinate and descend to it. Resolves when the camera arrives,
     * which is the caller's cue to hand over to the real map.
     */
    diveTo({ lat, lng, ms = 2400 } = {}) {
      return new Promise((resolve) => {
        cam.markLat = lat;
        cam.markLon = lng;
        flight = {
          start: performance.now(),
          ms: reducedMotion ? 1 : ms,
          fromLon: cam.lon,
          fromLat: cam.lat,
          dLon: lonDelta(cam.lon, lng),   // always the short way round
          toLat: lat,
          fromDist: cam.dist,
          // ~1900 km up: close enough to read as arrival, far enough that
          // the texture still has detail to show. Diving to 1.03 put the
          // camera 200 km up, where one texel filled a fifth of the screen.
          toDist: 1.28,
          fromNight: cam.night,
          // Not 0: killing the terminator outright leaves the surface evenly
          // lit, and with no shadows anywhere the planet reads as a flat wash
          // by the bottom of the descent.
          toNight: 0.45,
          marker: true,
          onDone: resolve,
        };
      });
    },
    /** Climb back to orbit. */
    ascend(ms = 900) {
      return new Promise((resolve) => {
        flight = {
          start: performance.now(),
          ms: reducedMotion ? 1 : ms,
          fromLon: cam.lon, dLon: 0,
          fromLat: cam.lat, toLat: cam.lat,
          fromDist: cam.dist, toDist: 3.2,
          fromNight: cam.night, toNight: 1,
          marker: false,
          onDone: resolve,
        };
      });
    },
    setPalette,
    get ready() { return textureReady; },
    get camera() { return { ...cam }; },
    destroy() {
      running = false;
      cancelAnimationFrame(raf);
      gl.deleteTexture(tex);
      gl.deleteProgram(program);
      const lose = gl.getExtension("WEBGL_lose_context");
      lose?.loseContext();
    },
  };
}

/** Globe colours per theme. Kept here so the shader takes plain vec3s. */
export const GLOBE_PALETTE = {
  light: { ocean: [0.06, 0.24, 0.40], land: [0.34, 0.52, 0.36], atmo: [0.35, 0.66, 0.95] },
  dark:  { ocean: [0.03, 0.14, 0.26], land: [0.24, 0.40, 0.29], atmo: [0.22, 0.55, 0.85] },
};
