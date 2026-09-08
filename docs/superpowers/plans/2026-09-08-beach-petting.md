# Beach Petting Implementation Plan

**Goal:** Beach seals request a grooming tool; dragging the matching tool onto the seal plays a gentle petting animation followed by hearts.

**Architecture:** A pure state machine schedules one visible seal request at a time. A dedicated pointer controller renders tool buttons, a projected request bubble, drag feedback and the automatic grooming stroke. The resident controller supplies world anchors and independent reaction poses. The main game connects completion to existing heart effects and audio.

**Tools:** Soft brush and petting mitten, with matching illustrated icons in the tray and request bubble. The first request occurs after six active seconds. Correct drops start a 1.2-second grooming stroke and then a happy reaction. Mismatched tools, wrong seals, empty-water drops and canceled gestures do not succeed.

## Tasks

- [x] Implement and test pure request timing, tool matching, cancellation, completion and cooldown in `src/petting-logic.js` and `tests/petting-logic.test.js`.
- [x] Extend `src/beach-residents.js` with world-space interaction anchors and petting/happy poses; test independent animation, pause and reset.
- [x] Build `src/petting.js` and `src/petting.css` for the responsive tool tray, projected requests, pointer capture, hit testing, and stroke feedback. Connect lifecycle and heart effects in `src/main.js`.
- [x] Verify real desktop and mobile tool dragging, wrong targets/tools, no accidental fish throws, pause during drag/stroke, request visibility and restart cleanup. Re-run existing feeding/audio/beach checks.
- [x] Update the game guide and README, publish the tested build to GitHub Pages, and verify the live petting interaction.

## Acceptance

Tools and requests remain readable at 1440 × 900 and 390 × 844. Success requires a matching active request and a drop on that seal; an ordinary click cannot complete it. The automatic stroke finishes before hearts appear. Petting freezes with pause and cleans up on restart, home and challenge completion. Calls still use the previously selected recording, and dragging a tool never launches a fish.

## Local Verification

- 54 logic and resident-pose tests pass.
- Production build succeeds.
- Feeding, audio, beach and petting browser suites pass with no console or page errors.
- Petting covers real desktop mouse, 390 x 844 touch input, 844 x 390 landscape and 320 x 568 compact-screen requests.
- The selected seal call remains byte-for-byte unchanged.

## Release Verification

- Implementation commit: `95feb1c`.
- GitHub Pages deployment succeeded in workflow run `34230899876`.
- The published page serves `index-CdfZQ2g9.js` and `index-B2RRGAOd.css`, matching the local production build.
- The complete petting browser suite passes on `https://rongjinguo.github.io/seal-bay/`, including both tools, real touch input, mouse input, delayed hearts, pause/restart, landscape and compact-screen layout.
- The existing local preview is refreshed and ready to play.
