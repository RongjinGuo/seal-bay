# 海豹湾 / Seal Bay

Create a touch-first, Chinese-language Three.js game using original Blender-authored seal assets. The scene is a sunny mint-blue bay viewed from a timber feeding jetty. Warm cream panels and coral actions frame a full-screen 3D sea. Desktop mouse gestures mirror touch gestures. The experience is relaxing, with an optional timed feeding round and a field guide to seal visitors.

## Requirements

- Multiple true-seal species, young and old ages, coat patterns and individual faces. Soft anatomically informed bodies, short foreflippers, paired hindflippers, nostrils, muzzle and whiskers; no sea-lion ears or upright walking poses.
- A visible bucket of fish at the bottom of the screen. Start gestures in the lower feeding area and swipe upward to launch. Direction controls lateral aim. Normalized gesture velocity determines distance, with a visible trajectory and landing ring.
- Visitors emerge in separated random positions. After waiting they call; after a second timeout they look annoyed and dive. A catch plays a short eating and happy animation before departure. Ripples, splashes and floating hearts provide feedback.
- Real seal calls searched online, downloaded only where the license permits, attributed in project documentation and the in-game credits. Audio starts after user interaction, supports mute and stops while paused.
- Launch overlay, pause/resume, restart, controls/help, sound toggle, collection and round results. Layout adapts to narrow touch screens with no page scrolling.
- Editable Blender source and reproducible export script plus GLB assets loaded by Three.js. All runtime dependencies and audio/model assets served locally.

## Architecture and validation

Vite with native JavaScript modules, Three.js renderer, independent gesture and lifecycle rules, dedicated scene/effects and audio modules. Unit tests exercise velocity, direction, cancellation, lifecycle and catches. Browser verification covers loading, real gestures, feeding, calling, diving, mute, pause, restart and mobile composition. The game must have no runtime errors and a successful production build.
