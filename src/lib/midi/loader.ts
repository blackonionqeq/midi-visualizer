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

export type ParsedMidi = {
  name: string
  duration: number
  trackCount: number
  notes: ParsedNote[]
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
  return {
    name: midi.name,
    duration: midi.duration,
    trackCount: midi.tracks.length,
    notes,
  }
}
