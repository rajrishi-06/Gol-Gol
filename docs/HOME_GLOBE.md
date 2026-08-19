# The globe on the home screen

The idle half of the home screen is the Earth, seen from orbit and turning.
Choosing a pickup flies the camera to that coordinate and descends to it; the
map picker only mounts once the camera has arrived, so the move from orbit to
street reads as one continuous descent rather than a cut.

## Why it is not a map

The obvious build is Google Maps in satellite mode at low zoom. Two things ruled
it out:

1. **A globe needs vector rendering and a Map ID.** `moveCamera`, tilt and
   heading are unavailable on raster maps, and at low zoom a raster satellite map
   is a flat Mercator sheet, not a planet. Getting a real globe means a Cloud
   console Map ID and a vector map — configuration this project does not have.
2. **It could not be tested.** There is no Maps API key in this environment, so
   nothing about the animation could be verified. Building something unverifiable
   for a request that came with "test it end to end until the goal is reached"
   would have been the wrong trade.

The idle screen is also where the app spends most of its time. Rendering it
locally means no map tiles are billed for a screen nobody has interacted with
yet.

## How it works

```
scripts/bake-earth.mjs   Natural Earth 50m coastlines → public/earth.png
src/lib/globe.js         WebGL2 raymarcher + camera
src/components/IdleGlobe.jsx   React wrapper, exposes diveTo()
src/components/GetRide.jsx     owns the hand-off to the map picker
```

### The texture

`scripts/bake-earth.mjs` rasterises `world-atlas`'s 50m land polygons into a
2048×1024 equirectangular RGB PNG:

| Channel | Holds |
|---|---|
| R | land mask |
| G | distance from the coastline, in and out — continental shelf offshore, interior shading inland |
| B | unused |

Filling the polygons is a scanline pass in plain JS, and the PNG is written with
Node's `zlib` — a native canvas dependency for one build step was not worth it.
A point is land when it falls inside an odd number of rings, which handles
lakes-inside-islands for free; the result is 28.9% land against a true figure of
29.2%.

**Terrain noise is generated in the shader, not baked.** Noise is incompressible:
carrying it in the PNG cost 2.6 MB of the 2.9 MB the first version weighed. Rows
are encoded with the `Up` filter, since this data is strongly coherent down
columns. The asset is 265 KB.

`world-atlas` and `topojson-client` are devDependencies. Nothing at runtime
depends on them — the app ships the PNG.

### The renderer

A single fragment shader over one oversized triangle. Every pixel casts a ray at
a unit sphere; the hit point converts straight to lat/lng, which samples the
texture. No geometry, no 3D library, about 7 KB.

That buys a perfect silhouette at any size and an atmosphere integrated along the
ray rather than composited as a sprite. It also means the "camera" is three
uniforms — longitude, latitude, distance — and flying to a coordinate is just
interpolating them.

**Mind the convention.** GLSL's `mat3(...)` takes *columns*, so a rotation matrix
written out as rows is transposed from what it looks like. Getting this wrong
puts the camera on the antipode: two attempts at the descent landed in the South
Pacific before a test caught it. Reasoning about it on paper produced both wrong
answers; the check that found the bug aims the camera at known coordinates and
reads the pixel underneath.

### The descent

`diveTo({lat, lng})` interpolates longitude the short way round, latitude
directly, and distance on its own curve biased late so the descent accelerates as
it closes. It resolves when the camera arrives, which is `GetRide`'s cue to mount
the picker.

Three details that matter:

- **It stops at 1.28 radii**, roughly 1800 km up. One texel is about 20 km, so
  descending to 200 km left a single texel filling a fifth of the screen. Noise
  frequency also rises with closeness, so the surface does not flatten into one
  colour on the way down.
- **The terminator fades to 0.45, not 0.** Killing it outright leaves the surface
  evenly lit, and with no shadows anywhere the planet reads as a pale wash.
- **The marker blooms and dissolves.** It peaks mid-flight, where it shows where
  you are heading, and fades out on arrival — close in it was a milky disc over
  the very thing it pointed at, and the map's own pin takes over from there.

The picker opens on the coordinate the globe landed on. With no pickup set that
is Bengaluru, not `0, 0` — the globe used to dive somewhere and the map opened
somewhere else.

## Fallbacks

- **No WebGL2** — `createGlobe` returns null and the component renders a static
  panel. A black rectangle would be worse.
- **`prefers-reduced-motion`** — no idle rotation, and the descent collapses to a
  single frame.
- **Texture still loading** — the sphere renders against a 1×1 ocean-blue
  placeholder, so the first frames are a plausible planet rather than a black disc.

## Verifying it

```
node /path/to/globe-geo.mjs     # camera aimed at known coordinates
node /path/to/globe-check.mjs   # the descent, in the real app
```

The geography check aims the camera at eight known coordinates and reads the
pixel under it — Bengaluru, the Sahara, the Amazon and Siberia must read as land;
the mid-Pacific, mid-Atlantic, Indian Ocean and Bay of Bengal as ocean. It votes
over a grid rather than one pixel, because the exact centre is where the marker
is drawn and sampling it reported central Siberia as ocean.

An earlier version of this check watched the screen while the picker was mounting
and mistook the loader's green logo for a continent. Testing the module directly
is what makes it trustworthy.
