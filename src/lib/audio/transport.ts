import * as Tone from 'tone'
import type { ParsedNote } from '../midi/loader'

let currentRate = 1
let scheduled: {
  sampler: Tone.Sampler
  notes: ParsedNote[]
  onNote: ((n: ParsedNote) => void) | null
} | null = null

// Schedule notes into Tone.Transport (time scaled by rate to change speed without changing pitch).
function reschedule() {
  Tone.Transport.cancel(0)
  if (!scheduled) return
  const { sampler, notes, onNote } = scheduled
  for (const n of notes) {
    const t = n.time / currentRate
    const dur = Math.max(n.duration / currentRate, 0.05)
    Tone.Transport.schedule((time) => {
      sampler.triggerAttackRelease(n.name, dur, time, n.velocity)
      if (onNote) {
        const cb = onNote
        Tone.Draw.schedule(() => cb(n), time)
      }
    }, t)
  }
}

export function schedule(
  sampler: Tone.Sampler,
  notes: ParsedNote[],
  onNote?: (n: ParsedNote) => void,
): void {
  scheduled = { sampler, notes, onNote: onNote ?? null }
  currentRate = 1
  reschedule()
}

export function clear(): void {
  Tone.Transport.cancel(0)
  scheduled = null
}

export function setSpeed(rate: number): void {
  const pos = getSeconds() // preserve the original-track position
  currentRate = rate
  seek(pos) // remap Transport.seconds with the new rate
  reschedule()
}

export function getRate(): number {
  return currentRate
}

// Returns "original-track time" (for UI/visuals); automatically reflects the playback speed.
export function getSeconds(): number {
  return Tone.Transport.seconds * currentRate
}

export function seek(originalSeconds: number): void {
  Tone.Transport.seconds = originalSeconds / currentRate
}

export async function play(): Promise<void> {
  await Tone.start() // unlock the autoplay restriction
  Tone.Transport.start()
}

export function pause(): void {
  Tone.Transport.pause()
}

export function stop(): void {
  Tone.Transport.stop()
  Tone.Transport.seconds = 0
}

export function isPlaying(): boolean {
  return Tone.Transport.state === 'started'
}
