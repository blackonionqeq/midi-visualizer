import * as Tone from 'tone'

let sampler: Tone.Sampler | null = null
let master: Tone.Gain | null = null
let limiter: Tone.Limiter | null = null

const DEFAULT_GAIN = 1.8 // boost overall loudness (gleitz samples are on the quiet side)

// Master output chain: sampler → master(Gain) → limiter → destination
function masterChain(): Tone.Gain {
  if (!master) {
    limiter = new Tone.Limiter(-1).toDestination()
    master = new Tone.Gain(DEFAULT_GAIN).connect(limiter)
  }
  return master
}

// Load piano samples from the local manifest and build a Tone.Sampler.
export async function loadPiano(): Promise<Tone.Sampler> {
  if (sampler) return sampler
  const manifest: Record<string, string> = await (await fetch('/samples/piano/manifest.json')).json()
  const urls: Record<string, string> = {}
  for (const [note, file] of Object.entries(manifest)) {
    urls[note] = `/samples/piano/${file}`
  }
  return new Promise<Tone.Sampler>((resolve, reject) => {
    sampler = new Tone.Sampler({
      urls,
      onload: () => resolve(sampler!),
      onerror: (e) => reject(e),
    }).connect(masterChain())
  })
}

export function getPiano(): Tone.Sampler | null {
  return sampler
}

// Relative volume multiplier (1 = default loudness DEFAULT_GAIN; 0 = mute), used by the M3 volume slider.
export function setMasterGain(value: number): void {
  if (master) master.gain.rampTo(value * DEFAULT_GAIN, 0.05)
}
