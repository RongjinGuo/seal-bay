# Otter Friends Implementation Plan

**Goal:** Add two floating sea otters and one pettable river otter to the existing bay, and explain or enable visitor statistics according to the user's preference.

**Architecture:** Keep the eight feeding seals and five roaming seals intact. Load a separate Blender-authored otter manifest, render the three companions through an independent resident module, and combine only eligible land residents for the existing petting system. Sea otters float on their backs and hold shells; the river otter has four little paws, a tapered tail and a gentle shoreline walk. Existing sparse dialogue and the selected seal recording remain separate.

**Tech Stack:** Blender, GLB, Three.js, Vite, Node test runner, Playwright.

## Tasks

- [x] Build three original otter GLBs with distinct anatomy, natural small eyes, animation pivots, portraits, verification report and an editable Blender scene. Inspect in game lighting.
- [x] Test and implement the companion resident module: separate motion, stable pause, care pose and resume, grounded river otter, waterline support and immutable snapshots.
- [x] Integrate companion loading, animation lifecycle, river-otter petting and a separate companion section in the field guide. Keep feeding species and saved completion counts intact.
- [x] Confirm whether existing information can establish game visits. Present accurate counting options and implement only the user's selected statistics option; do not imply historical records exist.
- [x] Verify new residents and interactions on desktop/mobile, run existing feeding/audio/petting/roaming/speech regressions, build and inspect the result.
- [x] Update local preview, deploy to the existing GitHub Pages URL, and verify published models and behavior.

## Model Contract

- Separate assets: `public/otters/manifest.json` with `otters` array; entries `sea-otter-adult` (海獭, 贝贝), `sea-otter-pup` (海獭, 栗子), `river-otter` (水獭, 豆豆). Metadata includes name, species, age, description, file and portrait.
- glTF coordinates are Y-up, with viewer-facing direction +Z. Sea otters are authored lying on their backs: root at the belly center, belly facing +Y, head toward -Z, face tilted toward +Z, feet toward +Z. Their lower body may extend below Y=0; runtime positions the root close to the waterline.
- River otter is authored on four paws with feet near Y=0, head toward +Z and tail toward -Z. Its root rests on the sand.
- Named joints: `Body`, `Head`, `Eye_L`, `Eye_R`, `Forepaw_L`, `Forepaw_R`, `Hindpaw_L`, `Hindpaw_R`, `Tail`; sea otters additionally have `Shell`. Eye local Y scales for blink. Store and restore initial joint transforms.
- Final layout: sea otters near (-3.6, -11.2) and (4.6, -10.8), both at 1.5 scale and diagonal headings; river otter near (4, -15.5), scale 1.35, heading 0.15 radians. The river stroll spans 0.25 meters with small turns, leaving space for its long tail and the existing seal routes.

## Verification Notes

- Three original GLBs, packed editable Blender scene and portraits inspected in studio and actual Three.js lighting. Original seal assets and selected audio are byte-identical to the previous release.
- All 106 logic tests pass, including 16 resident tests; production build succeeds. Close-up grooming confirms the fixed inset shoulders remain attached. Actual GLB paw, torso and tail clearance was sampled throughout a 48-second river motion cycle.
- No game analytics exists. The optional preference question remains unanswered, so no third-party tracker is configured; repository Traffic is not presented as game visits.
- All seven production-preview browser suites passed (40 named checks) across desktop and mobile. The initial fast-throw input timing failure passed on native-input rerun; gameplay physics was unchanged. The otter harness uses varying seeded randomness after loading so deterministic requests cannot duplicate Three.js resource UUIDs. Final screenshots show correct coats and heart feedback.
- The local preview is refreshed. Release `21dbdd1` deployed successfully in GitHub Actions run `34598931355`. Live mobile verification loaded all eight seals and three otters, confirmed separate 8+3 guide cards and a visible river-otter petting target, and reported no browser errors. The live entry is `index-Ba_8jR-u.js`.
