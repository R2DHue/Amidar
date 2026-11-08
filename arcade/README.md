# Amidar — original arcade, in the browser (bring your own ROM)

Emulates the 1982 Konami Amidar arcade board (2× Z80, 2× AY-3-8910, Galaxian/Scramble-style video)
and runs the **original game code, graphics, colours and sound from your ROM set**. It is not a remake.

**No ROMs are included in this folder or ZIP. Do not commit ROM files to a public repository.**

## Use
1. Host this folder on any static web server (GitHub Pages works; `index.html` is at the root).
2. Open it and tap **Choose ROM ZIP or files…**, then pick your MAME `amidar.zip` (or the 10 files).
   Files are identified by CRC32, so renamed files are fine (e.g. `8.11d` / `9.9d` = `s1.5c` / `s2.5d`).
   Required (MAME set `amidar`): 1.2c 2.2e 3.2f 4.2h 5.2j s1.5c s2.5d c2.5f c2.5d amidar.clr.
3. The ROM is kept **only in this browser's IndexedDB** for this site so it loads automatically next time.
   It is never uploaded. *ROM… → Forget saved ROM* deletes it. Clearing Safari website data also removes it.
4. Tap **COIN**, then **1P START**.

## Controls
- Touch: right 4-way joystick (strict, no diagonals). Touch anywhere on the pad (or just outside it): direction = where your finger is relative to the pad centre, no drag needed; left **JUMP**,
  top bar COIN / 1P START / Pause / Sound / Size / ROM.
- **Size** button cycles Auto → 1× → 2× → 3× → 4× → 5× → Fill (remembered on this device).
  Auto = largest whole-number pixel multiple that shows the entire board. A fixed size larger than fits is
  capped and labelled (e.g. "4× (max 2× fits)"). Fill = largest non-integer size (slightly uneven pixels).
- Keyboard: arrows or WASD, Space/X jump, 5 or C coin, 1 or Enter start, P pause.
- Xbox controller (Gamepad API): D-pad or left stick (dead zone 0.4, dominant axis), A or B jump,
  View = coin, Menu = 1P start.
- Sound starts after your first tap/key/button (browser rule).

## Accuracy notes
- CPU, memory map, inputs, DIP defaults (3 lives, demo sounds on, 1 coin 1 credit), palette PROM,
  tiles, sprites and screen rotation follow MAME's galaxian driver (`amidar` uses the "turtles" board).
- Whole 224×256 portrait screen is shown, no scrolling, nearest-neighbour integer scaling, no CRT effects.
- Sound: both AY-3-8910s are emulated; MAME's analog netlist filter stage is **not** modelled, so the
  tone is a little brighter than MAME/real hardware.
- The Z80 core is instruction-level (not cycle-exact); minor timing differences vs. MAME are possible.

See TEST_REPORT.md for what was tested and LICENSES.txt for attribution.
