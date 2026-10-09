# GrowIt hype video

`growit-hype.mp4`: 48 s, 1920×1080, 30 fps, H.264 + AAC.

Everything is generated in code: no stock footage and no still images panned or zoomed (no Ken Burns).

| Effect | Where | How |
|---|---|---|
| Fluid dynamics | Background in every scene | Stable-fluids Navier–Stokes solver (192×108, vorticity confinement), stepped once per frame; bursts on story beats |
| Smooth flow transitions | 10 s, 22 s, 36 s | Liquid-edge wipe with layered colour bands and shed droplets; the wipe also drags ink in the fluid solver |
| Vector graphic animation | Mic, lock, channel icons, connectors, cursor, check marks | Stroke-progress drawing of polylines |
| Typography / kinetic | Throughout | Per-letter mask reveals, slams with overshoot, slot-roll words, count-up, text that shatters into dots and becomes the logo |
| Jitter dots transitions | 4 s, 16 s, 30 s, 42 s | Hex halftone grid that grows with stepped jitter to cover the frame, then clears left to right (the GrowIt mark's dot language) |

The soundtrack (`music.py`) is synthesised at 120 BPM so cuts, slams, the lock click and the BLOCKED stamp land on the beat.

## Re-render
```
pip install numpy
cd media/hype-video && python music.py      # writes music.wav
NODE_PATH=$(npm root -g) node render.js full growit-hype.mp4 music.wav
NODE_PATH=$(npm root -g) node render.js preview 120,600,1300   # stills into prev/
```
Needs Node with Playwright (Chromium) and ffmpeg. Fonts: Inter Display (system), Noto Sans Kannada and Devanagari (`fonts/`, SIL OFL).

## Before posting
- The Kannada and Hindi copy in the asset grid (ಫಿಲ್ಟರ್ ಕಾಫಿ, 20% ರಿಯಾಯಿತಿ, ಭಾನುವಾರ ಮಾತ್ರ, फ़िल्टर कॉफ़ी, 20% छूट, सिर्फ़ रविवार…) should get a native-speaker check ([native-review](../../docs/native-review.md)).
- The scenario (Priya, ₹48 coffee, 18 assets, "6 change, 12 stay frozen") follows [demo-script](../../docs/demo-script.md). It shows how the product works, not measured results. No catch-rate numbers are shown because the fault-injection results aren't recorded yet.
