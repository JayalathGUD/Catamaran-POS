/**
 * Plays a pleasant synthesizer audio chime using Web Audio API.
 * 100% self-contained, zero external audio assets required.
 */
export function playLowStockAlertSound(): void {
  try {
    const AudioContextClass =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    if (!AudioContextClass) return
    const ctx = new AudioContextClass()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()

    osc.type = 'sine'
    // 2-tone gentle attention chime (F#5 -> A5)
    osc.frequency.setValueAtTime(739.99, ctx.currentTime)
    osc.frequency.setValueAtTime(880, ctx.currentTime + 0.08)

    gain.gain.setValueAtTime(0.08, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.35)

    osc.connect(gain)
    gain.connect(ctx.destination)

    osc.start()
    osc.stop(ctx.currentTime + 0.35)
  } catch {
    // Audio may be suppressed by browser autoplay policy before user gesture
  }
}

