# FNF Arrow Playground — Phase 1.5

A clean, white, Friday Night Funkin'-inspired note interaction prototype: **downscroll**, **tap notes**,
**hold notes** (head + tiling sustain + end cap), **note splashes** and a 3-stage **hold cover**
(start → hold loop → end). No chart, no music, no scoring: a visual + input-system foundation.

**Play:** https://yahahahau.github.io/FNF-game/ (GitHub Pages, deployed by the workflow in `.github/workflows`).

```bash
npm install
npm run dev      # http://localhost:5173
npm test         # 54 headless logic tests
npm run build    # -> dist/
```

Add `?debug` to the URL to draw the hitboxes.

## Controls

| Lane  | Keys            | Touch / mouse |
|-------|-----------------|---------------|
| Left  | Arrow Left / A  | the whole lane is the hitbox |
| Down  | Arrow Down / S  | |
| Up    | Arrow Up / W    | |
| Right | Arrow Right / D | |

A built-in demo plays on load (taps in every lane, short holds, long holds, simultaneous holds).
Buttons: **ARROW SFX** (saved), **VOL**, **SPEED** (saved), **PAUSE DEMO**, **RESTART**.

## Gameplay rules implemented

* **Downscroll**: `y = receptorY − (noteTime − now) × pxPerMs`; notes spawn above the top edge and move down.
  Movement is derived from an elapsed-time clock, so it is frame-rate independent.
* **Tap**: press within ±150 ms → receptor `confirm` + directional splash, note removed. A press with no note is a plain `press` (ghost tap).
* **Hold**: head hit → splash → cover START → cover HOLD (loop) → tail reaches the receptor → cover END (+ receptor confirm pop) → idle.
  The hold is **not** auto-completed: the key must stay down. Releasing early interrupts the cover immediately
  (no END), shows `HOLD DROPPED`, and the greyed tail keeps scrolling. Releasing within 100 ms of the end still counts.
* Splash happens **at the head**, never at the end. Splashes are pooled (cap 6) and removed when finished.
* Input: keyboard, mouse, multi-touch; `pointerup`/`pointercancel`/`keyup`/blur/tab-hide always release (no stuck arrows).

## Sprites and licensing

This repository contains **no assets from `FunkinCrew/funkin.assets`** (all rights reserved, not redistributable).
All sprites are **original placeholders generated in code** (`src/PlaceholderAssets.js`), packed into real Sparrow XML
atlases at startup, and keep the official *structure*: strumline `static/press/confirm/confirmHold`, 2 splash variants per
direction, cover `start/hold/end`, note heads and sustain body/cap, with the same per-direction colours
(purple, blue, green, red). The press sound is synthesised with the Web Audio API.

To use your own (properly licensed) art: host a folder containing `notestyle.json` and the atlases it references, then open
`?pack=<folder url>`. Atlases can be Sparrow XML (+PNG) or JSON hash/array (+PNG). Any group that is missing or incomplete falls back to the placeholder.

```jsonc
// notestyle.json  (same layout as the official note style "assets" block)
{ "assets": {
  "noteStrumline": { "assetPath": "strumline", "scale": 0.35, "offsets": [0,0],
    "data": { "leftStatic": {"prefix":"staticLeft","frameRate":24}, "leftPress": {...}, "leftConfirm": {...}, "leftConfirmHold": {...}, /* down/up/right … */ } },
  "noteSplash":    { "assetPath": "splash", "scale": 0.67, "alpha": 0.95, "data": { "enabled": true, "framerateDefault": 24, "framerateVariance": 2,
                     "leftSplashes": [{"prefix":"splashPurpleA"},{"prefix":"splashPurpleB"}], /* … */ } },
  "note":          { "assetPath": "notes", "scale": 0.35, "data": { "left": {"prefix":"noteLeft"}, /* … */ } },
  "holdNote":      { "assetPath": "sustains", "scale": 0.35, "data": { "left": {"body":{"prefix":"holdBodyLeft"},"end":{"prefix":"holdEndLeft"}}, /* … */ } },
  "holdNoteCover": { "scale": 1, "offsets": [0,0], "data": { "enabled": true,
                     "left": {"assetPath":"holdCoverPurple","start":{"prefix":"..."},"hold":{"prefix":"..."},"end":{"prefix":"..."}}, /* … */ } }
} }
```

## Structure

```
src/AssetLoader.js          atlas parsing (Sparrow/JSON), caching, user packs, fallback
src/PlaceholderAssets.js    original procedural sprite pack
src/ArrowAnimation.js       frame animation controller (static/press/confirm/splash/cover, callbacks)
src/ArrowController.js      receptor state machine
src/ScrollController.js     clock, speed, downscroll mapping
src/NoteController.js       spawning, hit detection, hold state machine, pooling, drawing
src/TapNote.js / HoldNote.js / SustainTrail.js
src/SplashEffect.js         pooled splashes
src/HoldCoverController.js  start → hold loop → end / interrupt
src/HitboxController.js     keyboard + mouse + multi-touch
src/AudioController.js      synthesised click, ON/OFF + volume (localStorage)
src/TestNoteGenerator.js    hard-coded demo pattern (not a chart system)
```

"Friday Night Funkin'" is a trademark of The Funkin' Crew Inc.; this is an unofficial fan prototype, not affiliated with or endorsed by them.
Code: MIT (see `LICENSE`).
