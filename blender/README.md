# Seal family assets

Eight original seals modeled and rendered in Blender 5.2.1. All geometry, coat
patterns, materials, and portraits are generated locally by `build_seals.py`.
The editable scene is `seal-family.blend`; no external model files are used.

## Rebuild

```sh
/Applications/Blender.app/Contents/MacOS/Blender --background --python blender/build_seals.py
```

Run from the project directory. The script is deterministic and writes eight
GLBs, eight portrait PNGs, and the manifest into `public/models`, then saves the
editable Blender scene and a family render in this directory.

## Game contract

- Browser URLs are `/models/seal-<id>.glb` and `/models/portrait-<id>.png`.
- glTF axes: Y up, positive Z forward. The origin is the waterline.
- Visible height is approximately 2 units. The lower body extends below zero.
- `Head` is an ordinary movable pivot at the base of the long neck collar.
  Its glTF position is `(0, head_z - 0.36, 0.10)`, with Y between 1.07 and
  1.12 across the family. The collar overlaps the shoulder during head turns.
- `Body` is an ordinary pivot at `(0, 0.35, -0.14)`. It contains the torso
  mesh, named `Body_sculpted_torpedo_torso` in the GLB. A small scale change
  provides breathing or a soft belly squash without moving the facial pivots.
- `Flipper_L` and `Flipper_R` pivot at the front-flipper shoulders.
- `Eye_L` and `Eye_R` contain the wet almond-shaped eyes. Scale their local Y axis
  for blinking in the exported glTF, restoring the cached base scale afterward.
  The skull has shallow orbital recesses, and the thin corneal surfaces follow
  those recesses with a restrained highlight instead of projecting outward.
  Shared 256-pixel textures provide a warm dark-brown iris, near-black pupil,
  and a small feathered corneal catchlight that remains visible without an
  environment map. The catchlight is part of the eye surface, so it follows
  head motion and blinking without separate highlight geometry. The eye opening
  is 10% narrower and 6% shorter than the original; every pivot is unchanged.
- `Jaw` is a small lower-chin pivot for feeding animation.
- `RearFlipper_L` and `RearFlipper_R` are separate paired hind flippers.
- Cache node transforms immediately after loading. The meshes have local
  offsets around their pivots; do not recenter child geometry.
- All meshes remain unskinned and can be copied with `scene.clone(true)`.
  For a prone beach pose, a root X rotation near 1.48 radians and a relative
  `Head` X rotation near -1.38 radians keep the face looking forward. Ground
  the pose using torso vertices; separately fold the rear flippers into a
  relaxed position. Adjust the body roll for individual lounging poses.
- Blender source suffixes duplicate object names to keep them unique globally.
  The exporter normalizes each independent GLB to the exact pivot names above.

## Species and ages

| ID | Individual | Species | Age |
| --- | --- | --- | --- |
| harbor-pup | 团团 | 港海豹 | 幼崽 |
| harbor-adult | 芝麻 | 港海豹 | 成体 |
| harp-pup | 糯米 | 竖琴海豹 | 白衣幼崽 |
| harp-adult | 月牙 | 竖琴海豹 | 成体 |
| grey-juvenile | 石头 | 灰海豹 | 少年 |
| grey-adult | 礁岩 | 灰海豹 | 成体 |
| ringed-adult | 涟漪 | 环斑海豹 | 成体 |
| weddell-elder | 阿沧 | 威德尔海豹 | 长者 |

The models combine soft, readable expressions with a longer blended neck,
sculpted cheeks and forehead, smaller almond-shaped wet eyes, subtle eyelids,
three rows of tapered sensory whiskers, brow whiskers, and finely porous noses.
They retain true-seal anatomy: no external ears, small front flippers, and paired
rear flippers. Coat spots, open rings, a whitecoat pup, a dark adult harp-seal
head, and age-dependent proportions distinguish the individuals.

## Visual checks

`seal-family-preview.png` shows the complete studio family, and
`seal-family-contact-sheet.png` compares all eight individuals in manifest order.
Individual portraits
in `public/models` show front-three-quarter faces and flipper silhouettes.
The source includes the studio lighting, floor, and camera; these are excluded
from the exported GLBs. Exported materials use standard glTF physical material
properties, embedded 512-pixel coat and directional fur-normal textures, a
shared 128-pixel facial detail normal, plus vertex colors on facial cushions
and eyelids. The two shared eye textures add approximately 75 KB per GLB and
use the existing eye material, preserving the material primitive count.
Small low-contrast organic markings replace the broad painted
spots, and the whitecoat pup has a warmer ivory coat. Static facial meshes
are combined by material to keep the browser draw-call cost small.

`asset-verification.json` is regenerated from the exported files during every
build. It records file sizes, material primitive counts, neutral-pose bounds,
required animation pivots, and embedded image counts.
