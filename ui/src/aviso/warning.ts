/** A warning from the Eucatur tablet, as the app sends it to the window over the game. */
export interface Warning {
  title: string
  text: string
  urgent: boolean
}

export function isWarning(value: unknown): value is Warning {
  if (!value || typeof value !== 'object') return false
  const w = value as Record<string, unknown>
  return typeof w.title === 'string' && typeof w.text === 'string' && typeof w.urgent === 'boolean'
}

let context: AudioContext | null = null

/** Three short beeps, for an urgent warning (nothing if sound can't play). */
export function beepFor(_warning: Warning): void {
  try {
    context ??= new AudioContext()
    const start = context.currentTime + 0.02
    for (let i = 0; i < 3; i++) {
      const tone = context.createOscillator()
      const gain = context.createGain()
      tone.frequency.value = 880
      gain.gain.setValueAtTime(0.0001, start + i * 0.28)
      gain.gain.exponentialRampToValueAtTime(0.25, start + i * 0.28 + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.0001, start + i * 0.28 + 0.18)
      tone.connect(gain).connect(context.destination)
      tone.start(start + i * 0.28)
      tone.stop(start + i * 0.28 + 0.2)
    }
  } catch {
    // No sound here.
  }
}
