import * as T from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import type { Height } from './model'

const leapTime = .48
const foldTime = .76
const canopyRadius = 2.08
const canopyY = 2.91
const landingOffsets = [[0, 0], [-2.4, 0], [2.4, 0], [0, 2.8], [-3.6, 2.8], [3.6, 2.8], [0, 5.6]] as const

type Flight = {
  root: T.Group
  doll: T.Mesh
  wing: T.Group
  from: T.Vector3
  to: T.Vector3
  age: number
  duration: number
  stage: 'ready' | 'descending' | 'landed'
  phase: number
}

function colored(geometry: T.BufferGeometry, color: string) {
  const tint = new T.Color(color)
  const values = new Float32Array(geometry.getAttribute('position').count * 3)
  for (let i = 0; i < values.length; i += 3) tint.toArray(values, i)
  return geometry.setAttribute('color', new T.BufferAttribute(values, 3))
}

function figureGeometry() {
  const parts: T.BufferGeometry[] = []
  const part = (geometry: T.BufferGeometry, color: string, x: number, y: number, z: number, tilt = 0) => {
    const triangles = geometry.toNonIndexed()
    geometry.dispose()
    parts.push(colored(triangles.rotateZ(tilt).translate(x, y, z), color))
  }
  part(new T.SphereGeometry(.38, 12, 8), '#f8c795', 0, 1.88, .02)
  part(new T.SphereGeometry(.40, 12, 6, 0, Math.PI * 2, 0, Math.PI * .48), '#fdf1d3', 0, 1.93, .02)
  part(new T.CapsuleGeometry(.32, .51, 3, 9), '#f3994e', 0, 1.19, 0)
  part(new T.BoxGeometry(.52, .36, .22), '#304d61', 0, 1.31, -.28)
  for (const side of [-1, 1]) {
    part(new T.CapsuleGeometry(.11, .48, 2, 6), '#f8a854', side * .40, 1.42, 0, -side * .83)
    part(new T.SphereGeometry(.115, 8, 5), '#f8c795', side * .63, 1.61, .01)
    part(new T.CapsuleGeometry(.13, .41, 2, 6), '#304d61', side * .16, .47, 0, side * .12)
    part(new T.BoxGeometry(.24, .18, .34), '#263b47', side * .20, .12, .081)
  }
  const figure = mergeGeometries(parts)
  parts.forEach((item) => item.dispose())
  return figure
}

function canopyGeometry() {
  const segments = 32
  const dome = new T.SphereGeometry(1, segments, 9, 0, Math.PI * 2, 0, Math.PI * .5)
  const geometry = dome.toNonIndexed()
  dome.dispose()
  const vertex = geometry.getAttribute('position')
  const colors = new Float32Array(vertex.count * 3)
  const stripe = new T.Color('#f9e2b4')
  const panel = new T.Color('#fffdfa')
  for (let i = 0; i < vertex.count; i += 3) {
    const x = vertex.getX(i) + vertex.getX(i + 1) + vertex.getX(i + 2)
    const z = vertex.getZ(i) + vertex.getZ(i + 1) + vertex.getZ(i + 2)
    const sector = Math.floor((Math.atan2(z, x) / (Math.PI * 2) + 1) * 8) % 8
    const color = sector % 2 ? panel : stripe
    for (let j = 0; j < 3; j++) color.toArray(colors, (i + j) * 3)
  }
  geometry.setAttribute('color', new T.BufferAttribute(colors, 3))
  return geometry.scale(canopyRadius, 1.28, canopyRadius).translate(0, canopyY, 0)
}

export class Parachutes {
  readonly root = new T.Group()
  private readonly flights: Flight[]

  constructor(private readonly ground: Height, private readonly clearGround: (x: number, z: number) => boolean, capacity: number) {
    const figure = figureGeometry()
    const figureMaterial = new T.MeshStandardMaterial({ vertexColors: true, roughness: .84 })
    const canopy = canopyGeometry()
    const edge = new T.TorusGeometry(canopyRadius, .058, 6, 32).rotateX(Math.PI * .5).translate(0, canopyY - .015, 0)
    const cords = new T.BufferGeometry()
    const points: T.Vector3[] = []
    for (let i = 0; i < 8; i++) {
      const angle = (i + .5) * Math.PI / 4
      points.push(new T.Vector3(Math.cos(angle) * canopyRadius, canopyY, Math.sin(angle) * canopyRadius),
        new T.Vector3(Math.sign(Math.cos(angle)) * .27, .05, Math.sign(Math.sin(angle)) * .13))
    }
    cords.setFromPoints(points)
    const cordMaterial = new T.LineBasicMaterial({ color: '#fff5d9' })
    const edgeMaterial = new T.MeshStandardMaterial({ color: '#fff3d3', roughness: .78 })
    const palettes = ['#ff9f72', '#9affdb', '#ffd971', '#8cddff'].map((color) => new T.MeshStandardMaterial({
      color, vertexColors: true, side: T.DoubleSide, roughness: .76, emissive: color, emissiveIntensity: .12,
    }))
    this.flights = Array.from({ length: capacity }, (_, index) => {
      const root = new T.Group()
      const doll = new T.Mesh(figure, figureMaterial)
      const wing = new T.Group()
      wing.position.y = 1.53
      wing.add(new T.Mesh(canopy, palettes[index % palettes.length]), new T.Mesh(edge, edgeMaterial), new T.LineSegments(cords, cordMaterial))
      root.add(doll, wing)
      root.visible = false
      this.root.add(root)
      return { root, doll, wing, from: new T.Vector3(), to: new T.Vector3(), age: 0, duration: 0, stage: 'ready', phase: index * 1.63 }
    })
  }

  launch(index: number, x: number, y: number, z: number) {
    const flight = this.flights[index]
    if (flight.stage !== 'ready') return
    const wantedX = T.MathUtils.clamp(x + (index % 4 - 1.5) * 1.62, -42, 42)
    const wantedZ = 29.9 + index % 3 * 1.4
    const spot = landingOffsets.find(([dx, dz]) => {
      const px = wantedX + dx
      const pz = wantedZ + dz
      if (!this.clearGround(px, pz)) return false
      return this.flights.every((other) => other.stage === 'ready' || Math.hypot(other.to.x - px, other.to.z - pz) > 1.25)
    })
    const landingX = wantedX + (spot?.[0] ?? 0)
    const landingZ = wantedZ + (spot?.[1] ?? 7.4)
    flight.from.set(x, y + 2.5, z)
    flight.to.set(landingX, this.ground(landingX, landingZ) + .055, landingZ)
    flight.age = -(index % 4) * .16
    flight.duration = 3.25 + index % 4 * .23
    flight.stage = 'descending'
    flight.root.rotation.y = Math.atan2(landingX - x, landingZ - z)
    flight.wing.visible = false
  }

  update(dt: number) {
    for (const flight of this.flights) {
      if (flight.stage === 'ready') continue
      const { root, doll, wing, from, to } = flight
      flight.age += dt
      if (flight.age < 0) continue
      root.visible = true
      to.y = this.ground(to.x, to.z) + .055
      if (flight.stage === 'landed') {
        const fold = T.MathUtils.smoothstep(flight.age, 0, foldTime)
        root.position.copy(to)
        wing.visible = fold < 1
        wing.scale.set(1 - fold * .84, 1 - fold * .93, 1 - fold * .84)
        wing.rotation.set(fold * .86, 0, fold * .40)
        doll.rotation.set(fold * .035, 0, 0)
        continue
      }

      const leap = Math.min(1, flight.age / leapTime)
      const glide = T.MathUtils.clamp((flight.age - leapTime) / flight.duration, 0, 1)
      const cruise = .12 * leap + .88 * glide
      const sway = Math.sin(glide * Math.PI) * Math.sin(glide * 12 + flight.phase)
      root.position.lerpVectors(from, to, cruise)
      root.position.x += sway * .76
      root.position.y = T.MathUtils.lerp(from.y - 1.12 * leap, to.y, glide ** 1.52)
        + Math.sin(leap * Math.PI) * 1.07 + sway * .17
      const open = T.MathUtils.smoothstep(flight.age, leapTime, leapTime + .38)
      wing.visible = open > .04
      wing.scale.setScalar(.06 + open * .94)
      wing.rotation.set(.06 + sway * .07, 0, sway * .11)
      doll.rotation.set((1 - leap) * -.27 + .12 * sway, 0, -.15 * sway)
      if (glide === 1) {
        flight.stage = 'landed'
        flight.age = 0
      }
    }
  }

  clear() {
    for (const flight of this.flights) {
      flight.stage = 'ready'
      flight.wing.visible = flight.root.visible = false
    }
  }

  get airborne() { return this.flights.filter(({ stage }) => stage === 'descending').length }
  get open() { return this.flights.filter(({ stage, wing }) => stage === 'descending' && wing.visible && wing.scale.x > .65).length }
  get landed() { return this.flights.filter(({ stage }) => stage === 'landed').length }
  get landingsClear() { return this.flights.every(({ stage, to }) => stage !== 'landed' || this.clearGround(to.x, to.z)) }
}
