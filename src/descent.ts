import * as T from 'three'
import { tools, toolOrder, type Tool } from './world'

type Flight = {
  tool: Tool
  root: T.Group
  model: T.Group
  rings: T.Mesh[]
  guide: T.Group
  trace: T.Line
  target: T.Vector3
  range: number
  age: number
  nextMote: number
}

const shape = {
  orb: { height: 29, x: -4, z: -1, size: 1.32, modelScale: 1.27 },
  pod: { height: 36, x: 14, z: -9, size: 1.75, modelScale: 1.32 },
  core: { height: 41, x: -8, z: 4, size: 2.03, modelScale: 1.29 },
}

function glowingRing(radius: number, tube: number, color: string, segments = 36) {
  return new T.Mesh(new T.TorusGeometry(radius, tube, 6, segments), new T.MeshBasicMaterial({ color, toneMapped: false }))
}

function makeModel(tool: Tool) {
  const model = new T.Group()
  const glow = new T.MeshBasicMaterial({ color: tools[tool].color, toneMapped: false })
  const casing = (color: string) => new T.MeshStandardMaterial({ color, roughness: .38, metalness: .26, emissive: tools[tool].color, emissiveIntensity: .16 })
  const rings: T.Mesh[] = []
  if (tool === 'orb') {
    model.add(new T.Mesh(new T.IcosahedronGeometry(.82, 2), casing('#d8a176')))
    const pearl = new T.Mesh(new T.IcosahedronGeometry(.64, 1), new T.MeshBasicMaterial({ color: '#fff3ce', wireframe: true }))
    pearl.scale.setScalar(1.35)
    model.add(pearl)
    rings.push(glowingRing(1.12, .045, '#ffbd72'), glowingRing(.97, .042, '#fff6d5'))
    rings[1].rotation.x = Math.PI * .63
  } else if (tool === 'pod') {
    model.add(new T.Mesh(new T.CylinderGeometry(.70, 1.02, 1.9, 6, 1), casing('#295c68')))
    const cap = new T.Mesh(new T.CylinderGeometry(.36, .70, .43, 6), casing('#bce8dd'))
    cap.position.y = 1.12
    model.add(cap)
    const vent = new T.Mesh(new T.CylinderGeometry(.48, .66, .26, 6), glow)
    vent.position.y = -1.055
    model.add(vent)
    for (let i = 0; i < 6; i++) {
      const angle = i * Math.PI / 3
      const fin = new T.Mesh(new T.BoxGeometry(.11, 1.12, .27), casing('#8cbbb6'))
      fin.position.set(Math.cos(angle) * .87, -.18, Math.sin(angle) * .87)
      fin.rotation.y = -angle
      model.add(fin)
    }
    rings.push(glowingRing(1, .059, '#a4fff1', 6), glowingRing(.74, .042, '#ecfff2', 6))
    rings.forEach((ring, i) => { ring.rotation.x = Math.PI / 2; ring.position.y = i ? .75 : -.64 })
  } else {
    model.add(new T.Mesh(new T.OctahedronGeometry(1.43), casing('#9870b2')))
    model.add(new T.Mesh(new T.OctahedronGeometry(1.12), new T.MeshBasicMaterial({ color: '#f7d6ff', wireframe: true, toneMapped: false })))
    rings.push(glowingRing(1.67, .052, '#f6caff'), glowingRing(1.92, .053, '#b7b4ff'), glowingRing(2.06, .032, '#ffecfa'))
    rings[1].rotation.y = Math.PI / 3
    rings[2].rotation.x = Math.PI / 2
    for (let i = 0; i < 3; i++) {
      const chip = new T.Mesh(new T.OctahedronGeometry(.18), glow)
      chip.position.set(1.92 * Math.cos(i * Math.PI * 2 / 3), 0, 1.92 * Math.sin(i * Math.PI * 2 / 3))
      model.add(chip)
    }
  }
  model.add(...rings)
  return { model, rings }
}

export class Descent {
  readonly root = new T.Group()
  private readonly slots: Flight[]
  private readonly scratch = new T.Vector3()

  constructor() {
    this.slots = toolOrder.flatMap((tool) => Array.from({ length: 3 }, (): Flight => {
      const root = new T.Group()
      const { model, rings } = makeModel(tool)
      model.scale.setScalar(shape[tool].modelScale)
      const guide = new T.Group()
      const guideMaterial = new T.MeshBasicMaterial({ color: tools[tool].color, transparent: true, opacity: .76, side: T.DoubleSide, depthWrite: false })
      const ring = new T.Mesh(new T.RingGeometry(.94, 1, tool === 'pod' ? 6 : 48), guideMaterial)
      const cross = new T.Mesh(new T.RingGeometry(.16, .23, 20), guideMaterial)
      ring.rotation.x = cross.rotation.x = -Math.PI / 2
      ring.scale.setScalar(shape[tool].size)
      guide.add(ring, cross)
      const line = new T.BufferGeometry().setAttribute('position', new T.BufferAttribute(new Float32Array(16 * 3), 3).setUsage(T.DynamicDrawUsage))
      const trace = new T.Line(line, new T.LineBasicMaterial({ color: tools[tool].color, opacity: .46, transparent: true, depthWrite: false }))
      trace.frustumCulled = false
      model.frustumCulled = false
      root.add(model, guide, trace)
      this.root.add(root)
      root.visible = false
      return { tool, root, model, rings, guide, trace, target: new T.Vector3(), range: 1, age: 0, nextMote: 0 }
    }))
  }

  private pose(tool: Tool, at: T.Vector3, t: number, range: number, result: T.Vector3) {
    const s = shape[tool]
    if (tool === 'orb') {
      const arc = Math.sin(t * Math.PI) * (1 - t)
      return result.set(at.x + (s.x * (1 - t) + Math.sin(t * 9) * arc * 2.4) * range,
        at.y + .82 + s.height * (1 - t ** 1.77) * range, at.z + (s.z * (1 - t) + Math.cos(t * 7) * arc * 1.45) * range)
    }
    if (tool === 'pod') {
      const brake = .65 * T.MathUtils.smoothstep(t, 0, .61) + .35 * T.MathUtils.smoothstep(t, .63, 1)
      return result.set(at.x + s.x * (1 - t) ** 2 * range, at.y + 1.06 + s.height * (1 - brake) * range, at.z + s.z * (1 - t) ** 1.5 * range)
    }
    const hover = .16 * T.MathUtils.smoothstep(t, 0, .42)
    const plunge = .84 * T.MathUtils.smoothstep(t, .42, 1) ** 1.7
    return result.set(at.x + s.x * (1 - t) ** 2 * range, at.y + 1.38 + s.height * (1 - hover - plunge) * range, at.z + s.z * (1 - t) ** 2 * range)
  }

  private fitRange(tool: Tool, target: T.Vector3, camera: T.Camera) {
    const fits = (range: number) => {
      const p = this.pose(tool, target, 0, range, this.scratch).project(camera)
      return Math.abs(p.x) <= .94 && p.y <= .83 && Math.abs(p.z) <= 1
    }
    if (fits(1)) return 1
    let low = .12
    let high = 1
    for (let i = 0; i < 7; i++) {
      const mid = (low + high) * .5
      if (fits(mid)) low = mid
      else high = mid
    }
    return low
  }

  launch(tool: Tool, point: T.Vector3, camera: T.Camera) {
    const flight = this.slots.find((slot) => slot.tool === tool && !slot.root.visible)
    if (!flight) return false
    flight.age = 0
    flight.nextMote = 0
    flight.target.copy(point)
    flight.range = this.fitRange(tool, point, camera)
    flight.guide.position.set(point.x, point.y + .17, point.z)
    flight.guide.scale.setScalar(1)
    this.pose(tool, point, 0, flight.range, flight.model.position)
    flight.model.rotation.set(0, 0, 0)
    const positions = flight.trace.geometry.getAttribute('position')
    for (let i = 0; i < positions.count; i++) {
      const at = this.pose(tool, point, i / (positions.count - 1), flight.range, this.scratch)
      positions.setXYZ(i, at.x, at.y, at.z)
    }
    positions.needsUpdate = true
    flight.root.visible = true
    return true
  }

  update(dt: number, impact: (tool: Tool, point: T.Vector3) => void, mote: (tool: Tool, point: T.Vector3) => void) {
    for (const f of this.slots) {
      if (!f.root.visible) continue
      f.age += dt
      const t = Math.min(1, f.age / tools[f.tool].descent)
      if (t === 1) {
        f.root.visible = false
        impact(f.tool, f.target)
        continue
      }
      this.pose(f.tool, f.target, t, f.range, f.model.position)
      f.guide.scale.setScalar(1 + .16 * Math.sin(t * 12) + .44 * t)
      if (f.tool === 'orb') f.model.rotation.set(t * 8.2, t * 4, t * 3.4)
      if (f.tool === 'pod') {
        f.model.rotation.set(-.63 * (1 - t), t * 5.1, .38 * (1 - t))
        const brake = 1 + .52 * Math.sin(Math.PI * T.MathUtils.smoothstep(t, .46, .85))
        for (const ring of f.rings) ring.scale.setScalar(brake)
      }
      if (f.tool === 'core') {
        f.model.rotation.set(.3 + t * 1.1, t * 4.8, t * .7)
        for (let i = 0; i < f.rings.length; i++) f.rings[i].rotation.set(t * (4 - i), i * 1.05, t * (i + 1))
      }
      if (f.age >= f.nextMote) {
        mote(f.tool, f.model.position)
        f.nextMote += .042
      }
    }
  }

  inspect() {
    return this.slots.filter(({ root }) => root.visible).map((f) => ({
      tool: f.tool, progress: f.age / tools[f.tool].descent, height: f.model.position.y - f.target.y,
    }))
  }

  clear() { for (const flight of this.slots) flight.root.visible = false }
  get count() { return this.slots.filter(({ root }) => root.visible).length }
}
