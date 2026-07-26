# Local MIDI Visualizer

An offline MIDI visualization web app: pick a `.mid` file and watch falling notes + a highlighted piano keyboard while the sound is played back with a built-in piano tone. Left/right hands are color-coded; it supports scrubbing the progress bar, playback speed (no pitch change), volume control, and remembers the last loaded file.

It replaces online tools that "need a network connection every time and re-download the soundfont every time" — the soundfont is stored locally once, so it opens instantly and works fully offline.

## Quick Start

Requires Node.js 18+ and pnpm.

```bash
pnpm install      # install dependencies
pnpm dev          # start the dev server → http://localhost:5173
```

Open your browser and pick a `.mid` file.

## Build & Preview

```bash
pnpm build        # production build into dist/
pnpm preview      # preview the build output
```

## Features

- Pick / drag in a `.mid` file and parse its notes
- Falling-note waterfall + an 88-key piano keyboard highlight at the bottom
- Piano-tone playback (Tone.Sampler + local samples)
- **Left/right hand color-coding**: auto-detected per track by pitch median (red = right hand / blue = left hand)
- Play / pause / stop + a draggable progress bar + speed (0.5×–2×, no pitch change) + volume
- **Remembers the last loaded MIDI** (IndexedDB) and auto-restores on refresh
- Audio/video sync (a single Tone.Transport time source drives both the audio and the visuals)

## Directory Structure

```
├── public/
│   ├── favicon.svg
│   └── samples/piano/           # 88-key piano sample mp3s + manifest.json (~2MB, local)
├── src/
│   ├── App.svelte               # main UI + playback controls
│   ├── components/
│   │   └── Visualizer.svelte    # Canvas rendering (falling notes + keyboard)
│   ├── lib/
│   │   ├── midi/loader.ts       # @tonejs/midi parsing
│   │   ├── audio/sampler.ts     # Tone.Sampler + master gain chain
│   │   ├── audio/transport.ts   # Tone.Transport scheduling (incl. speed change)
│   │   └── storage.ts           # IndexedDB persistence
│   └── main.ts
├── scripts/
│   ├── fetch-piano-samples.mjs  # fetches and converts piano samples from gleitz
│   └── check-midi.mjs           # CLI tool to verify MIDI parsing
└── PLAN.md                      # design / planning document
```

## Changing the Soundfont

The piano samples come from [gleitz/midi-js-soundfonts](https://github.com/gleitz/midi-js-soundfonts) (FluidR3_GM). To switch to the higher-quality Musyng Kite:

```bash
SF=Musyng_Kite node scripts/fetch-piano-samples.mjs
```

Samples are pulled via the jsdelivr CDN (`tonejs.github.io` is unreachable on some networks; jsdelivr is more reliable).

> For the tech stack and architecture, see `CLAUDE.md`.

## License

Code is MIT. Piano samples are from gleitz/midi-js-soundfonts (based on FluidR3, free to use).
