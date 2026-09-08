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
- `Head` is a movable pivot at the base of the head.
- `Flipper_L` and `Flipper_R` pivot at the front-flipper shoulders.
- `Eye_L` and `Eye_R` contain the eyes and catchlights. Scale their local Y axis
  for blinking in the exported glTF, restoring the cached base scale afterward.
- `Jaw` is a small lower-chin pivot for feeding animation.
- `RearFlipper_L` and `RearFlipper_R` are separate paired hind flippers.
- Cache node transforms immediately after loading. The meshes have local
  offsets around their pivots; do not recenter child geometry.
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

The models deliberately favor soft, readable expressions for a touch game.
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
properties, embedded color and normal textures, plus vertex colors on facial
cushions and eyelids.
