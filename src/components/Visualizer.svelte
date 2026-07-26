<script lang="ts">
  import { onMount } from 'svelte'
  import type { ParsedNote } from '../lib/midi/loader'
  import * as transport from '../lib/audio/transport'

  type Hand = 'right' | 'left'
  type Props = { notes: ParsedNote[] }
  let { notes }: Props = $props()

  let container: HTMLDivElement
  let canvas: HTMLCanvasElement
  let rafId = 0

  const MIDI_MIN = 21 // A0
  const MIDI_MAX = 108 // C8
  const KEY_COUNT = MIDI_MAX - MIDI_MIN + 1
  const PIXELS_PER_SECOND = 220
  const KEYBOARD_HEIGHT = 90
  const BLACK_CLASSES = new Set([1, 3, 6, 8, 10])
  const RIGHT_COLOR = '#f7768e' // right hand (high-pitch track)
  const LEFT_COLOR = '#7aa2f7' // left hand (low-pitch track)

  function isBlack(midi: number) {
    return BLACK_CLASSES.has(((midi % 12) + 12) % 12)
  }

  // Determine hand per track by pitch median: high-pitch track = right, low-pitch = left.
  // For a single track leave the map empty; draw falls back by pitch (>= C4 = right).
  const handOfTrack = $derived.by<Map<number, Hand>>(() => {
    const byTrack = new Map<number, number[]>()
    for (const n of notes) {
      const arr = byTrack.get(n.track)
      if (arr) arr.push(n.midi)
      else byTrack.set(n.track, [n.midi])
    }
    const result = new Map<number, Hand>()
    if (byTrack.size <= 1) return result
    const medians = [...byTrack.entries()].map(([track, arr]) => {
      const sorted = [...arr].sort((a, b) => a - b)
      return { track, median: sorted[Math.floor(sorted.length / 2)] }
    })
    const sortedMeds = medians.map((m) => m.median).sort((a, b) => a - b)
    const globalMedian = sortedMeds[Math.floor(sortedMeds.length / 2)]
    for (const m of medians) result.set(m.track, m.median >= globalMedian ? 'right' : 'left')
    return result
  })

  function handOf(n: ParsedNote): Hand {
    return handOfTrack.get(n.track) ?? (n.midi >= 60 ? 'right' : 'left')
  }

  function draw() {
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const w = canvas.width
    const h = canvas.height
    const keyW = w / KEY_COUNT
    const hitY = h - KEYBOARD_HEIGHT
    const now = transport.getSeconds()

    ctx.fillStyle = '#0d1117'
    ctx.fillRect(0, 0, w, h)

    // Octave-C separator lines
    ctx.strokeStyle = '#1c2230'
    ctx.lineWidth = 1
    for (let m = MIDI_MIN; m <= MIDI_MAX; m++) {
      if (m % 12 === 0) {
        const x = Math.floor((m - MIDI_MIN) * keyW) + 0.5
        ctx.beginPath()
        ctx.moveTo(x, 0)
        ctx.lineTo(x, hitY)
        ctx.stroke()
      }
    }

    // Falling notes (colored by hand)
    for (const n of notes) {
      const bottomY = hitY - (n.time - now) * PIXELS_PER_SECOND
      const noteH = Math.max(n.duration * PIXELS_PER_SECOND, 4)
      const topY = bottomY - noteH
      if (topY > h || bottomY < 0) continue
      const x = (n.midi - MIDI_MIN) * keyW
      ctx.fillStyle = handOf(n) === 'right' ? RIGHT_COLOR : LEFT_COLOR
      ctx.fillRect(x + 0.6, topY, keyW - 1.2, noteH)
    }

    // Hit line
    ctx.strokeStyle = '#e0af68'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(0, hitY)
    ctx.lineTo(w, hitY)
    ctx.stroke()

    // Currently sounding notes → key → which hand
    const activeHand = new Map<number, Hand>()
    for (const n of notes) {
      if (now >= n.time && now <= n.time + n.duration) activeHand.set(n.midi, handOf(n))
    }

    // White keys
    for (let m = MIDI_MIN; m <= MIDI_MAX; m++) {
      if (isBlack(m)) continue
      const x = (m - MIDI_MIN) * keyW
      const hand = activeHand.get(m)
      ctx.fillStyle = hand ? (hand === 'right' ? RIGHT_COLOR : LEFT_COLOR) : '#dddddd'
      ctx.fillRect(x, hitY, keyW, KEYBOARD_HEIGHT)
    }
    ctx.strokeStyle = '#333'
    ctx.lineWidth = 1
    for (let m = MIDI_MIN; m <= MIDI_MAX; m++) {
      if (isBlack(m)) continue
      const x = Math.floor((m - MIDI_MIN) * keyW) + 0.5
      ctx.beginPath()
      ctx.moveTo(x, hitY)
      ctx.lineTo(x, h)
      ctx.stroke()
    }
    // Black keys
    for (let m = MIDI_MIN; m <= MIDI_MAX; m++) {
      if (!isBlack(m)) continue
      const x = (m - MIDI_MIN) * keyW
      const hand = activeHand.get(m)
      ctx.fillStyle = hand ? (hand === 'right' ? RIGHT_COLOR : LEFT_COLOR) : '#161a22'
      ctx.fillRect(x, hitY, keyW, KEYBOARD_HEIGHT * 0.62)
    }

    // Legend
    ctx.font = '13px system-ui, sans-serif'
    ctx.fillStyle = RIGHT_COLOR
    ctx.fillText('● Right', 12, 22)
    ctx.fillStyle = LEFT_COLOR
    ctx.fillText('● Left', 12, 42)

    rafId = requestAnimationFrame(draw)
  }

  function resize() {
    if (!container || !canvas) return
    canvas.width = container.clientWidth
    canvas.height = container.clientHeight
  }

  onMount(() => {
    resize()
    window.addEventListener('resize', resize)
    rafId = requestAnimationFrame(draw)
    return () => {
      cancelAnimationFrame(rafId)
      window.removeEventListener('resize', resize)
    }
  })
</script>

<div class="viz" bind:this={container}>
  <canvas bind:this={canvas}></canvas>
</div>

<style>
  .viz {
    width: 100%;
    height: 100%;
    position: relative;
  }
  canvas {
    display: block;
    width: 100%;
    height: 100%;
  }
</style>
