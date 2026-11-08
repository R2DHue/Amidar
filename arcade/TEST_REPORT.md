# Test report — Amidar arcade browser player (2026-11-07)

## Passed (automated, on the build box)
**Headless Node run** (`test/headless.js`, local private ROMs): 1500 frames ran in about 1 s
(roughly 25× real time). Frames captured along the way show:
- the white crosshatch test grid at boot;
- the attract mode ("THIS IS AMIDAR MOVEMENT", © KONAMI 1982, PUSH START BUTTON);
- after coin and start, gameplay with the yellow gorilla, green warriors, coconut dots, filled boxes,
  score and the JUMP counter.

Sound: both AY chips produce audio after the game starts. The main frequencies are around 270–450 Hz,
which is musical. No sound was output during the early attract frames (between 2 s and 11 s).

**Chrome headless with touch emulation** (`test/browser.cjs`):
- Load: the ROM-picker overlay appears; the user ZIP (17 files, including bootleg extras and the
  renamed sound ROMs 8.11d/9.9d) was accepted by CRC32.
- Display: the attract screen renders (non-black pixels); there are no page errors.
- Portrait 820×1180: the whole 224×256 screen is visible at integer 3× (672×768) with
  `image-rendering: crisp-edges/pixelated`. Jump is on the left, joystick on the right.
- Landscape 1180×820: the screen is at 3× and entirely visible, with Jump to the left of the screen
  and the joystick to the right.
- Touch input: tapping COIN then 1P START starts a game. Touch-dragging the stick right sets the
  arcade "right" input bit. A diagonal drag keeps exactly one direction active (strict 4-way).
- Controller (Gamepad API, simulated): D-pad up plus A sets the up and jump bits. Left stick
  (0.7, 0.3) is mapped to right.
- Saved ROM: after a page reload, the ROM loads from IndexedDB without picking the file again.

Screenshots: `test/screenshots/` (portrait-attract, portrait-play, landscape-play, headless-sequence).

## Not tested — needs a real iPad (parent / user)
- Real iPad Safari: touch feel, the audio unlock on first tap, and audio glitches or latency
  (ScriptProcessor + 150 ms buffer cap).
- Sustained 60 fps and battery use on the device.
- Pairing a real Xbox 1708 controller (button indices follow the standard mapping; Safari support
  should be confirmed on the device).
- Behaviour when added to the Home Screen.
- WebKit could not run on this box (missing system libraries), so no Safari-engine test was done here.
- Listening test against MAME: the analog sound filters are not modelled.
- Long play: later boards, the pig/bonus stages, high-score and game-over flows.

## 2026-11-08 sizing fix
Bug: in landscape the screen column was `auto`-sized by the canvas itself, and fit() measured that cell, so a fresh landscape load stayed at 1×. Fix: scale is computed from visualViewport minus toolbar/controls; re-fit on resize/orientation/visualViewport/load; Size button added.
Fresh-load Chrome DPR2 results (Auto): 1024×576 → 2× (Fill 2.05×), 1024×768 → 2×, 1180×820 → 3×, 1366×1024 → 3×, 768×1024 → 3×, 820×1180 → 3×, 1024×1366 → 4×. Whole board inside viewport, controls on-screen, no errors, in all 7 (`test/sizes.cjs`).
