// Convert gleitz's base64-packed JS into per-note mp3s + manifest.json for Tone.Sampler.
// Source: jsdelivr CDN (tonejs.github.io is unreachable on this network; jsdelivr is reachable).
// Usage: node scripts/fetch-piano-samples.mjs
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { execSync } from 'node:child_process'
import vm from 'node:vm'

// For higher quality, switch to Musyng_Kite (larger files).
const SF = process.env.SF || 'FluidR3_GM'
const url = `https://cdn.jsdelivr.net/gh/gleitz/midi-js-soundfonts/${SF}/acoustic_grand_piano-mp3.js`
const outDir = 'public/samples/piano'

console.log(`Downloading ${SF} piano samples...`)
execSync(`curl -s -L --max-time 90 -o /tmp/piano.js "${url}"`)
const js = readFileSync('/tmp/piano.js', 'utf8')

// Sandbox-execute the assignment and extract the note → dataURL map.
const ctx = { MIDI: { Soundfont: {} } }
vm.runInNewContext(js, ctx)
const samples = ctx.MIDI.Soundfont.acoustic_grand_piano
const keys = Object.keys(samples)
console.log(`Parsed ${keys.length} notes`)

mkdirSync(outDir, { recursive: true })
const manifest = {}
let totalBytes = 0
for (const note of keys) {
  const b64 = samples[note].split(',')[1]
  if (!b64) continue
  const buf = Buffer.from(b64, 'base64')
  // Normalize the filename: # → s (avoid URL-encoding issues), e.g. A#0 → As0.mp3
  const file = note.replace('#', 's') + '.mp3'
  writeFileSync(`${outDir}/${file}`, buf)
  manifest[note] = file
  totalBytes += buf.length
}
writeFileSync(`${outDir}/manifest.json`, JSON.stringify(manifest, null, 2))
console.log(`Wrote ${Object.keys(manifest).length} samples + manifest.json, total ${(totalBytes / 1024 / 1024).toFixed(1)} MB`)
console.log('Notes:', keys.join(' '))
