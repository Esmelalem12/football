# 3D model assets

## `soccer_stadium/` — "Soccer Stadium" by nermin (CC-BY-4.0)

| | |
|---|---|
| Source | https://sketchfab.com/3d-models/soccer-stadium-062800b001b24d43bff73db4580bbc62 |
| Author | nermin — https://sketchfab.com/nermin |
| License | [CC-BY-4.0](http://creativecommons.org/licenses/by/4.0/) — author must be credited, commercial use allowed |
| Format | glTF 2.0 (`scene.gltf` + `scene.bin` + 12 PNG textures), Sketchfab export |
| Geometry | 107,470 triangles · 57 meshes · 17 materials |
| Size | ≈ 14 MB (4.2 MB geometry, 9.3 MB textures) |
| Native extents | ≈ 1313 × 263 × 1684 units (root node is rotated Y-up by Sketchfab) |

**Required credit** (copy wherever the model is shown — see `soccer_stadium/license.txt`):

> This work is based on "Soccer Stadium" (https://sketchfab.com/3d-models/soccer-stadium-062800b001b24d43bff73db4580bbc62)
> by nermin (https://sketchfab.com/nermin) licensed under CC-BY-4.0 (http://creativecommons.org/licenses/by/4.0/)

### Why this one and not the Studio Lab stadium?

The originally requested model (`football-stadium-soccer-stadium-f220069f…`, Studio Lab) is a **paid,
non-downloadable** asset (US$39 via Fab, "Standard" license, `isDownloadable: false`), so it cannot be
fetched or redistributed. This CC-BY alternative was chosen for a browser game: fully textured,
moderate triangle count, and a license that permits bundling in the repo with attribution.

## `viewer.html`

Standalone preview page (three.js r128 + `GLTFLoader.js`). Serve the repo root over HTTP and open
`/assets/models/viewer.html` — e.g. `python3 -m http.server 8000` then
http://localhost:8000/assets/models/viewer.html. Drag to orbit, wheel to zoom, right-drag to pan.

## `GLTFLoader.js`

`examples/js/loaders/GLTFLoader.js` from three.js **r128** (matches the bundled `three.min.js`),
MIT license © three.js authors. Needed to load `.gltf`/`.glb` files into the game's scene.
