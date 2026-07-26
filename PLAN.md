# Local MIDI Visualizer · Planning Document

> Status: Draft v0.2 (tech-stack decisions incorporated)
> Date: 2026-07-24
> Location: `D:\codes\projects\local-midi-visualizer`
> Tech stack: pnpm + Vite (latest) + Svelte 5 + TypeScript

---

## 0. One-liner

A **locally-run, offline-capable** MIDI visualization web app: pick a `.mid` file and instantly see "falling notes + highlighted piano keyboard" while the sound is played back with a built-in piano tone. It replaces online tools that "need a network connection every time and re-download a 27MB soundfont every time."

---

## 1. Background & Motivation

| Approach tried | Problem |
|---|---|
| Online tool miditoolbox | Downloads a 27MB soundfont on every page load (measured ~21s); the response headers declare a one-year cache, but `Disable cache` / switching browsers / clearing cache forces a re-download |
| kosua20/MIDIVisualizer (desktop) | Pure renderer, **produces no sound** (explicit design choice by the author; no audio library of any kind in the binary) |
| Piano From Above (desktop) | Requires installing a soundfont driver (VirtualMIDISynth, etc.) — tedious setup |

**Core requirement**: local, open-source, with both visuals and sound, works out of the box, no repeated downloads.

**Conclusion**: replicate miditoolbox's browser tech stack (fully open source), but store the soundfont **locally once** for instant, fully offline access.

---

## 2. Research Findings (key facts, verified by testing)

### 2.1 miditoolbox's actual tech stack

Determined by fetching and grep-ing its 39 JS chunks plus response-header analysis:

| Concern | Implementation | Evidence |
|---|---|---|
| MIDI parsing | `@tonejs/midi` (built on `midi-file`) | `parseMidi`, `Tonejs` inside the chunks |
| Soundfont source | Its own endpoint `GET /api/soundfont` | literal code `await fetch("/api/soundfont")` |
| Soundfont playback | Custom SF3 parser + `AudioBufferSourceNode` | 25 occurrences of `getChannelData`, `PolySynth`; no traces of smplr/fluidsynth/wasm |
| Visuals | WebGL2 / Canvas 2D | page tech-stack description |
| Recording | MediaRecorder | same as above |
| Deployment | Next.js + OpenNext on Cloudflare | response headers `x-opennext: 1`, `Server: cloudflare` |

### 2.2 What the soundfont actually is

Inspected the magic bytes of the `/api/soundfont` response body:

```
RIFF .... sfbk              ← standard SoundFont file
INFO/INAM: "Fluid R3 GM"    ← FluidR3_GM, the most classic open-source GM soundfont
INFO/ICMT: "Licensed under the MIT License"
sdta/smpl: OggS ...         ← sample data is Ogg Vorbis compressed (i.e. SF3 format)
```

- **The soundfont = FluidR3_GM**, MIT-licensed; samples are **Ogg-compressed (SF3)**, hence 27MB.
- miditoolbox relies on a **custom SF3 decoder** to use it.

### 2.3 Key constraints for us

- smplr (the most mature JS soundfont library) supports `.sf2` but **not SF3** → don't directly reuse miditoolbox's 27MB file; avoid re-inventing the SF3 decoder.
- The user is **mainly interested in piano** → no need to load the entire GM soundfont; a piano-specific sample set is lighter and keeps audio/video sync cleaner (see 3.3).

---

## 3. Tech Selection

### 3.1 Form factor & toolchain

- **Vite (latest, user specified v8) + Svelte 5 (runes syntax) + TypeScript**
- **Package manager: pnpm**
- Plain Svelte + Vite (**not SvelteKit**) — single-page app, smallest bundle, no SSR/routing overhead
- `pnpm dev` runs a local server you open in the browser; soundfont samples live in local `public/`, so localhost has no CORS and no network wait

> Later it can be wrapped into a double-clickable exe with Tauri at near-zero cost.

### 3.2 Core dependencies

| Purpose | Choice | Notes |
|---|---|---|
| Build / UI | **Vite + Svelte 5 + TS** | lightweight, compile-time optimizations, no runtime vdom |
| MIDI parsing | **@tonejs/midi** | directly yields per-Note second-accurate time / pitch / velocity |
| Timeline / scheduling | **Tone.js** (`Tone.Transport`) | single time source — the foundation of audio/video sync |
| Soundfont playback | **Tone.Sampler** + local piano samples | same source as Transport; `triggerAttackRelease(note,dur,time)` is naturally in sync |
| Rendering | **Canvas 2D** (inside a Svelte component) | falling notes + keyboard; upgrade to WebGL2 only if it's not fast enough |

> No smplr/soundfont2 (Tone.Sampler is simpler for the piano case). Reconsider when multi-instrument GM is needed.

### 3.3 Soundfont approach (piano-first)

| Option | Contents | Size | Use case |
|---|---|---|---|
| **Recommended (MVP)** | **Tone.Sampler + gleitz `acoustic_grand_piano` sample points** | ~5MB (a dozen or so sample points) | piano; lightweight, cleanest sync |
| Alt A | smplr `SplendidGrand` (premium piano, samples localized) | ~20MB | upgrade if the tone is unsatisfactory |
| Alt B | smplr `Soundfont2` + GeneralUser GS (GM) | ~30MB | when multi-instrument support is needed later |

- Tone.Sampler takes a number of sample points (e.g. one every 3 semitones) and automatically plays them back across all 88 keys by pitch-matching the nearest sample + adjusting `playbackRate`.
- **M1 verification**: confirm the exact URL/format of the gleitz piano samples (per-note mp3/ogg) and the loading/playback quality.

### 3.4 Caching strategy

For a local app the soundfont samples sit on disk, so there's no "download" problem; the real question is "whether to re-decode after a refresh."

| Tier | Approach | Timing |
|---|---|---|
| **MVP** | ① Samples in `public/`; Vite's built-in ETag/Cache-Control means a second fetch hits disk cache (milliseconds, zero network); ② the decoded AudioContext/Sampler is built once per app lifecycle and reused | now |
| **Advanced** | Store the sample `ArrayBuffer` in IndexedDB so refreshes skip `decodeAudioData` for a true instant open | on demand |

### 3.5 Licenses (all commercial/open-source friendly)

- @tonejs/midi, Tone.js, Vite, Svelte — MIT
- gleitz/midi-js-soundfonts piano samples — based on Fluid/Arachno, free to use
- (Alt) GeneralUser GS — free to use (S. Christian Collins)

---

## 4. MVP Scope

### ✅ Must-do (P0)

1. Pick / drag in a `.mid` file
2. Parse out the note list (pitch, start/end time, velocity, owning track/channel)
3. Falling-note waterfall + an 88-key piano keyboard highlight at the bottom
4. Tone.Sampler loads local piano samples → plays back on MIDI events
5. Playback control: play/pause, progress bar, playback speed
6. Loading progress indicator for first-time soundfont load

### ⏸️ Not doing (later versions)

- Video recording / screenshot export, themes/particles/Bloom, multi-track filtering, Tauri exe packaging

---

## 5. Architecture & Data Flow

```
.mid file
   │  @tonejs/midi parse
   ▼
Note[]  ─────────────────┐
   │                     │
   ▼  Tone.Transport (the single timeline, seconds)
Tone.Sampler             │
triggered by Transport   │
scheduling               ▼
              requestAnimationFrame reads Transport.seconds
Web Audio output  →  draws notes in the visible window + keyboard highlight (Canvas)
```

**Audio/video sync**: both audio and visuals take time from `Tone.Transport.seconds` → naturally in sync, no manual alignment needed.

**Modules**:
- `lib/midi/loader.ts` — file reading + parsing into Note[]
- `lib/audio/transport.ts` — Tone.Transport wrapper: play/pause/seek/speed, schedules Note[] into the transport
- `lib/audio/sampler.ts` — Tone.Sampler wrapper + sample loading/caching
- `lib/render/canvas.ts` — render loop, coordinates, visible-window culling
- `components/Visualizer.svelte` — falling-notes Canvas
- `components/Keyboard.svelte` — 88-key piano + highlight
- `components/Controls.svelte` — playback controls
- `App.svelte` — assembly

---

## 6. Directory Structure (planned)

```
local-midi-visualizer/
├── public/
│   └── samples/piano/          # piano sample points ogg/mp3 (local, ~5MB)
├── src/
│   ├── lib/
│   │   ├── midi/loader.ts
│   │   ├── audio/{transport,sampler}.ts
│   │   └── render/canvas.ts
│   ├── components/
│   │   ├── Visualizer.svelte
│   │   ├── Keyboard.svelte
│   │   └── Controls.svelte
│   ├── App.svelte
│   ├── main.ts
│   └── app.css
├── index.html
├── package.json
├── vite.config.ts
├── svelte.config.js
├── tsconfig.json
├── PLAN.md                     # this document
└── README.md
```

---

## 7. Key Technical Challenges & Mitigations

| Challenge | Mitigation |
|---|---|
| Audio/video sync | A single `Tone.Transport` timeline (see 5) |
| Tone.Sampler sample-point selection | One sample point every 3 semitones covers all 88 keys; M1 verifies tonal transitions |
| Piano sample source & license | M1 confirms gleitz sample URL/format; fall back to Alt A if not good enough |
| Browser autoplay restriction | `AudioContext.resume()` on the user's "pick file / press play" interaction |
| Large-MIDI performance | No optimization in the MVP; renderer does viewport culling |
| Svelte 5 runes vs. audio/Canvas lifecycle | Manage AudioContext/Canvas in `$effect`, clean up on component unmount |

---

## 8. Development Milestones

| Phase | Goal | Key deliverable |
|---|---|---|
| **M0 Scaffolding** | pnpm + Vite + Svelte 5 + TS running; pick a `.mid`; print Note[] to the console after parsing | can parse MIDI |
| **M1 Sound** | Tone.Sampler loads local piano samples; plays sound from MIDI | **verify the soundfont approach (key checkpoint)** |
| **M2 Visuals** | Canvas falling notes + keyboard highlight; synced from Transport | has both sound and visuals |
| **M3 Controls** | play/pause/progress/speed; loading indicator; layout polish | usable |
| **M4 Wrap-up** | README, build verification, hands-on test with `D:\codes\tools\MIDIVisualizer\*.mid` | delivered |

> M1 is the biggest uncertainty; if the Tone.Sampler approach is infeasible, switch to Alt A/B here without affecting M2/M3.

---

## 9. Future Extensions (non-MVP)

Tauri exe packaging, MediaRecorder recording/screenshots, themes/particles/Bloom, multi-track filtering, virtual MIDI port live input.

---

## 10. Risks & Open Questions

1. The exact URL/format/quality of the gleitz piano samples — verify in M1, fall back to SplendidGrand.
2. Svelte 5 runes details around audio/Canvas lifecycle management — keep an eye out during implementation.
3. Canvas 2D frame rate on long MIDIs — upgrade to WebGL2 if needed.

---

## 11. References

- kosua20/MIDIVisualizer: https://github.com/kosua20/MIDIVisualizer
- @tonejs/midi: https://github.com/Tonejs/Midi
- Tone.js: https://github.com/Tonejs/Tone.js
- gleitz/midi-js-soundfonts (piano samples): https://github.com/gleitz/midi-js-soundfonts
- Svelte 5: https://svelte.dev

---

### Next Step

Enter **M0 Scaffolding**: `pnpm create vite` (svelte-ts template) to initialize the project, hook up @tonejs/midi, and get file selection + parsing working.
