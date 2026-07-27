import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { Midi } from '@tonejs/midi'
import {
  normalizeTimeSignature,
  buildMeasures,
  computeDensity,
  type Measure,
  type ParsedNote,
} from './loader'

// Build a real @tonejs/midi header with a fixed 120 BPM tempo and the given time
// signatures, so conversions behave deterministically. At 120 BPM one quarter = 0.5s,
// so one 4/4 measure = 2s regardless of ppq.
function makeHeader(timeSignatures: { ticks: number; ts: [number, number] }[] = []) {
  const midi = new Midi()
  midi.header.tempos.length = 0
  midi.header.tempos.push({ ticks: 0, bpm: 120 })
  midi.header.timeSignatures.length = 0
  for (const t of timeSignatures) {
    midi.header.timeSignatures.push({ ticks: t.ticks, timeSignature: [...t.ts] })
  }
  midi.header.update()
  return midi.header
}

// Silence the dev self-check / dirty-input warnings during tests.
beforeEach(() => {
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})
afterEach(() => {
  vi.restoreAllMocks()
})

describe('normalizeTimeSignature', () => {
  it('passes through valid signatures', () => {
    expect(normalizeTimeSignature([4, 4])).toEqual([4, 4])
    expect(normalizeTimeSignature([3, 4])).toEqual([3, 4])
    expect(normalizeTimeSignature([6, 8])).toEqual([6, 8])
  })

  it('falls back to 4/4 on malformed input', () => {
    expect(normalizeTimeSignature(undefined)).toEqual([4, 4])
    expect(normalizeTimeSignature([])).toEqual([4, 4])
    expect(normalizeTimeSignature([4])).toEqual([4, 4])
    expect(normalizeTimeSignature([0, 4])).toEqual([4, 4])
    expect(normalizeTimeSignature([4, 0])).toEqual([4, 4])
  })

  it('clamps extreme numerators and denominators', () => {
    expect(normalizeTimeSignature([100, 4])).toEqual([32, 4])
    expect(normalizeTimeSignature([4, 128])).toEqual([4, 64])
  })

  it('keeps a non-power-of-2 denominator but warns', () => {
    expect(normalizeTimeSignature([3, 3])).toEqual([3, 3])
    expect(console.warn).toHaveBeenCalled()
  })
})

describe('buildMeasures', () => {
  it('lays out equal 2s measures in 4/4 @120bpm', () => {
    const header = makeHeader([{ ticks: 0, ts: [4, 4] }])
    const { measures, hasTimeSignature } = buildMeasures(header, 8, [])
    expect(hasTimeSignature).toBe(true)
    expect(measures).toHaveLength(5) // 4 measures + sentinel
    expect(measures[0].startSeconds).toBeCloseTo(0, 6)
    expect(measures[1].startSeconds).toBeCloseTo(2, 6)
    expect(measures[2].startSeconds).toBeCloseTo(4, 6)
    expect(measures[3].startSeconds).toBeCloseTo(6, 6)
    expect(measures[4].startSeconds).toBeCloseTo(8, 6) // sentinel at duration
    expect(measures[0].isTSChange).toBe(true) // segment head
  })

  it('uses shorter (1.5s) measures in 3/4', () => {
    const header = makeHeader([{ ticks: 0, ts: [3, 4] }])
    const { measures } = buildMeasures(header, 6, [])
    expect(measures).toHaveLength(5)
    expect(measures[0].startSeconds).toBeCloseTo(0, 6)
    expect(measures[1].startSeconds).toBeCloseTo(1.5, 6)
    expect(measures[2].startSeconds).toBeCloseTo(3, 6)
    expect(measures[3].startSeconds).toBeCloseTo(4.5, 6)
  })

  it('keeps the index continuous across a time-signature change', () => {
    // 0..4s = 4/4 (two 2s measures), 4s.. = 3/4 (1.5s measures).
    const midi = new Midi()
    midi.header.tempos.length = 0
    midi.header.tempos.push({ ticks: 0, bpm: 120 })
    midi.header.timeSignatures.length = 0
    midi.header.timeSignatures.push({ ticks: 0, timeSignature: [4, 4] })
    midi.header.update()
    const changeTicks = midi.header.secondsToTicks(4)
    midi.header.timeSignatures.push({ ticks: changeTicks, timeSignature: [3, 4] })
    midi.header.update()

    const { measures } = buildMeasures(midi.header, 8, [])
    // segment 1: 0, 2s | segment 2: 4, 5.5, 7s | sentinel 8s
    expect(measures.map((m) => m.index)).toEqual([0, 1, 2, 3, 4, 5])
    const starts = measures.map((m) => m.startSeconds)
    expect(starts[0]).toBeCloseTo(0, 6)
    expect(starts[1]).toBeCloseTo(2, 6)
    expect(starts[2]).toBeCloseTo(4, 6) // change point
    expect(starts[3]).toBeCloseTo(5.5, 6)
    expect(starts[4]).toBeCloseTo(7, 6)
    expect(measures[0].isTSChange).toBe(true)
    expect(measures[1].isTSChange).toBe(false)
    expect(measures[2].isTSChange).toBe(true) // 4/4 -> 3/4
    expect(measures[3].isTSChange).toBe(false)
  })

  it('falls back to 4/4 and reports no time signature when the header is empty', () => {
    const header = makeHeader([])
    const { measures, hasTimeSignature } = buildMeasures(header, 4, [])
    expect(hasTimeSignature).toBe(false)
    expect(measures).toHaveLength(3) // 2 measures + sentinel
    expect(measures[0].startSeconds).toBeCloseTo(0, 6)
    expect(measures[1].startSeconds).toBeCloseTo(2, 6)
  })
})

describe('computeDensity', () => {
  it('normalizes note counts per bin with sqrt', () => {
    const measures = [
      { index: 0, startSeconds: 0, density: 0, isTSChange: false },
      { index: 1, startSeconds: 1, density: 0, isTSChange: false },
      { index: 2, startSeconds: 2, density: 0, isTSChange: false }, // sentinel
    ] as Measure[]
    const notes = [
      { time: 0.1 }, { time: 0.2 }, { time: 0.3 }, { time: 0.5 }, // 4 notes in [0,1)
      { time: 1.5 }, // 1 note in [1,2)
    ] as ParsedNote[]
    computeDensity(measures, notes)
    expect(measures[0].density).toBeCloseTo(1, 6) // sqrt(4/4)
    expect(measures[1].density).toBeCloseTo(0.5, 6) // sqrt(1/4)
    expect(measures[2].density).toBe(0) // sentinel untouched
  })

  it('handles an empty note set', () => {
    const measures = [
      { index: 0, startSeconds: 0, density: 0, isTSChange: false },
      { index: 1, startSeconds: 1, density: 0, isTSChange: false },
    ] as Measure[]
    computeDensity(measures, [])
    expect(measures[0].density).toBe(0)
  })
})
