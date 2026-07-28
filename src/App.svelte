<script lang="ts">
  import { onMount } from 'svelte'
  import * as Tone from 'tone'
  import { parseMidi, type ParsedMidi } from './lib/midi/loader'
  import { loadPiano, setMasterGain } from './lib/audio/sampler'
  import * as transport from './lib/audio/transport'
  import Visualizer from './components/Visualizer.svelte'
  import MeasureMinimap from './components/MeasureMinimap.svelte'
  import { loadLastMidi, saveLastMidi } from './lib/storage'

  let fileName = $state<string | null>(null)
  let parsed = $state<ParsedMidi | null>(null)
  let parseError = $state<string | null>(null)
  let pianoState = $state<'idle' | 'loading' | 'ready' | 'error'>('idle')
  let playState = $state<'stopped' | 'playing' | 'paused'>('stopped')
  let position = $state(0)
  let dragging = $state(false)
  let volume = $state(1)
  let speed = $state(1)
  let rafPos = 0

  function formatTime(s: number): string {
    const m = Math.floor(s / 60)
    const sec = Math.floor(s % 60)
    return `${m}:${sec.toString().padStart(2, '0')}`
  }

  onMount(() => {
    pianoState = 'loading'
    loadPiano()
      .then(() => (pianoState = 'ready'))
      .catch((e) => {
        pianoState = 'error'
        console.error('Failed to load piano samples', e)
      })

    // Restore the last loaded MIDI (no autoplay — wait for the user to press play)
    loadLastMidi()
      .then(async (saved) => {
        if (!saved) return
        try {
          parsed = parseMidi(saved.buffer)
          fileName = saved.name
          position = 0
          const sampler = await loadPiano()
          transport.schedule(sampler, parsed.notes)
        } catch (e) {
          console.error('Failed to restore last MIDI', e)
        }
      })

    const tick = () => {
      if (parsed && !dragging) {
        position = transport.getSeconds()
        if (transport.isPlaying() && position >= parsed.duration) {
          transport.stop()
          playState = 'stopped'
          position = 0
        }
      }
      rafPos = requestAnimationFrame(tick)
    }
    rafPos = requestAnimationFrame(tick)

    // iOS Safari suspends the AudioContext when the tab is backgrounded; proactively
    // resume on return so the next Play lands on a running context.
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        const ctx = Tone.getContext()
        if (ctx.state !== 'running') ctx.resume().catch(() => {})
      }
    }
    document.addEventListener('visibilitychange', onVisible)

    return () => {
      cancelAnimationFrame(rafPos)
      document.removeEventListener('visibilitychange', onVisible)
    }
  })

  async function handleFile(e: Event) {
    const input = e.target as HTMLInputElement
    const file = input.files?.[0]
    if (!file) return
    transport.stop()
    playState = 'stopped'
    position = 0
    fileName = file.name
    parseError = null
    try {
      const buf = await file.arrayBuffer()
      parsed = parseMidi(buf)
      saveLastMidi(file.name, buf).catch((e) => console.error('Save failed', e))
      const sampler = await loadPiano()
      transport.schedule(sampler, parsed.notes)
    } catch (err) {
      parseError = err instanceof Error ? err.message : String(err)
      console.error(err)
    }
  }

  async function togglePlay() {
    if (!parsed) return
    if (playState === 'playing') {
      transport.pause()
      playState = 'paused'
    } else {
      await transport.play()
      playState = 'playing'
    }
  }

  function doStop() {
    transport.stop()
    playState = 'stopped'
    position = 0
  }

  function onSeekInput(e: Event) {
    const v = +(e.currentTarget as HTMLInputElement).value
    position = v
    transport.seek(v)
  }

  function onSpeedChange(e: Event) {
    speed = +(e.currentTarget as HTMLSelectElement).value
    transport.setSpeed(speed)
  }

  function onVolumeInput(e: Event) {
    volume = +(e.currentTarget as HTMLInputElement).value
    setMasterGain(volume)
  }

  // Minimap seek shares the same dragging/position state as the seek bar, so the rAF
  // tick stops overwriting position while the user drags the minimap.
  const onMinimapSeekStart = () => (dragging = true)
  const onMinimapSeek = (sec: number) => {
    position = sec
    transport.seek(sec)
  }
  const onMinimapSeekEnd = () => (dragging = false)
</script>

<main class="app">
  <header>
    <div class="title-row">
      <h1>Local MIDI Visualizer <span class="tag">M3</span></h1>
      {#if fileName}
        <span class="file">📄 {fileName}{#if parsed?.name && parsed.name !== fileName} <span class="songname">({parsed.name})</span>{/if}</span>
      {/if}
      <span class="status">
        Piano:
        {pianoState === 'loading' ? '⏳ Loading'
        : pianoState === 'ready' ? '✓ Ready'
        : pianoState === 'error' ? '✗ Failed'
        : '—'}
      </span>
    </div>
    <div class="ctrl-row">
      <label class="file-input">
        <input type="file" accept=".mid,.midi,audio/midi" onchange={handleFile} />
        <span>Choose .mid</span>
      </label>
      {#if parsed}
        <button class="primary" onclick={togglePlay} disabled={pianoState !== 'ready'}>
          {playState === 'playing' ? '⏸ Pause' : '▶ Play'}
        </button>
        <button onclick={doStop} disabled={playState === 'stopped'}>⏹ Stop</button>
        <span class="meta">{parsed.notes.length} notes · {parsed.trackCount} tracks</span>
      {/if}
    </div>

    {#if parsed}
      <div class="seek-row">
        <span class="time">{formatTime(position)}</span>
        <input
          type="range"
          class="seek"
          min="0"
          max={parsed.duration}
          step="0.05"
          value={position}
          onpointerdown={() => (dragging = true)}
          oninput={onSeekInput}
          onpointerup={() => (dragging = false)}
          onchange={() => (dragging = false)}
        />
        <span class="time">{formatTime(parsed.duration)}</span>
        <label class="opt">
          Speed
          <select value={speed} onchange={onSpeedChange}>
            <option value={0.5}>0.5×</option>
            <option value={0.75}>0.75×</option>
            <option value={1}>1×</option>
            <option value={1.25}>1.25×</option>
            <option value={1.5}>1.5×</option>
            <option value={2}>2×</option>
          </select>
        </label>
        <label class="opt">
          Volume
          <input type="range" class="vol" min="0" max="1.5" step="0.01" value={volume} oninput={onVolumeInput} />
        </label>
      </div>
    {/if}
  </header>

  {#if parsed}
    <div class="minimap-bar">
      <MeasureMinimap
        measures={parsed.measures}
        duration={parsed.duration}
        {position}
        hasTimeSignature={parsed.hasTimeSignature}
        onseekstart={onMinimapSeekStart}
        onseek={onMinimapSeek}
        onseekend={onMinimapSeekEnd}
      />
    </div>
  {/if}

  <section class="viz-area">
    {#if parsed}
      <Visualizer notes={parsed.notes} />
    {:else}
      <div class="placeholder">Pick a .mid file to see falling notes + keyboard highlight</div>
    {/if}
  </section>

  {#if parseError}
    <div class="error-bar">Parse failed: {parseError}</div>
  {/if}
</main>

<style>
  .app {
    display: flex;
    flex-direction: column;
    height: 100vh;
    height: 100svh;
    background: #0d1117;
    color: #e6e6e6;
    font-family: system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
  }
  header {
    padding: 0.75rem 1rem;
    border-bottom: 1px solid #2a2a2a;
    background: #161b22;
  }
  .title-row {
    display: flex;
    align-items: baseline;
    gap: 0.75rem;
  }
  h1 {
    font-size: 1.1rem;
    margin: 0;
    color: #e6e6e6;
  }
  .tag {
    font-size: 0.65rem;
    background: #646cff;
    color: #fff;
    padding: 0.1rem 0.4rem;
    border-radius: 999px;
  }
  .status {
    margin-left: auto;
    color: #9ca3af;
    font-size: 0.8rem;
  }
  .file {
    color: #e6e6e6;
    font-size: 0.85rem;
    font-weight: 500;
  }
  .songname {
    color: #888;
    font-weight: 400;
  }
  .ctrl-row {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-top: 0.5rem;
    flex-wrap: wrap;
  }
  .file-input {
    display: inline-flex;
    align-items: center;
    padding: 0.35rem 0.9rem;
    background: #646cff;
    color: #fff;
    border-radius: 6px;
    cursor: pointer;
    font-size: 0.85rem;
  }
  .file-input input {
    display: none;
  }
  .file-input:hover {
    background: #535bf2;
  }
  .meta {
    color: #888;
    font-size: 0.8rem;
    margin-left: 0.25rem;
  }
  button {
    font-family: inherit;
    font-size: 0.85rem;
    padding: 0.35rem 0.9rem;
    border: 1px solid #3a3a3a;
    background: #21262d;
    color: #e6e6e6;
    border-radius: 6px;
    cursor: pointer;
  }
  button:hover:not(:disabled) {
    background: #2d333b;
  }
  button.primary {
    background: #646cff;
    color: #fff;
    border-color: #646cff;
  }
  button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  .seek-row {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    margin-top: 0.6rem;
    flex-wrap: wrap;
  }
  .time {
    color: #9ca3af;
    font-size: 0.78rem;
    font-variant-numeric: tabular-nums;
    min-width: 2.6em;
    text-align: center;
  }
  .seek {
    flex: 1;
    min-width: 180px;
  }
  .opt {
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
    font-size: 0.78rem;
    color: #9ca3af;
  }
  .opt select {
    background: #21262d;
    color: #e6e6e6;
    border: 1px solid #3a3a3a;
    border-radius: 4px;
    padding: 0.15rem;
    font-size: 0.78rem;
  }
  .vol {
    width: 80px;
  }
  input[type='range'] {
    accent-color: #646cff;
  }
  .minimap-bar {
    height: 30px;
    background: #161b22;
    border-bottom: 1px solid #2a2a2a;
  }
  .viz-area {
    flex: 1;
    min-height: 0;
    position: relative;
    background: #0d1117;
  }
  .placeholder {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #555;
  }
  .error-bar {
    padding: 0.5rem 1rem;
    background: #4a1f1f;
    color: #f87171;
    font-size: 0.85rem;
  }
</style>
