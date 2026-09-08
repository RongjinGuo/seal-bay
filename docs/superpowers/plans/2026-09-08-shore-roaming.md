# Shore Roaming Implementation Plan

**Goal:** Seals swim to the beach and crawl back into the water, with a visible first journey around fifteen active seconds and much longer intervals thereafter.

**Architecture:** The existing five resident identities can occupy beach, water or travel habitats. A pure scheduler starts one journey at a time, alternating direction. The resident controller animates the same model continuously through the shallows, retains its individual appearance, and exposes settled beach seals to petting. Feeding visitors continue their independent hunger cycle.

**Timing:** The harbor adult begins the round swimming near the coast and heads to its vacant beach spot after fifteen seconds. Travel lasts twelve seconds. Later departures are forty-two to fifty-eight seconds apart, with a thirty-second minimum stay. Active petting requests, strokes and happy reactions prevent departure. No time accumulates during pause.

**Presentation:** The traveler turns toward its destination, swims with small rear-flipper strokes, settles onto the shallow seabed and crawls onto the sand. The reverse journey uses the same continuous path. Gentle wakes, a shoreline splash and a small following label make the change easy to notice. The model and its identity persist throughout.

## Tasks

- [x] Test and implement the pure schedule in `src/roaming-logic.js`: first departure, long intervals, minimum stays, busy/hidden residents, one traveler, pause and blocked retries.
- [x] Extend `src/beach-residents.js` with habitat state, continuous travel and swimming poses, supported shoreline transitions, events, reset and petting eligibility; verify geometry and model-resource preservation.
- [x] Connect start, pause, restart, home and results in `src/main.js`; add traveler labels and wake/splash effects without affecting feeding gestures or scoring.
- [x] Exercise natural first departures, both journey directions, continuity, pause, petting eligibility and layout in desktop and mobile browsers. Re-run feeding, audio, beach and petting checks.
- [x] Update the in-game guide and README; publish the verified game to GitHub Pages and verify the live journey.

## Acceptance

The first journey begins between twelve and eighteen active seconds on desktop and phone. Subsequent journeys never occur in a rapid sequence. Water seals can travel without requesting food. Beach residents return to water after a longer stay. A traveler does not teleport, change appearance, overlap another resident at its destination, or accept petting before settling on the beach. Pausing freezes movement and scheduling; restarting reproduces the opening arrangement with five resident identities and no duplicate labels or effects.

## Local Verification

- 76 unit tests pass, including exact joint-rotation continuity at arrival and shoreline contact throughout travel.
- Production build succeeds.
- The complete feeding, audio, beach, petting and roaming browser suites pass with no page or console errors.
- Natural first departures and complete incoming journeys pass on desktop and phone; the later reverse journey retains forty-two to fifty-eight second departure spacing.
- Compact portrait and landscape traveler labels remain onscreen and avoid header controls.
- Models and the selected seal-call recording are unchanged.

## Release Verification

- Implementation commit: `d01405b`.
- GitHub Pages deployment succeeded in workflow run `34236870064`.
- The published page serves `index-DKOkKcxj.js` and `index-DOtynC4J.css`, matching the tested local production build.
- The complete roaming browser suite passes on `https://rongjinguo.github.io/seal-bay/`: natural first journeys on desktop and phone, later beach-to-water travel, long intervals, continuity, pause/resume, petting eligibility, restart and home cleanup.
- The existing local game preview is refreshed and ready.
