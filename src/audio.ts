import type { Tool } from './world'

type Sound = 'click' | 'select' | 'impact' | 'rebuild' | 'launch' | Tool

export class AudioEngine {
  private context?: AudioContext
  private output?: GainNode
  private noise?: AudioBuffer
  private enabled: boolean

  constructor(enabled: boolean) {
    this.enabled = enabled
  }

  setEnabled(enabled: boolean) {
    this.enabled = enabled
    if (enabled) this.unlock()
    if (this.context && this.output) this.output.gain.setTargetAtTime(enabled ? .32 : 0, this.context.currentTime, .024)
  }

  unlock() {
    if (!this.enabled || typeof AudioContext === 'undefined') return
    try {
      if (!this.context) {
        this.context = new AudioContext()
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
    source.start(start, Math.random() * .25)
    source.stop(start + duration + .025)
  }

  play(sound: Sound, strength = 1) {
    if (!this.enabled || this.context?.state !== 'running') return
    switch (sound) {
      case 'click': this.tone(480, 315, .09, .11, 'triangle'); break
      case 'select': this.tone(435, 680, .11, .13, 'triangle'); break
      case 'launch': this.burst(380, 1900, .49, .12); break
      case 'grenade':
        this.burst(3500, 160, .35, .66)
        this.tone(120, 45, .35, .39)
        break
      case 'missile':
        this.burst(4400, 71, .94, .85)
        this.tone(98, 31, .86, .67)
        this.burst(580, 110, .75, .24, .21)
        break
      case 'nuke':
        this.burst(1900, 43, 2.4, .87)
        this.tone(78, 29, 2.35, .84)
        this.tone(46, 25, 2.1, .43, 'triangle', .14)
        this.burst(790, 70, 1.7, .38, .39)
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

  dispose() {
    if (this.context?.state !== 'closed') void this.context?.close().catch(() => {})
  }
}
