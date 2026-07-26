// M0 verification script: parse a .mid with @tonejs/midi on the command line to confirm parsing is correct.
// Usage: node scripts/check-midi.mjs [path/to/file.mid]
import pkg from '@tonejs/midi'
import { readFileSync } from 'node:fs'
const { Midi } = pkg

const file = process.argv[2] || 'D:/codes/tools/MIDIVisualizer/rainy_night_companion.mid'
const buf = readFileSync(file)
const midi = new Midi(buf)

let total = 0
const tracks = midi.tracks.map((t, i) => {
  total += t.notes.length
  return { track: i, notes: t.notes.length, channel: t.channel, instrument: t.instrument?.name ?? '?' }
})

const firstNotes = midi.tracks
  .flatMap((t, ti) => t.notes.map((n) => ({ track: ti, name: n.name, midi: n.midi, time: +n.time.toFixed(3), dur: +n.duration.toFixed(3), vel: +n.velocity.toFixed(2) })))
  .sort((a, b) => a.time - b.time)
  .slice(0, 8)

console.log('File:    ', file)
console.log('Name:    ', midi.name || '(none)')
console.log('Duration:', midi.duration.toFixed(2), 's')
console.log('Tracks:  ', midi.tracks.length)
console.log('Notes:   ', total)
console.log('Track details:', JSON.stringify(tracks))
console.log('First 8 notes:')
console.table(firstNotes)
