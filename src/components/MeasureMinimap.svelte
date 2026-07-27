<script lang="ts">
  import { onMount } from 'svelte'
  import type { Measure } from '../lib/midi/loader'

  type Props = {
    measures: Measure[]
    duration: number
    position: number
    hasTimeSignature: boolean
    onseekstart?: () => void
    onseek?: (sec: number) => void
    onseekend?: () => void
  }
  let {
    measures,
    duration,
    position,
    hasTimeSignature,
    onseekstart,
    onseek,
    onseekend,
  }: Props = $props()

  let container: HTMLDivElement
  let canvas: HTMLCanvasElement
  let rafId = 0
  let dragging = $state(false)

  // Colors kept in sync with the rest of the app (no CSS-variable system yet).
  const BG = '#161b22'
  const BAR_RGB = '100, 108, 255' // accent #646cff
  const TS_CHANGE = '#3a3a3a'
  const LABEL = '#9ca3af'
  const CURSOR = '#e0af68'
  const SCRUB_TRACK = '#21262d'

  function resize() {
    if (!canvas || !container) return
    const dpr = window.devicePixelRatio || 1
    const cssW = container.clientWidth
    const cssH = container.clientHeight
    canvas.width = Math.max(1, Math.floor(cssW * dpr))
    canvas.height = Math.max(1, Math.floor(cssH * dpr))
    canvas.style.width = cssW + 'px'
    canvas.style.height = cssH + 'px'
    const ctx = canvas.getContext('2d')
    if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  }

  // Density bars + sparse measure labels. Sentinel (last entry) is skipped.
  function drawBars(ctx: CanvasRenderingContext2D, w: number, h: number) {
    const n = measures.length - 1
    const labelEvery = Math.max(1, Math.ceil(n / Math.max(1, w / 48)))

    for (let i = 0; i < n; i++) {
      const m = measures[i]
      const x0 = (m.startSeconds / duration) * w
      const x1 = (measures[i + 1].startSeconds / duration) * w
      const barW = Math.max(0.5, x1 - x0 - 1)
      ctx.fillStyle = `rgba(${BAR_RGB}, ${0.12 + m.density * 0.78})`
      ctx.fillRect(x0 + 0.5, 1, barW, h - 2)
      if (m.isTSChange) {
        ctx.strokeStyle = TS_CHANGE
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.moveTo(x0 + 0.5, 0)
        ctx.lineTo(x0 + 0.5, h)
        ctx.stroke()
      }
    }

    ctx.font = '10px system-ui, sans-serif'
    ctx.textBaseline = 'top'
    ctx.textAlign = 'left'
    ctx.fillStyle = LABEL
    for (let i = 0; i < n; i += labelEvery) {
      const x0 = (measures[i].startSeconds / duration) * w
      ctx.fillText(String(measures[i].index + 1), x0 + 3, 2)
    }

    // Current measure (top-right).
    let curIdx = -1
    for (let i = 0; i < n; i++) {
      if (measures[i].startSeconds <= position) curIdx = i
      else break
    }
    if (curIdx >= 0) {
      ctx.fillStyle = CURSOR
      ctx.textAlign = 'right'
      ctx.fillText(`m.${curIdx + 1}/${n}`, w - 6, 2)
      ctx.textAlign = 'left'
    }
  }

  // Fallback when there's no usable time signature: a plain scrubber.
  function drawScrubber(ctx: CanvasRenderingContext2D, w: number, h: number) {
    ctx.fillStyle = SCRUB_TRACK
    ctx.fillRect(0, 4, w, h - 8)
    ctx.strokeStyle = TS_CHANGE
    ctx.lineWidth = 1
    ctx.fillStyle = LABEL
    ctx.font = '10px system-ui, sans-serif'
    ctx.textBaseline = 'top'
    ctx.textAlign = 'left'
    for (const p of [0.25, 0.5, 0.75]) {
      const x = p * w
      ctx.beginPath()
      ctx.moveTo(x, 4)
      ctx.lineTo(x, h - 4)
      ctx.stroke()
      ctx.fillText(`${Math.round(p * 100)}%`, x + 3, 2)
    }
  }

  function draw() {
    const ctx = canvas.getContext('2d')
    if (!ctx) {
      rafId = requestAnimationFrame(draw)
      return
    }
    const w = canvas.clientWidth
    const h = canvas.clientHeight

    ctx.fillStyle = BG
    ctx.fillRect(0, 0, w, h)

    if (hasTimeSignature && measures.length > 1 && duration > 0) {
      drawBars(ctx, w, h)
    } else {
      drawScrubber(ctx, w, h)
    }

    if (duration > 0) {
      const x = (position / duration) * w
      ctx.strokeStyle = CURSOR
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(x, 0)
      ctx.lineTo(x, h)
      ctx.stroke()
    }

    rafId = requestAnimationFrame(draw)
  }

  function secFromEvent(e: PointerEvent): number {
    const rect = canvas.getBoundingClientRect()
    const x = e.clientX - rect.left
    const ratio = rect.width > 0 ? Math.min(Math.max(x / rect.width, 0), 1) : 0
    return ratio * duration
  }

  function onPointerDown(e: PointerEvent) {
    canvas.setPointerCapture(e.pointerId)
    dragging = true
    onseekstart?.()
    onseek?.(secFromEvent(e))
  }

  function onPointerMove(e: PointerEvent) {
    if (!dragging) return
    onseek?.(secFromEvent(e))
  }

  function onPointerUp(e: PointerEvent) {
    if (!dragging) return
    dragging = false
    try {
      canvas.releasePointerCapture(e.pointerId)
    } catch {
      // pointer capture already released (e.g. pointercancel)
    }
    onseekend?.()
  }

  onMount(() => {
    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(container)
    window.addEventListener('resize', resize)
    rafId = requestAnimationFrame(draw)
    return () => {
      cancelAnimationFrame(rafId)
      ro.disconnect()
      window.removeEventListener('resize', resize)
    }
  })
</script>

<div class="minimap" bind:this={container}>
  <canvas
    bind:this={canvas}
    onpointerdown={onPointerDown}
    onpointermove={onPointerMove}
    onpointerup={onPointerUp}
    onpointercancel={onPointerUp}
  ></canvas>
</div>

<style>
  .minimap {
    width: 100%;
    height: 100%;
    position: relative;
  }
  canvas {
    display: block;
    width: 100%;
    height: 100%;
    touch-action: none;
    cursor: pointer;
  }
</style>
