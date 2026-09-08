# Natural Eyes And Quieter Speech

**Goal:** Replace featureless black eyes with smaller, warm, expressive eyes and let seals speak occasionally without filling the bay with dialogue.

**Visual direction:** Preserve recessed eyes and seal anatomy. Add restrained brown iris detail, a dark pupil and small feathered corneal reflections directly to the eye surface. All eight Blender assets, portraits and the editable scene stay synchronized; blinking and prone beach poses retain their pivots.

**Speech direction:** Only one water visitor can speak at once. Each speech reserves a 2.6-active-second slot, followed by twelve to eighteen quiet seconds. A state change dismisses stale text early without shortening that shared cadence. Hungry and fed reactions remain eligible, and each visit can speak once. Ordinary name tags appear briefly on arrival. Patience indicators, the recorded seal call, petting requests and travel cues remain functional.

## Tasks

- [x] Update the Blender eye surfaces and rebuild all eight models, portraits and source scene; inspect eyes under both studio and actual game lighting.
- [x] Implement and test a pure speech scheduler for occasional dialogue, gaps, visitor lifetime, pause, state transitions and reset.
- [x] Integrate speech with visitor labels, quieter arrival names and the game lifecycle.
- [x] Verify real dialogue timing on desktop and mobile, inspect front and prone eye views, and re-run feeding, audio, petting and roaming checks.
- [x] Refresh the local preview, publish to GitHub Pages and verify the published assets and behavior.

## Verification

- All 90 unit tests pass, including 14 speech scheduler cases.
- The production build succeeds. All six browser suites pass on the production preview: feeding, audio, beach, petting, roaming and speech. Desktop and phone layouts show occasional real speech, at most one water bubble, brief names, pause/reset cleanup, and preserved care/travel cues with no browser errors.
- A roaming test's one-second startup assertion intermittently counted browser input latency. The test now freezes its clock around the real start/restart action and observes two frames before restoring real time. The original timing, continuity and interaction assertions remain unchanged.
- All eight GLBs, portraits, studio previews and the editable Blender scene are rebuilt. Front and prone views are inspected under the actual Three.js lighting. Pivots, non-eye geometry, neutral bounds and primitive counts remain unchanged; every texture is embedded or packed.
- Model and portrait requests carry a new revision query so returning players fetch the revised eyes from GitHub Pages.
- The selected recording still has SHA256 `68a48bffd0d8c0fe0f71ad06ba8775500a82f7976c19e437340ab85dd8d2863a`.
- Local preview refreshed at http://localhost:4173/. GitHub Pages deployment `34244777692` succeeded for feature commit `cf7e3c1`. The public entry loads `index-DUZwmKxi.js`; hashes of all eight published GLBs and eight portraits match the local files. A live browser loads all eight revised models, observes one natural speech at 14.12 active seconds, and reports no page or console errors.
