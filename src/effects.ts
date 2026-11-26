import * as T from 'three'
import { type Height, randomSource } from './model'
import { tools, toolOrder, type Quality, type Tool } from './world'

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
    if (!this.count) return
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

const impactStyle = {
  orb: { flash: 2.9, shake: .35, duration: .48, waves: [7], light: 120 },
  pod: { flash: 3.5, shake: .66, duration: .78, waves: [12, 16], light: 190 },
  core: { flash: 7.6, shake: 1.13, duration: 1.12, waves: [19, 23, 29], light: 335 },
}

type Wave = {
  mesh: T.Mesh<T.RingGeometry, T.MeshBasicMaterial>, center: T.Vector3, outline: Float32Array,
  age: number, duration: number, radius: number, surface: boolean,
}

type Flash = { mesh: T.Mesh<T.BufferGeometry, T.MeshBasicMaterial>, age: number, tool: Tool }

class Chips {
  readonly mesh = new T.InstancedMesh(new T.DodecahedronGeometry(1), new T.MeshStandardMaterial({ roughness: .89, flatShading: true }), 110)
  private readonly fields = Array.from({ length: this.mesh.count }, () => ({
    p: new T.Vector3(), v: new T.Vector3(), color: new T.Color(), age: 0, life: 1, size: .2, spin: 1,
  }))
  private readonly object = new T.Object3D()
  private readonly rng = randomSource(78244)
  private used = 0

  constructor(private ground: Height) {
    this.mesh.frustumCulled = false
    this.mesh.receiveShadow = true
    this.mesh.instanceMatrix.setUsage(T.DynamicDrawUsage)
    this.mesh.count = 0
  }

  scatter(at: T.Vector3, count: number, distance: number) {
    for (let i = 0; i < count && this.used < this.fields.length; i++) {
      const bit = this.fields[this.used++]
      const a = this.rng() * Math.PI * 2
      const speed = (.35 + this.rng() * .64) * distance
      bit.p.set(at.x + this.rng() - .5, at.y + .45 + this.rng(), at.z + this.rng() - .5)
      bit.v.set(Math.cos(a) * speed, 2.7 + this.rng() * 6.2, Math.sin(a) * speed)
      bit.color.set(['#c5ad95', '#aba48f', '#88877c'][i % 3])
      bit.age = 0
      bit.life = 1.17 + this.rng() * 1.22
      bit.size = .12 + this.rng() * .27
      bit.spin = (this.rng() - .5) * 7
    }
  }

  update(dt: number) {
    if (!this.used) return
    for (let i = 0; i < this.used; i++) {
      const bit = this.fields[i]
      bit.age += dt
      if (bit.age >= bit.life) {
        this.fields[i] = this.fields[--this.used]
        this.fields[this.used] = bit
        i--
        continue
      }
      bit.v.y -= 17.6 * dt
      bit.p.addScaledVector(bit.v, dt)
      const floor = this.ground(bit.p.x, bit.p.z) + bit.size * .48
      if (bit.p.y < floor) {
        bit.p.y = floor
        bit.v.y = Math.max(0, -bit.v.y * .23)
        bit.v.x *= .69
        bit.v.z *= .69
      }
      const size = bit.size * (1 - T.MathUtils.smoothstep(bit.age / bit.life, .63, 1))
      this.object.position.copy(bit.p)
      this.object.rotation.set(bit.age * bit.spin, bit.age * 2.1, bit.age * -1.2)
      this.object.scale.set(size, size * .71, size * 1.18)
      this.object.updateMatrix()
      this.mesh.setMatrixAt(i, this.object.matrix)
      this.mesh.setColorAt(i, bit.color)
    }
    this.mesh.count = this.used
    this.mesh.instanceMatrix.needsUpdate = true
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true
  }

  clear() { this.used = this.mesh.count = 0 }
  get active() { return this.used }
}

export class Effects {
  readonly root = new T.Group()
  private readonly sparks = new ParticleLayer(850, true)
  private readonly smoke = new ParticleLayer(880, false)
  private readonly random = randomSource(7713)
  private readonly waves: Record<Tool, Wave[]>
  private readonly flashes: Flash[]
  private readonly chips: Chips
  private readonly light = new T.PointLight('#ffd090', 0, 49, 1.75)
  private shake = 0
  private lightPower = 0
  private quality = 1

  constructor(private ground: Height) {
    this.chips = new Chips(ground)
    this.root.add(this.sparks.mesh, this.smoke.mesh, this.chips.mesh, this.light)
    const makeWave = (tool: Tool): Wave[] => {
      const geometry = new T.RingGeometry(tool === 'core' ? .94 : .917, 1, tool === 'pod' ? 6 : 84)
      const pool = Array.from({ length: 8 }, () => {
        const material = new T.MeshBasicMaterial({ color: tool === 'core' ? '#cd8fff' : tools[tool].color, transparent: true, side: T.DoubleSide,
          blending: T.AdditiveBlending, depthWrite: false, toneMapped: false })
        const mesh = new T.Mesh(geometry.clone(), material)
        mesh.visible = false
        mesh.frustumCulled = false
        mesh.renderOrder = 7
        this.root.add(mesh)
        const outline = new Float32Array(mesh.geometry.getAttribute('position').array)
        return { mesh, outline, center: new T.Vector3(), age: 0, duration: 1, radius: 1, surface: true }
      })
      geometry.dispose()
      return pool
    }
    this.waves = { orb: makeWave('orb'), pod: makeWave('pod'), core: makeWave('core') }
    const geometries: Record<Tool, T.BufferGeometry> = {
      orb: new T.IcosahedronGeometry(1, 2),
      pod: new T.CylinderGeometry(1, 1, 1, 6, 1, true),
      core: new T.OctahedronGeometry(1, 1),
    }
    this.flashes = toolOrder.flatMap((tool) => Array.from({ length: 3 }, (): Flash => {
      const material = new T.MeshBasicMaterial({ color: tools[tool].color, transparent: true, depthWrite: false,
        blending: T.AdditiveBlending, side: tool === 'pod' ? T.DoubleSide : T.FrontSide, toneMapped: false })
      const mesh = new T.Mesh(geometries[tool], material)
      mesh.visible = false
      mesh.renderOrder = 6
      this.root.add(mesh)
      return { mesh, age: 0, tool }
    }))
  }

  setQuality(value: Quality) { this.quality = value === 'low' ? .54 : value === 'medium' ? .77 : 1 }

  trail(tool: Tool, at: T.Vector3) {
    const rng = this.random
    const { x, y, z } = at
    const scale = tool === 'core' ? 1.8 : tool === 'pod' ? 1.2 : .74
    for (let i = 0; i < 3; i++) this.sparks.add(x + (rng() - .5) * scale, y + .5 * scale, z + (rng() - .5) * scale,
      (rng() - .5) * 2, .6 + rng() * 2, (rng() - .5) * 2, tools[tool].color, scale * (.35 + rng()), .24 + rng() * .36, -.6, .8)
  }

  private plume(at: T.Vector3, count: number, spread: number, life: number, tint: string, delay = 0) {
    const rng = this.random
    for (let i = 0; i < count * this.quality; i++) {
      const angle = rng() * Math.PI * 2
      const speed = spread * (.24 + rng() * .7)
      this.smoke.add(at.x + (rng() - .5) * 1.6, at.y + .22 + rng() * .7, at.z + (rng() - .5) * 1.6,
        Math.cos(angle) * speed, .4 + rng() * (spread * .5), Math.sin(angle) * speed, tint,
        .7 + rng() * spread * .47, .62 + rng() * life, .14, .24 + rng() * .45, .44, rng() * delay)
    }
  }

  landing(at: T.Vector3, strength: number) {
    this.plume(at, Math.min(17, 5 + strength * 3), 2.2 + strength * .4, 1.2, '#b8ab91')
  }

  erupt(tool: Tool, at: T.Vector3) {
    const rng = this.random
    const style = impactStyle[tool]
    const { x, y, z } = at
    const foot = new T.Vector3(x, this.ground(x, z) + .43, z)
    this.light.position.set(x, y + style.flash * .52 + 1.1, z)
    this.light.color.set(tools[tool].color)
    this.lightPower = Math.max(this.lightPower, style.light)
    this.shake = Math.max(this.shake, style.shake)
    this.chips.scatter(at, Math.ceil((tool === 'orb' ? 12 : tool === 'pod' ? 27 : 53) * this.quality), tool === 'orb' ? 8 : tool === 'pod' ? 12 : 16)
    const members = this.waves[tool]
    style.waves.forEach((radius, i) => {
      const wave = members.find(({ mesh }) => !mesh.visible) ?? members.reduce((a, b) => a.age > b.age ? a : b)
      wave.age = -i * (tool === 'pod' ? .19 : .125)
      wave.duration = (tool === 'orb' ? .62 : tool === 'pod' ? .90 : 1.48) + i * .10
      wave.radius = radius
      wave.center.copy(i === 0 ? at : foot)
      wave.center.y += .25 + i * .36
      wave.surface = i > 0 || at.y - foot.y < 1.1
      if (wave.surface) wave.center.y = .23 + i * .28
      wave.mesh.material.opacity = 0
      wave.mesh.visible = true
    })
    const flashes = this.flashes.filter((f) => f.tool === tool)
    const flash = flashes.find(({ mesh }) => !mesh.visible) ?? flashes.reduce((a, b) => a.age > b.age ? a : b)
    flash.age = 0
    flash.mesh.position.set(x, y + (tool === 'pod' ? 1.80 : .65), z)
    flash.mesh.scale.setScalar(.1)
    flash.mesh.visible = true

    if (tool === 'orb') {
      for (let i = 0; i < 54 * this.quality; i++) {
        const a = rng() * Math.PI * 2
        const v = 4.6 + rng() * 8.2
        this.sparks.add(x, y + .18, z, Math.cos(a) * v, 1.1 + rng() * 8, Math.sin(a) * v,
          i % 3 ? '#ffab68' : '#fff0bb', .18 + rng() * .65, .26 + rng() * .65, -12, .89)
      }
      this.plume(foot, 37, 4.7, 1.8, '#9d795e')
    } else if (tool === 'pod') {
      for (let i = 0; i < 116 * this.quality; i++) {
        const axis = i % 6 * Math.PI / 3 + (rng() - .5) * .33
        const speed = 3.5 + rng() * 13
        const column = i % 4 === 0
        this.sparks.add(x + Math.cos(axis), y + .55, z + Math.sin(axis), Math.cos(axis) * speed * (column ? .24 : 1),
          column ? 8.5 + rng() * 13 : .55 + rng() * 4, Math.sin(axis) * speed * (column ? .24 : 1),
          i % 4 ? '#79ecd9' : '#eaffee', .29 + rng() * 1.15, .42 + rng() * .91, column ? -6 : -9, .86, .24, rng() * .21)
      }
      this.plume(foot, 70, 7.6, 2.6, '#a4b1a2', .24)
    } else {
      for (let i = 0; i < 186 * this.quality; i++) {
        const a = i * 2.39996
        const v = 4 + rng() * 17
        const lift = i % 3 === 0 ? 12 + rng() * 12 : 1.9 + rng() * 10
        this.sparks.add(x + Math.cos(a) * 1.3, y + .38 + rng() * 1.09, z + Math.sin(a) * 1.3,
          Math.cos(a) * v, lift, Math.sin(a) * v, i % 3 ? '#efa4ff' : '#fff0d5', .36 + rng() * 1.58,
          .47 + rng() * 1.65, -9.5, .89, 2.1, rng() * .25)
      }
      this.plume(foot, 130, 11.3, 4.0, '#857787', .27)
      this.plume(new T.Vector3(x, y + 1.4, z), 76, 6.6, 4.6, '#ad91ab', 1.1)
    }
  }

  update(dt: number, scale: number) {
    this.shake *= Math.exp(-dt * 4.3)
    this.lightPower *= Math.exp(-dt * 8.7)
    this.light.intensity = this.lightPower < .04 ? 0 : this.lightPower
    for (const wave of Object.values(this.waves).flat()) {
      if (!wave.mesh.visible) continue
      wave.age += dt
      const t = T.MathUtils.clamp(wave.age / wave.duration, 0, 1)
      const span = .01 + wave.radius * Math.pow(t, .60)
      const p = wave.mesh.geometry.getAttribute('position')
      for (let i = 0; i < p.count; i++) {
        const x = wave.center.x + wave.outline[i * 3] * span
        const z = wave.center.z - wave.outline[i * 3 + 1] * span
        p.setXYZ(i, x, wave.surface ? this.ground(x, z) + wave.center.y : wave.center.y, z)
      }
      p.needsUpdate = true
      wave.mesh.material.opacity = t ? .71 * (1 - t) ** .9 : 0
      if (t === 1) wave.mesh.visible = false
    }
    for (const flash of this.flashes) {
      if (!flash.mesh.visible) continue
      const style = impactStyle[flash.tool]
      flash.age += dt
      const t = Math.min(1, flash.age / style.duration)
      const size = .15 + style.flash * Math.pow(t, .47)
      if (flash.tool === 'pod') {
        flash.mesh.scale.set(size * .64, 1.1 + 12 * Math.sin(t * Math.PI), size * .64)
        flash.mesh.rotation.y += dt * 2.9
      } else {
        flash.mesh.scale.set(size, size * (flash.tool === 'core' ? .73 + .5 * t : 1), size)
        if (flash.tool === 'core') flash.mesh.rotation.y += dt * 3.7
      }
      flash.mesh.material.opacity = .68 * (1 - t) ** 1.6
      if (t === 1) flash.mesh.visible = false
    }
    this.smoke.update(dt, scale)
    this.sparks.update(dt, scale)
    this.chips.update(dt)
    return this.shake
  }

  clear() {
    this.sparks.clear()
    this.smoke.clear()
    this.chips.clear()
    this.lightPower = this.light.intensity = this.shake = 0
    for (const item of [...Object.values(this.waves).flat(), ...this.flashes]) item.mesh.visible = false
  }

  get count() { return this.sparks.active + this.smoke.active + this.chips.active }
}
