# Otter companion assets

Three original Blender-authored companions live separately from the feeding
seals. `build_otters.py` generates only `public/otters` and the otter source and
preview files in this directory.

```sh
/Applications/Blender.app/Contents/MacOS/Blender --background --python-exit-code 1 --python blender/build_otters.py
```

Run from the project directory. The deterministic build writes three GLBs,
three 640-pixel portraits, `public/otters/manifest.json`, the verification
report, contact sheet, family preview, and editable `otter-family.blend`.
All coat and eye images are packed into both the GLBs and the Blender source.

## Companions

| ID | Name | Species | Age | Native pose |
| --- | --- | --- | --- | --- |
| `sea-otter-adult` | 贝贝 | 海獭 | 成体 | Floating on its back, holding a scallop |
| `sea-otter-pup` | 栗子 | 海獭 | 幼崽 | Smaller plush body and rounder head, holding a scallop |
| `river-otter` | 豆豆 | 水獭 | 少年 | Low body over four paws, long tapered tail |

The sea otters have broad webbed hind paws, five curled front fingers, short
tapered tails, small rounded ears, pale faces and brown coats. The river otter
has shorter walking legs, five little toes on each paw, a light chin, and a
long muscular tail. The body and muzzle are continuously sculpted surfaces.

## Animation contract

- All game coordinates use Y up and +Z toward the viewer.
- The sea-otter root is at the belly waterline: the belly faces +Y, the head is
  toward -Z, and the feet are toward +Z. Place the root near water Y=0.
  The eyes, nose, curled front paws and shell remain above the water surface.
- The river-otter root rests on the sand, all four paws reach Y=0, its head
  points +Z, and its tail points -Z. Ground animation using paw geometry.
- `Body`, `Head`, `Forepaw_L`, `Forepaw_R`, `Hindpaw_L`, `Hindpaw_R` and `Tail`
  are direct children of `Otter`. Sea otters also have a root-child `Shell`.
  Head and paw translations therefore share the same coordinate frame.
- `Eye_L` and `Eye_R` are children of `Head`. Scale their local Y axis to blink
  and restore their cached authored scale afterward. The recessed cornea,
  warm iris, pupil and soft catchlight move together without extra geometry.
- Sea-otter heads already rotate -0.82 radians around X to face upward and
  toward the viewer. Cache every authored joint transform before animation;
  add small rotations or local offsets relative to those transforms.
- The game insets both sea-otter shoulder attachments once before caching
  their resting pose. Keep this offset fixed while rotating the grooming paw
  so the limb cap stays inside the torso throughout the motion.
- Root scale is 1. Each GLB normalizes duplicate Blender suffixes on joint
  names. There are no skins, skeletons, exported lights or cameras.

## Native bounds

| Asset | X | Y | Z |
| --- | --- | --- | --- |
| Adult sea otter | -0.585 to 0.585 | -0.330 to 0.574 | -1.532 to 1.491 |
| Sea-otter pup | -0.505 to 0.505 | -0.255 to 0.593 | -1.347 to 1.246 |
| River otter | -0.471 to 0.471 | 0.000 to 0.995 | -2.292 to 1.310 |

The verification report stores full-precision bounds, every joint transform,
file sizes, primitive counts and embedded texture counts. The two sea otters
use 18 material primitives each; the river otter uses 15. GLBs are approximately
1.6 MB each, with six embedded textures: three fur colors, shared fur normals,
iris color and a restrained catchlight. All textures are 256 pixels square.

## Visual review

`otter-family-contact-sheet.png` compares all three individual portraits.
`otter-family-preview.png` shows the complete group. The saved Blender scene
includes the studio camera, floor and lighting used for these renders, with a
relative preview output path. Studio objects are excluded from game exports.
