type Sound = 'click' | 'select'
const AudioGraph = window.AudioContext ?? (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext

export class AudioEngine {
  static readonly supported = typeof AudioGraph === 'function'
  private context?: AudioContext
  private output?: GainNode

  constructor(private enabled: boolean) {}

  setEnabled(enabled: boolean) {
    this.enabled = enabled
    if (enabled) this.unlock()
    if (this.context && this.output) this.output.gain.setTargetAtTime(enabled ? .32 : 0, this.context.currentTime, .024)
  }

  unlock() {
    if (!this.enabled || !AudioGraph) return
    try {
      if (!this.context) {
        this.context = new AudioGraph()
        this.output = this.context.createGain()
        this.output.gain.value = .32
        this.output.connect(this.context.destination)
      }
      if (this.context.state === 'suspended') void this.context.resume().catch(() => {})
    } catch {
      this.enabled = false
    }
  }

  play(sound: Sound) {
    const context = this.context
    if (!this.enabled || !this.output || context?.state !== 'running') return
    const selecting = sound === 'select'
    const start = context.currentTime
    const finish = start + (selecting ? .11 : .09)
    const oscillator = context.createOscillator()
    const gain = context.createGain()
    oscillator.type = 'triangle'
    oscillator.frequency.setValueAtTime(selecting ? 435 : 480, start)
    oscillator.frequency.exponentialRampToValueAtTime(selecting ? 680 : 315, finish)
    gain.gain.setValueAtTime(.0001, start)
    gain.gain.exponentialRampToValueAtTime(selecting ? .13 : .11, start + .014)
    gain.gain.exponentialRampToValueAtTime(.0001, finish)
    oscillator.connect(gain).connect(this.output)
    oscillator.addEventListener('ended', () => { oscillator.disconnect(); gain.disconnect() }, { once: true })
    oscillator.start(start)
    oscillator.stop(finish + .02)
  }

  dispose() {
    if (this.context?.state !== 'closed') void this.context?.close().catch(() => {})
  }
}
