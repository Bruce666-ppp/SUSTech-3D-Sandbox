import type { Tool } from './world'

type Sound = 'click' | 'select' | 'impact' | 'rebuild' | `drop-${Tool}` | Tool
const AudioGraph = window.AudioContext ?? (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext

export class AudioEngine {
  static readonly supported = typeof AudioGraph === 'function'
  private context?: AudioContext
  private output?: GainNode
  private noise?: AudioBuffer
  private enabled: boolean
  private readonly active = new Set<AudioScheduledSourceNode>()

  constructor(enabled: boolean) {
    this.enabled = enabled
  }

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
        const limiter = this.context.createDynamicsCompressor()
        this.output.connect(limiter).connect(this.context.destination)
        const length = this.context.sampleRate * 3
        this.noise = this.context.createBuffer(1, length, this.context.sampleRate)
        const samples = this.noise.getChannelData(0)
        for (let i = 0; i < length; i++) samples[i] = Math.random() * 2 - 1
      }
      if (this.context.state === 'suspended') void this.context.resume().catch(() => {})
    } catch {
      this.enabled = false
    }
  }

  private tone(from: number, to: number, duration: number, volume: number, type: OscillatorType = 'sine', delay = 0) {
    const context = this.context!
    const start = context.currentTime + delay
    const oscillator = context.createOscillator()
    const gain = context.createGain()
    oscillator.type = type
    oscillator.frequency.setValueAtTime(from, start)
    oscillator.frequency.exponentialRampToValueAtTime(to, start + duration)
    gain.gain.setValueAtTime(.0001, start)
    gain.gain.exponentialRampToValueAtTime(volume, start + .014)
    gain.gain.exponentialRampToValueAtTime(.0001, start + duration)
    oscillator.connect(gain).connect(this.output!)
    this.track(oscillator)
    oscillator.start(start)
    oscillator.stop(start + duration + .02)
  }

  private burst(from: number, to: number, duration: number, volume: number, delay = 0) {
    const context = this.context!
    const start = context.currentTime + delay
    const source = context.createBufferSource()
    const filter = context.createBiquadFilter()
    const gain = context.createGain()
    source.buffer = this.noise!
    filter.type = 'lowpass'
    filter.frequency.setValueAtTime(from, start)
    filter.frequency.exponentialRampToValueAtTime(to, start + duration)
    gain.gain.setValueAtTime(.0001, start)
    gain.gain.exponentialRampToValueAtTime(volume, start + .018)
    gain.gain.exponentialRampToValueAtTime(.0001, start + duration)
    source.connect(filter).connect(gain).connect(this.output!)
    this.track(source)
    source.start(start, Math.random() * .25)
    source.stop(start + duration + .025)
  }

  play(sound: Sound, strength = 1) {
    if (!this.enabled || this.context?.state !== 'running') return
    switch (sound) {
      case 'click': this.tone(480, 315, .09, .11, 'triangle'); break
      case 'select': this.tone(435, 680, .11, .13, 'triangle'); break
      case 'drop-orb':
        this.tone(890, 168, .68, .085, 'triangle')
        this.burst(470, 3200, .57, .10, .12)
        break
      case 'drop-pod':
        this.tone(382, 690, .31, .13, 'triangle')
        this.tone(721, 302, .53, .13, 'sine', .38)
        this.burst(980, 175, .37, .14, .63)
        break
      case 'drop-core':
        this.tone(96, 194, .95, .20, 'sine')
        this.tone(158, 252, .81, .12, 'triangle', .26)
        this.burst(580, 3250, .69, .18, .71)
        break
      case 'orb':
        this.burst(3500, 240, .34, .56)
        this.tone(146, 56, .3, .41)
        break
      case 'pod':
        this.burst(3650, 116, .71, .67)
        this.tone(223, 66, .69, .47, 'triangle')
        this.tone(404, 149, .5, .19, 'sine', .12)
        break
      case 'core':
        this.burst(1600, 52, 2.07, .73)
        this.tone(84, 31, 1.78, .72)
        this.tone(169, 42, 1.31, .35, 'triangle', .15)
        this.burst(770, 90, 1.44, .34, .31)
        break
      case 'impact':
        this.burst(650 + 770 * strength, 120, .22, .075 + strength * .11)
        this.tone(110 + strength * 44, 48, .13, .052 + strength * .08)
        break
      case 'rebuild':
        this.tone(266, 392, .22, .19, 'triangle')
        this.tone(390, 532, .21, .13, 'triangle', .095)
        this.tone(520, 785, .22, .13, 'sine', .17)
        break
    }
  }

  private track(source: AudioScheduledSourceNode) {
    this.active.add(source)
    source.addEventListener('ended', () => this.active.delete(source), { once: true })
  }

  clear() {
    for (const source of this.active) source.stop()
    this.active.clear()
  }

  dispose() {
    this.clear()
    if (this.context?.state !== 'closed') void this.context?.close().catch(() => {})
  }
}
