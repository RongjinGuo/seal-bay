# Refined Seals And Living Beach Implementation Plan

**Goal:** Refine the existing eight Blender seals and add a visible sandy beach with resting and crawling residents on desktop and mobile.

**Architecture:** Preserve the feeding lanes and controls. Add a Three.js beach behind the catchable water area, and a separate resident controller that poses cloned GLB seals on the sand using simulation time. Share geometry and materials with water visitors, while keeping all animation transforms independent. Keep the user-selected 15–17 second recording intact.

**Tech Stack:** Blender Python, glTF, Three.js, Vite, Node tests, Chrome/Playwright, GitHub Pages.

## Visual Direction

Improve the existing soft natural style with a more continuous neck and body silhouette, detailed muzzle and eyelids, finer whiskers, and nuanced coat markings. A curved golden beach occupies the rear of the bay, with wet sand, shallow turquoise water, moving foam, shells, stones, and small dunes. Resting residents breathe, blink, and occasionally lift their heads. Crawling residents move with belly contractions and small front-flipper pulls; paired rear flippers trail behind.

## Tasks

- [x] Refine `blender/build_seals.py`, regenerate the eight GLBs and portraits, inspect the contact sheet, and validate animation pivots and portable Blender source.
- [x] Implement `src/beach-residents.js` with independent resident transforms and deterministic absolute-time animation. Verify resting, crawling, pause behavior, clone safety, beach bounds, and cleanup in `tests/beach-residents.test.js`.
- [x] Implement `src/beach.js` for sand geometry, a shared surface height function, shoreline foam, and restrained beach details. Integrate with `src/world.js` and `src/main.js`.
- [x] Inspect desktop and phone views; tune beach placement and prone poses so residents read clearly and do not obscure reachable feeding lanes.
- [x] Run unit tests, production build, existing browser feeding/audio tests, and new beach browser checks. Review changes and verify the exact audio is unchanged.
- [ ] Update project documentation, commit the verified result, publish through the existing Pages workflow, and verify the live game.

## Acceptance Checks

The eight species/age variants retain their identities and animation pivots. The rear beach is visible during play at 1440 × 900 and 390 × 844. At least two residents rest and two crawl; bodies stay on the sand and the motion stops on pause. Water visitors remain catchable with existing gestures. All assets load from the GitHub Pages subpath, and sound still uses the selected Bilibili excerpt at its original speed.

The user's follow-up identifies protruding eyes in the preview. Recess the sockets and visible eye domes, soften reflections, and inspect front and prone three-quarter views before publishing.

## Verified Result

All 31 unit tests and the production browser game, audio, and beach checks pass. Desktop and phone screenshots confirm the five sand residents remain visible. A 90-frame phone-layout sample on the development host has 16.7 ms median and 90th-percentile frame intervals; this is a local browser measurement, not a physical-phone benchmark. The final eyes use recessed sockets and softer reflections. The selected audio retains SHA-256 `68a48bffd0d8c0fe0f71ad06ba8775500a82f7976c19e437340ab85dd8d2863a`.
