import { Midi } from '@tonejs/midi'

export type ParsedNote = {
  track: number
  channel: number
  name: string
  midi: number
  time: number
  duration: number
  velocity: number
}

export type Measure = {
  index: number // global measure number, starting at 0
  startSeconds: number
  density: number // normalized to [0, 1]
  isTSChange: boolean // a time-signature change occurs at this measure's start
}

export type ParsedMidi = {
  name: string
  duration: number
  trackCount: number
  notes: ParsedNote[]
  measures: Measure[]
  hasTimeSignature: boolean
}

// Defensive: real-world MIDI files occasionally carry malformed time signatures
// ([4], [0,4], non-power-of-2 denominators, etc.). Normalize to a usable [num, den].
export function normalizeTimeSignature(ts: number[] | undefined): [number, number] {
  if (
    !Array.isArray(ts) ||
    ts.length < 2 ||
    !Number.isFinite(ts[0]) ||
    !Number.isFinite(ts[1])
  ) {
    return [4, 4]
  }
  let num = ts[0]
  let den = ts[1]
  if (num <= 0 || den <= 0) return [4, 4]
  if ((den & (den - 1)) !== 0) {
    // Suspicious, but keep the value so we stay consistent with @tonejs/midi's ticksToMeasures.
    console.warn('[midi] time signature denominator is not a power of 2:', ts)
  }
  num = Math.min(Math.max(Math.round(num), 1), 32)
  den = Math.min(Math.max(Math.round(den), 1), 64)
  return [num, den]
}

type TSEvent = { ticks: number; num: number; den: number }

// Build the list of measure start points from the header's time signatures.
// One measure = ppq * 4 * num / den ticks (1 whole note = ppq*4 ticks; each measure
// holds `num` notes of 1/den value = num*(4/den) quarter notes). The global index stays
// continuous across time-signature changes, so a change always lands on a measure start.
export function buildMeasures(
  header: Midi['header'],
  durationSeconds: number,
  notes: ParsedNote[],
): { measures: Measure[]; hasTimeSignature: boolean } {
  const ppq = header.ppq
  const measures: Measure[] = []

  // End point: cover actual note content, not just the header duration (which may
  // include trailing silence or be truncated).
  let maxNoteEndTicks = 0
  for (const n of notes) {
    const endTicks = header.secondsToTicks(n.time + n.duration)
    if (endTicks > maxNoteEndTicks) maxNoteEndTicks = endTicks
  }
  const endTicks = Math.ceil(
    Math.max(header.secondsToTicks(durationSeconds), maxNoteEndTicks),
  )

  const rawTS = header.timeSignatures
  const tsEvents: TSEvent[] = rawTS.map((e) => {
    const [num, den] = normalizeTimeSignature(e.timeSignature)
    return { ticks: Math.max(0, e.ticks), num, den }
  })
  tsEvents.sort((a, b) => a.ticks - b.ticks)
  // De-duplicate: when two events share the same tick, the later one wins.
  const segments: TSEvent[] = []
  for (const e of tsEvents) {
    const last = segments[segments.length - 1]
    if (last && last.ticks === e.ticks) segments[segments.length - 1] = e
    else segments.push(e)
  }
  const hasTimeSignature = rawTS.length > 0
  const segList = segments.length > 0 ? segments : [{ ticks: 0, num: 4, den: 4 }]

  let globalIdx = 0
  for (let s = 0; s < segList.length; s++) {
    const seg = segList[s]
    const segStart = seg.ticks
    const segEnd = s + 1 < segList.length ? segList[s + 1].ticks : endTicks
    const ticksPerMeasure = (ppq * 4 * seg.num) / seg.den
    // Pathological input: a single measure wider than the whole track — bail out
    // (the renderer falls back to a plain scrubber when measures is empty/too few).
    if (!(ticksPerMeasure > 0) || ticksPerMeasure > endTicks) break

    for (let cursor = segStart; cursor < segEnd; cursor += ticksPerMeasure) {
      const startSeconds = header.ticksToSeconds(cursor)
      if (startSeconds > durationSeconds) break
      measures.push({
        index: globalIdx++,
        startSeconds,
        density: 0,
        isTSChange: cursor === segStart,
      })
    }
  }

  // Sentinel: marks the right edge for density bins; skipped during rendering.
  measures.push({
    index: globalIdx,
    startSeconds: durationSeconds,
    density: 0,
    isTSChange: false,
  })

  // Self-check against @tonejs/midi's own ticksToMeasures (runs once per parse, not
  // per frame). Only a warning — dirty time-signature positions are a known, non-blocking case.
  for (let i = 0; i < measures.length - 1; i++) {
    const m = measures[i]
    const back = header.ticksToMeasures(header.secondsToTicks(m.startSeconds))
    if (Math.abs(back - m.index) >= 0.5) {
      console.warn('[midi] measure index drift:', { expected: m.index, got: back })
    }
  }

  return { measures, hasTimeSignature }
}

// Count notes per measure bin (notes are pre-sorted by `time` ascending), then
// normalize with sqrt so sparse bars stay visible alongside dense ones.
export function computeDensity(measures: Measure[], notes: ParsedNote[]): void {
  const binCount = measures.length - 1 // exclude sentinel
  if (binCount <= 0) return
  const counts = new Array<number>(binCount).fill(0)
  let maxCount = 0
  let ni = 0
  for (let mi = 0; mi < binCount; mi++) {
    const lo = measures[mi].startSeconds
    const hi = measures[mi + 1].startSeconds
    while (ni < notes.length && notes[ni].time < lo) ni++
    let count = 0
    while (ni < notes.length && notes[ni].time < hi) {
      count++
      ni++
    }
    counts[mi] = count
    if (count > maxCount) maxCount = count
  }
  for (let mi = 0; mi < binCount; mi++) {
    measures[mi].density = maxCount > 0 ? Math.sqrt(counts[mi] / maxCount) : 0
  }
}

export function parseMidi(buf: ArrayBuffer): ParsedMidi {
  const midi = new Midi(buf)
  const notes: ParsedNote[] = midi.tracks.flatMap((t, ti) =>
    t.notes.map((n) => ({
      track: ti,
      channel: t.channel,
      name: n.name,
      midi: n.midi,
      time: n.time,
      duration: n.duration,
      velocity: n.velocity,
    })),
  )
  notes.sort((a, b) => a.time - b.time)

  const { measures, hasTimeSignature } = buildMeasures(midi.header, midi.duration, notes)
  computeDensity(measures, notes)

  return {
    name: midi.name,
    duration: midi.duration,
    trackCount: midi.tracks.length,
    notes,
    measures,
    hasTimeSignature,
  }
}
