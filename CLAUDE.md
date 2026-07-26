# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A local MIDI visualizer: pick a `.mid` file in the browser → falling notes + a highlighted piano keyboard + piano-tone playback, running offline (the soundfont lives locally). The full design decisions and research notes are in `PLAN.md`; the user-facing description is in `README.md`.

## Common Commands

- `pnpm dev` — dev server (Vite, http://localhost:5173)
- `pnpm build` — production build into `dist/`
- `pnpm preview` — preview the build output
- `pnpm check` — svelte-check + tsc type checking (**always run this after changing code**; this project has no unit tests)
- `node scripts/fetch-piano-samples.mjs` — re-fetch/convert piano samples into `public/samples/piano/` (`SF=Musyng_Kite node ...` switches to a higher-quality soundfont)
- `node scripts/check-midi.mjs [file.mid]` — CLI tool to verify the MIDI parsing logic

There is no test suite. Verification = `pnpm check` + manual testing in the browser.

## Architecture (cross-file design of note)

### Single time source = audio/video sync
All time derives from `Tone.Transport` (`src/lib/audio/transport.ts`):
- `getSeconds()` returns **original-track time** (`Tone.Transport.seconds * currentRate`).
- Both the rAF render loop in `Visualizer.svelte` and the progress bar in `App.svelte` read `getSeconds()` → audio and visuals are naturally in sync.
- When changing either the audio or the visuals side, do not introduce a second time source.

### Speed change without pitch change (non-obvious trick)
`Tone.Transport` has no native playbackRate. The implementation:
- At scheduling time, note times are scaled: `schedule(n.time / rate)`, and duration is likewise `/rate`.
- The externally-exposed `getSeconds()` multiplies back `*rate`, so the UI/visuals perceive original-track time, but the falling speed changes with the rate.
- `setSpeed(rate)`: record the original-track position → change the rate → `seek(pos)` to remap `Transport.seconds` → `reschedule()`.
When changing speed-related logic you must understand this bidirectional scaling, otherwise audio and visuals will drift.

### Tone pipeline
`public/samples/piano/` (88 mp3s + `manifest.json`) → the `Tone.Sampler` in `sampler.ts` (urls built from the manifest) → master `Gain` → `Limiter` → destination. The `v` in `setMasterGain(v)` is a **relative multiplier** (internally `v * DEFAULT_GAIN`, `DEFAULT_GAIN=1.8`, because gleitz samples are on the quiet side).

### Left/right hand detection
`Visualizer.svelte` classifies each track by its pitch median using `$derived.by`: a high-pitch track = right hand (red `#f7768e`), a low-pitch track = left hand (blue `#7aa2f7`). For a single track it falls back to per-note pitch (`>= 60`/C4 = right hand). The color constants are at the top of `Visualizer.svelte`.

### Persistence
`storage.ts` stores the last MIDI's `ArrayBuffer` in IndexedDB; `App.svelte` restores it in `onMount` (no autoplay, due to autoplay restrictions). Picking a new file overwrites the previous record.

## Important Conventions & Pitfalls

- **Svelte 5 runes**: use `$state`/`$derived`/`$props`, not stores; for events use `onclick={fn}` (not `on:click`).
- **@tonejs/midi dual module**: in the browser/Vite side `import { Midi }` works fine; in Node scripts it is CommonJS, so you must `import pkg from '@tonejs/midi'; const { Midi } = pkg` (see `scripts/*.mjs`).
- **Audio singletons**: `sampler`/`transport` are held as module-level `let` singletons. HMR hot-replacement leaves the old `AudioContext`/nodes dangling — when debugging audio issues, ask the user to **hard-refresh** (`Ctrl+Shift+R`) rather than rely on HMR.
- **autoplay**: the first sound must be triggered by a user interaction (`transport.play()` internally calls `Tone.start()` to unlock). Do not autoplay in `onMount`.
- **Soundfont source network restriction**: `tonejs.github.io` is unreachable on some networks (including this machine), so the samples script goes through the jsdelivr CDN's gleitz repo. When switching soundfont sources, prefer jsdelivr.
- **Zero tolerance for type errors**: `pnpm check` must be 0 errors and 0 warnings. Svelte 5 will report `state_referenced_locally` for "assigning a reactive value to a plain local variable" — read props/$state directly inside closures/functions; do not intermediate through a plain variable.
- **Note naming does not affect matching**: `@tonejs/midi`'s `Note.name` (may use `#`) differs in naming from the gleitz sample keys (which use `b`), but `Tone.Sampler` matches by pitch (midi number), not by string, so there is no impact.
