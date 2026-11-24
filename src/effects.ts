import * as T from 'three'
import { type Height, randomSource } from './model'
import type { Quality, Tool } from './world'

interface Particle {
  position: T.Vector3
  velocity: T.Vector3
  color: T.Color
  life: number
  age: number
  size: number
  rise: number
  bright: number
  twist: number
}

class ParticleLayer {
  readonly mesh: T.Points
  private count = 0
  private readonly pool: Particle[]
  private readonly positions: T.BufferAttribute
  private readonly colors: T.BufferAttribute
  private readonly sizes: T.BufferAttribute
  private readonly alphas: T.BufferAttribute

  constructor(private capacity: number, hot: boolean) {
    const geometry = new T.BufferGeometry()
    this.positions = new T.BufferAttribute(new Float32Array(capacity * 3), 3).setUsage(T.DynamicDrawUsage)
    this.colors = new T.BufferAttribute(new Float32Array(capacity * 3), 3).setUsage(T.DynamicDrawUsage)
    this.sizes = new T.BufferAttribute(new Float32Array(capacity), 1).setUsage(T.DynamicDrawUsage)
    this.alphas = new T.BufferAttribute(new Float32Array(capacity), 1).setUsage(T.DynamicDrawUsage)
    geometry.setAttribute('position', this.positions).setAttribute('tint', this.colors).setAttribute('size', this.sizes).setAttribute('alpha', this.alphas)
    geometry.setDrawRange(0, 0)
    const material = new T.ShaderMaterial({
      transparent: true, depthWrite: false, blending: hot ? T.AdditiveBlending : T.NormalBlending,
      uniforms: { hot: { value: hot ? 1 : 0 }, pointScale: { value: 460 } },
      vertexShader: `
        attribute vec3 tint;
        attribute float size;
        attribute float alpha;
        uniform float pointScale;
        varying vec3 vTint;
        varying float vAlpha;
        varying float vSeed;
        void main() {
          vec4 view = modelViewMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * view;
          gl_PointSize = clamp(size * pointScale / max(1.0, -view.z), 1.0, 256.0);
          vTint = tint;
          vAlpha = alpha;
          vSeed = fract(dot(position, vec3(.021, .036, .051)));
        }
      `,
      fragmentShader: `
        uniform float hot;
        varying vec3 vTint;
        varying float vAlpha;
        varying float vSeed;
        void main() {
          vec2 q = gl_PointCoord * 2.0 - 1.0;
          float r = length(q);
          float turbulence = .09 * sin(q.x * 5.5 + q.y * 3.2 + vSeed * 14.0) + .045 * cos(q.y * 8.9 - q.x * 5.2 - vSeed * 7.0);
          float soft = 1.0 - smoothstep(.18, .99, r + turbulence * (1.0 - hot));
          float core = 1.0 - smoothstep(0.0, .43, r);
          gl_FragColor = vec4(vTint * (.78 + core * mix(.18, .88, hot)), soft * soft * vAlpha);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }
      `,
    })
    this.mesh = new T.Points(geometry, material)
    this.mesh.frustumCulled = false
    this.mesh.renderOrder = hot ? 5 : 4
    this.pool = Array.from({ length: capacity }, () => ({
      position: new T.Vector3(), velocity: new T.Vector3(), color: new T.Color(), life: 0, age: 0, size: 0, rise: 0, bright: 0, twist: 0,
    }))
  }

  add(x: number, y: number, z: number, vx: number, vy: number, vz: number,
    color: T.ColorRepresentation, size: number, life: number, rise: number, alpha: number, twist = 0, delay = 0) {
    if (this.count >= this.capacity) return
    const p = this.pool[this.count++]
    p.position.set(x, y, z)
    p.velocity.set(vx, vy, vz)
    p.color.set(color)
    p.size = size
    p.life = life
    p.age = -delay
    p.rise = rise
    p.bright = alpha
    p.twist = twist
  }

  update(dt: number, scale: number) {
    const material = this.mesh.material as T.ShaderMaterial
    material.uniforms.pointScale.value = scale
    for (let i = 0; i < this.count; i++) {
      const p = this.pool[i]
      p.age += dt
      if (p.age < 0) {
        this.alphas.setX(i, 0)
        continue
      }
      if (p.age >= p.life) {
        this.pool[i] = this.pool[--this.count]
        this.pool[this.count] = p
        i--
        continue
      }
      p.velocity.y += p.rise * dt
      p.position.addScaledVector(p.velocity, dt)
      p.position.x += Math.sin(p.age * 2.3 + i) * p.twist * dt
      p.position.z += Math.cos(p.age * 2.1 + i) * p.twist * dt
      const life = p.age / p.life
      this.positions.setXYZ(i, p.position.x, p.position.y, p.position.z)
      this.colors.setXYZ(i, p.color.r, p.color.g, p.color.b)
      this.sizes.setX(i, p.size * (.7 + life * 1.32))
      this.alphas.setX(i, p.bright * Math.min(1, life * 16 + .22) * Math.pow(1 - life, .92))
    }
    this.positions.needsUpdate = this.colors.needsUpdate = this.sizes.needsUpdate = this.alphas.needsUpdate = true
    this.mesh.geometry.setDrawRange(0, this.count)
  }

  clear() {
    this.count = 0
    this.mesh.geometry.setDrawRange(0, 0)
  }

  get active() { return this.count }
}

const presets = {
  grenade: { range: 5, flash: 1.6, duration: .48, color: '#ffb45e', hot: 64, dust: 31, shake: .31 },
  missile: { range: 12, flash: 4, duration: .81, color: '#ff693e', hot: 160, dust: 80, shake: .72 },
  nuke: { range: 25, flash: 7.5, duration: 1.35, color: '#ffc3a7', hot: 280, dust: 160, shake: 1.16 },
} as const

export class Effects {
  readonly root = new T.Group()
  private readonly sparks = new ParticleLayer(1000, true)
  private readonly smoke = new ParticleLayer(1050, false)
  private readonly random = randomSource(7713)
  private readonly waves: { mesh: T.Mesh<T.RingGeometry, T.MeshBasicMaterial>, age: number, delay: number, duration: number, radius: number }[] = []
  private readonly flashes: { mesh: T.Mesh<T.IcosahedronGeometry, T.MeshBasicMaterial>, age: number, duration: number, size: number }[] = []
  private readonly scars: T.Mesh<T.CircleGeometry, T.ShaderMaterial>[] = []
  private readonly light = new T.PointLight('#ffc374', 0, 57, 1.75)
  private readonly missile = new T.Mesh(new T.SphereGeometry(.3, 12, 8), new T.MeshBasicMaterial({ color: '#fff1ae' }))
  private flight?: { to: T.Vector3, age: number }
  private shake = 0
  private lightPower = 0
  private qualityFactor = 1
  private scarIndex = 0
  private waveIndex = 0
  private flashIndex = 0

  constructor(private ground: Height) {
    this.root.add(this.sparks.mesh, this.smoke.mesh, this.light, this.missile)
    this.missile.visible = false
    const ring = new T.RingGeometry(.93, 1, 72)
    const sphere = new T.IcosahedronGeometry(1, 2)
    for (let i = 0; i < 12; i++) {
      const mesh = new T.Mesh(ring, new T.MeshBasicMaterial({ transparent: true, side: T.DoubleSide, blending: T.AdditiveBlending, depthWrite: false }))
      mesh.rotation.x = -Math.PI / 2
      mesh.visible = false
      mesh.renderOrder = 6
      this.waves.push({ mesh, age: 0, delay: 0, duration: 0, radius: 0 })
      this.root.add(mesh)
    }
    for (let i = 0; i < 6; i++) {
      const mesh = new T.Mesh(sphere, new T.MeshBasicMaterial({ transparent: true, blending: T.AdditiveBlending, depthWrite: false }))
      mesh.visible = false
      mesh.renderOrder = 5
      this.flashes.push({ mesh, age: 0, duration: 0, size: 0 })
      this.root.add(mesh)
    }
    for (let i = 0; i < 16; i++) {
      const geometry = new T.CircleGeometry(1, 42).rotateX(-Math.PI / 2)
      const overlay = new T.ShaderMaterial({
        transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1,
        uniforms: {},
        vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
        fragmentShader: `varying vec2 vUv; void main() { vec2 q = vUv * 2.0 - 1.0; float edge = length(q) + .07 * sin(q.x * 34.0) * sin(q.y * 31.0); gl_FragColor = vec4(.10, .058, .042, .73 * (1.0 - smoothstep(.13, .99, edge))); }`,
      })
      const scar = new T.Mesh(geometry, overlay)
      scar.visible = false
      scar.renderOrder = 1
      scar.frustumCulled = false
      this.scars.push(scar)
      this.root.add(scar)
    }
  }

  setQuality(quality: Quality) { this.qualityFactor = quality === 'low' ? .48 : quality === 'medium' ? .73 : 1 }

  launch(to: T.Vector3) { this.flight = { to: to.clone(), age: 0 }; this.missile.visible = true }

  private addScar(at: T.Vector3, radius: number) {
    const scar = this.scars[this.scarIndex++ % this.scars.length]
    const attribute = scar.geometry.getAttribute('position')
    const uv = scar.geometry.getAttribute('uv')
    for (let i = 0; i < attribute.count; i++) {
      const x = at.x + (uv.getX(i) * 2 - 1) * radius
      const z = at.z - (uv.getY(i) * 2 - 1) * radius * .76
      attribute.setXYZ(i, x, this.ground(x, z) + .039, z)
    }
    attribute.needsUpdate = true
    scar.visible = true
  }

  erupt(tool: Tool, at: T.Vector3) {
    const preset = presets[tool]
    const x = at.x
    const z = at.z
    const y = this.ground(x, z) + .3
    const origin = Math.min(at.y, y + 4)
    const rng = this.random
    this.shake = Math.max(this.shake, preset.shake)
    this.light.position.set(x, origin + preset.flash, z)
    this.light.color.set(preset.color)
    this.lightPower = 90 + preset.flash * 119
    this.addScar(at, preset.range * .29)

    for (let i = 0; i < (tool === 'grenade' ? 1 : tool === 'missile' ? 2 : 3); i++) {
      const wave = this.waves[this.waveIndex++ % this.waves.length]
      wave.age = 0
      wave.delay = i * .15
      wave.duration = preset.duration * 1.36
      wave.radius = preset.range * (1.05 + i * .35)
      wave.mesh.position.set(x, y + .23 + i * .34, z)
      wave.mesh.scale.setScalar(.01)
      wave.mesh.material.color.set(i ? '#ff925a' : preset.color)
      wave.mesh.visible = true
    }
    for (let i = 0; i < 2; i++) {
      const flash = this.flashes[this.flashIndex++ % this.flashes.length]
      flash.age = 0
      flash.duration = preset.duration * (i ? .46 : .83)
      flash.size = preset.flash * (i ? .77 : 1.32)
      flash.mesh.position.set(x, origin + preset.flash * .48, z)
      flash.mesh.scale.setScalar(.12)
      flash.mesh.material.color.set(i ? '#fff4cb' : preset.color)
      flash.mesh.visible = true
    }
    for (let i = 0; i < preset.hot * this.qualityFactor; i++) {
      const angle = rng() * Math.PI * 2
      const speed = (.2 + rng() * .8) * preset.range * 1.9
      const gold = i % 3 ? '#ffac55' : '#fff3a6'
      const tint = tool === 'nuke' && i % 5 === 0 ? '#ebc3ff' : gold
      this.sparks.add(x, origin + rng() * preset.flash * .39, z, Math.cos(angle) * speed, 2 + rng() * preset.flash * 2.6, Math.sin(angle) * speed,
        tint, .15 + rng() * (preset.flash * .29), .18 + rng() * preset.duration * 1.5, -9 - rng() * 13, .66 + rng() * .32)
    }
    for (let i = 0; i < preset.dust * this.qualityFactor; i++) {
      const angle = rng() * Math.PI * 2
      const radius = rng() * preset.flash
      const velocity = preset.range * (.14 + rng() * .44)
      const tint = i % 3 ? '#aa826f' : '#5c554c'
      this.smoke.add(x + Math.cos(angle) * radius, origin + .2 + rng() * 1.08, z + Math.sin(angle) * radius,
        Math.cos(angle) * velocity, rng() * preset.flash * .86, Math.sin(angle) * velocity, tint,
        .8 + rng() * preset.flash * .95, .69 + rng() * (preset.duration * 2.95), .16, .15 + rng() * .37, .24)
    }
    if (tool === 'nuke') this.mushroom(x, origin, z)
  }

  private mushroom(x: number, y: number, z: number) {
    const rng = this.random
    for (let i = 0; i < 240 * this.qualityFactor; i++) {
      const angle = rng() * Math.PI * 2
      const cap = i % 3 !== 0
      const band = rng()
      const radial = cap ? 1.4 + 3.9 * band : .30 + band * 1.24
      const speed = cap ? 5.8 + Math.cos(band * Math.PI) * 1.25 + rng() * .97 : 1.6 + rng() * 4.65
      const tint = cap ? (i % 5 ? '#deb097' : '#8f7586') : (i % 3 ? '#8a7171' : '#bd8c6e')
      this.smoke.add(x + Math.cos(angle) * radial, y + (cap ? 4.4 : .7 + rng() * 3.1), z + Math.sin(angle) * radial,
        Math.cos(angle) * radial * (cap ? .42 : .22), speed, Math.sin(angle) * radial * (cap ? .42 : .22), tint,
        (cap ? 4.5 : 2.4) + rng() * 3.8, 3.7 + rng() * 3.3, cap ? -1.12 : -.37, cap ? .75 : .60, cap ? .76 : .33,
        cap ? rng() * .36 : rng() * 2.1)
      if (cap && i % 4 === 0) this.sparks.add(x + Math.cos(angle) * radial, y + 3.1, z + Math.sin(angle) * radial,
        Math.cos(angle) * radial, speed * 1.44, Math.sin(angle) * radial, '#ffad72', 2 + rng() * 3, 1.2 + rng() * 1.55, .09, .48)
    }
  }

  update(dt: number, scale: number) {
    this.shake *= Math.exp(-dt * 5.1)
    this.lightPower *= Math.exp(-dt * 8.3)
    this.light.intensity = this.lightPower > .07 ? this.lightPower : 0
    if (this.flight) {
      this.flight.age += dt
      const t = Math.min(this.flight.age / .52, 1)
      const at = this.flight.to
      this.missile.position.set(at.x + (1 - t) * 28, at.y + (1 - t) * 29 + Math.sin(t * Math.PI) * 7, at.z - (1 - t) * 14)
      const { x, y, z } = this.missile.position
      this.sparks.add(x, y, z, 3, 1, -2, '#ff9652', 1.55, .43, -.6, .86)
      this.smoke.add(x, y, z, 1, .3, -1, '#b3a08a', 2.2, 1.1, .7, .33)
      if (t === 1) { this.flight = undefined; this.missile.visible = false }
    }
    for (const wave of this.waves) {
      if (!wave.mesh.visible) continue
      wave.age += dt
      const t = T.MathUtils.clamp((wave.age - wave.delay) / wave.duration, 0, 1)
      wave.mesh.scale.setScalar(.01 + wave.radius * Math.pow(t, .62))
      wave.mesh.material.opacity = t ? (.87 * (1 - t)) : 0
      if (t === 1) wave.mesh.visible = false
    }
    for (const flash of this.flashes) {
      if (!flash.mesh.visible) continue
      flash.age += dt
      const t = Math.min(1, flash.age / flash.duration)
      flash.mesh.scale.setScalar(.16 + flash.size * Math.pow(t, .47))
      flash.mesh.material.opacity = (1 - t) ** 1.55 * .71
      if (t === 1) flash.mesh.visible = false
    }
    this.smoke.update(dt, scale)
    this.sparks.update(dt, scale)
    return this.shake
  }

  clear() {
    this.sparks.clear()
    this.smoke.clear()
    this.flight = undefined
    this.missile.visible = false
    this.lightPower = this.light.intensity = this.shake = 0
    this.scarIndex = this.waveIndex = this.flashIndex = 0
    for (const entity of [...this.waves, ...this.flashes]) entity.mesh.visible = false
    for (const scar of this.scars) scar.visible = false
  }

  get count() { return this.sparks.active + this.smoke.active }
}
