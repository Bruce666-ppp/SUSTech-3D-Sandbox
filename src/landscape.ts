import * as T from 'three'
import { type Bounds, type Point, Instances, inside, makeTerrain, makeWater, planar, randomSource, rectangle, ribbon } from './model'
import type { Quality, Tool } from './world'

export const landscapeBounds: Bounds = [-72, -62, 72, 62]
const waterLevel = .23
const poolCenter: Point = [36, 30]
const sportsField: Point = [-31, 39]
const sportsLevel = 1.81
const lakeEdge = Array.from({ length: 84 }, (_, i): Point => {
  const a = i / 84 * Math.PI * 2
  const variation = 1 + .10 * Math.sin(a * 3 + .7) + .045 * Math.cos(a * 5)
  return [poolCenter[0] + 17 * Math.cos(a) * variation, poolCenter[1] + 12.6 * Math.sin(a) * variation]
})
const hills = [
  [-54, -34, 19, 231], [-34, -47, 25, 205], [-11, -51, 20, 186], [11, -49, 18, 203],
  [33, -43, 24, 201], [57, -36, 21, 219], [62, -5, 16, 158], [-57, -6, 13, 204],
  [-56, 24, 9, 218], [59, 43, 8, 153], [-43, 47, 8, 201],
]

export function isWater(x: number, z: number) { return inside(x, z, lakeEdge) }

export function ground(x: number, z: number) {
  let y = 1.4 + .74 * Math.sin(x * .105 + z * .16) + .58 * Math.cos(z * .17 - x * .13) - .015 * z
  for (const [a, b, height, width] of hills) y += height * Math.exp(-((x - a) ** 2 + (z - b) ** 2) / width)
  y += T.MathUtils.smoothstep(y, 5, 22) * (.78 * Math.sin(x * .52 + z * .17) + .54 * Math.cos(z * .62 - x * .16))
  const bank = Math.hypot((x - poolCenter[0]) / 18.7, (z - poolCenter[1]) / 14)
  if (bank < 1.37) y = T.MathUtils.lerp(-1.45, y, T.MathUtils.smoothstep(bank, .72, 1.37))
  const field = Math.hypot((x - sportsField[0]) / 12.8, (z - sportsField[1]) / 7.8)
  if (field < 1.2) y = T.MathUtils.lerp(sportsLevel, y, T.MathUtils.smoothstep(field, .89, 1.20))
  return bank < 1.2 && isWater(x, z) ? Math.min(y, waterLevel - .44) : y
}

const roads: { points: Point[], width: number }[] = [
  { points: [[-71, 32], [-55, 31], [-40, 27], [-21, 26], [-10, 26], [6, 24], [18, 19], [25, 12], [40, 9], [56, 8], [71, 13]], width: 2.9 },
  { points: [[-49, 30], [-48, 17], [-47, 3], [-35, -12], [-23, -18], [-6, -18], [10, -17], [26, -14], [42, -10], [50, 1], [55, 8]], width: 2.2 },
  { points: [[-23, -18], [-19, -9], [-18, 2], [-21, 12], [-21, 26]], width: 1.6 },
  { points: [[-21, 12], [-5, 10.5], [4, 9.3], [16, 5.2], [25, 0], [26, -14]], width: 1.7 },
  { points: [[7, 24], [11, 30], [16, 38], [21, 46], [36, 48], [52, 43], [61, 35]], width: .72 },
  { points: [[-46, -6], [-54, -21], [-44, -29], [-33, -30], [-25, -37], [-11, -42], [5, -39], [22, -37], [28, -29], [44, -26], [50, -11]], width: .69 },
  { points: [[-28, 27], [-40, 35], [-42, 47], [-30, 51], [-14, 50], [-8, 42], [-9, 28]], width: .70 },
]

function crackTexture() {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = 256
  const ctx = canvas.getContext('2d')!
  const rng = randomSource(8842)
  const fill = ctx.createRadialGradient(128, 128, 6, 128, 128, 123)
  fill.addColorStop(0, 'rgba(47, 36, 33, .94)')
  fill.addColorStop(.46, 'rgba(70, 52, 43, .86)')
  fill.addColorStop(.71, 'rgba(101, 78, 62, .55)')
  fill.addColorStop(1, 'rgba(130, 101, 77, 0)')
  ctx.fillStyle = fill
  ctx.fillRect(0, 0, 256, 256)
  for (let i = 0; i < 13; i++) {
    let angle = i / 13 * 2 * Math.PI + rng() * .26
    const length = 70 + rng() * 43
    ctx.beginPath()
    ctx.moveTo(128 + 12 * Math.cos(angle), 128 + 12 * Math.sin(angle))
    for (let j = 1; j <= 8; j++) {
      angle += (rng() - .5) * .37
      const r = 12 + length * j / 8
      const x = 128 + r * Math.cos(angle)
      const z = 128 + r * Math.sin(angle)
      ctx.lineTo(x, z)
      if (j % 3 === 0) {
        const side = angle + (rng() > .5 ? 1 : -1) * (.45 + rng() * .58)
        ctx.lineTo(x + Math.cos(side) * 14, z + Math.sin(side) * 14)
        ctx.moveTo(x, z)
      }
    }
    ctx.lineWidth = 1.7 + rng() * 2
    ctx.strokeStyle = 'rgba(24, 20, 23, .86)'
    ctx.stroke()
    ctx.lineWidth = .64
    ctx.strokeStyle = 'rgba(229, 191, 159, .59)'
    ctx.stroke()
  }
  const texture = new T.CanvasTexture(canvas)
  texture.colorSpace = T.SRGBColorSpace
  return texture
}

const markStyles = {
  orb: { radius: 3.7, depth: .49, tint: '#efb994' },
  pod: { radius: 6.1, depth: .75, tint: '#acc9b7' },
  core: { radius: 10, depth: 1.14, tint: '#d2b3d0' },
}

type Stamp = {
  mesh: T.Mesh<T.PlaneGeometry, T.MeshBasicMaterial>, x: number, z: number,
  radius: number, depth: number, age: number, progress: number, angle: number,
}

export function createLandscape(root: T.Group, plots: { x: number, z: number, radius: number }[]) {
  const cedar = new T.Color('#4e775e')
  const meadow = new T.Color('#8d9f6b')
  const summit = new T.Color('#769172')
  const tint = new T.Color()
  const terrain = makeTerrain(landscapeBounds, 112, ground, (x, z, y) => {
    const detail = Math.sin(x * .25 + z * .11) * Math.sin(z * .31 - x * .15)
    tint.copy(y > 7 ? cedar : meadow).lerp(summit, T.MathUtils.smoothstep(y, 8, 26) * .62)
    return tint.multiplyScalar(.91 + Math.cos(.098 * (x + z)) * .08 + detail * .115)
  }, -4.9)
  root.add(terrain.surface, terrain.rim)
  const water = makeWater()
  const lake = new T.Mesh(planar(lakeEdge, () => waterLevel), water.material)
  root.add(lake)

  const surfaces = [terrain.surface.geometry]
  const pavement = new T.MeshStandardMaterial({ color: '#c5bfaa', roughness: .94, side: T.DoubleSide })
  const path = new T.MeshStandardMaterial({ color: '#d6c49d', roughness: 1, side: T.DoubleSide })
  const drape = (geometry: T.BufferGeometry, material: T.Material) => {
    const surface = new T.Mesh(geometry, material)
    surface.receiveShadow = true
    root.add(surface)
    surfaces.push(geometry)
  }
  for (const road of roads) drape(ribbon(road.points, road.width, (x, z) => ground(x, z) + .076), road.width > 1 ? pavement : path)
  const walk = [...lakeEdge.filter((_, i) => i % 3 === 0), lakeEdge[0]].map(([x, z]): Point => [36 + (x - 36) * 1.095, 30 + (z - 30) * 1.095])
  drape(ribbon(walk, .83, (x, z) => Math.max(waterLevel + .21, ground(x, z) + .09)), path)

  const [fieldX, fieldZ] = sportsField
  const trackLevel = sportsLevel + .15
  const lane = (scale: number) => Array.from({ length: 65 }, (_, i): Point => {
    const a = i / 64 * Math.PI * 2
    return [fieldX + scale * Math.cos(a) * 11, fieldZ + scale * Math.sin(a) * 6.4]
  })
  const athleticSurface = (color: string) => new T.MeshStandardMaterial({ color, roughness: .94, side: T.DoubleSide })
  drape(planar(lane(1).slice(0, -1), (x, z) => Math.max(trackLevel, ground(x, z) + .075)), athleticSurface('#ad6c54'))
  drape(planar(rectangle(fieldX, fieldZ, 14.3, 7.45), (x, z) => Math.max(trackLevel + .026, ground(x, z) + .10)), athleticSurface('#779761'))
  const paint = new T.MeshBasicMaterial({ color: '#e0d9bf', side: T.DoubleSide })
  for (const scale of [.87, .92, .97]) drape(ribbon(lane(scale), .064, (x, z) => Math.max(trackLevel + .06, ground(x, z) + .125)), paint)
  drape(ribbon([[fieldX, 35.4], [fieldX, 42.6]], .071, (x, z) => Math.max(trackLevel + .07, ground(x, z) + .14)), paint)

  const leaves = new Instances()
  const trunks = new Instances()
  const stones = new Instances()
  const rng = randomSource(962111)
  const palette = ['#4a7556', '#698b60', '#547e63', '#3b6957', '#839864', '#729b72']
  const roadNodes = roads.flatMap(({ points, width }) => points.slice(1).flatMap(([x, z], i) => {
    const [a, b] = points[i]
    const n = Math.ceil(Math.hypot(x - a, z - b) / 2)
    return Array.from({ length: n + 1 }, (_, j) => [T.MathUtils.lerp(a, x, j / n), T.MathUtils.lerp(b, z, j / n), width * .54 + .86])
  }))
  for (let i = 0; i < 3420; i++) {
    const x = -70 + rng() * 140
    const z = -60 + rng() * 120
    if (Math.abs(x - fieldX) < 12 && Math.abs(z - fieldZ) < 8) continue
    if (isWater(x, z) || plots.some((p) => Math.hypot(x - p.x, z - p.z) < p.radius)) continue
    if (roadNodes.some(([a, b, r]) => Math.abs(a - x) < r && Math.hypot(a - x, b - z) < r)) continue
    const y = ground(x, z)
    const forest = Math.sin(x * .14 + z * .272) * Math.cos(z * .18 - x * .22)
    const size = .64 + rng() * 1.15
    if (rng() < (y > 5 ? .54 + forest * .22 : .19 + forest * .12)) {
      const color = palette[i % palette.length]
      trunks.add(x, y + size * .43, z, size * .11, size * .96, size * .11, '#776a53')
      leaves.add(x, y + size * 1.09, z, size * .90, size * (1.14 + rng() * .3), size, color, rng() * Math.PI)
      if (i % 5 === 0) leaves.add(x + size * .35, y + size * .83, z + size * .17, size * .60, size * .8, size * .65, color, .26)
    } else if (y > 9 && i % 7 === 0) stones.add(x, y + .15, z, size * .62, size * .41, size * .54, '#939485', rng() * 4)
  }
  const canopies = leaves.mesh(new T.IcosahedronGeometry(.69, 1), new T.MeshStandardMaterial({ roughness: 1, flatShading: true }))
  const stems = trunks.mesh(new T.CylinderGeometry(.36, .65, 1, 5), new T.MeshStandardMaterial({ roughness: .98 }), false)
  root.add(canopies, stems, stones.mesh(new T.DodecahedronGeometry(.71), new T.MeshStandardMaterial({ roughness: .98 }), false))
  const maxLeaves = canopies.count
  const maxStems = stems.count

  const initial = surfaces.map((geometry) => {
    const positions = geometry.getAttribute('position') as T.BufferAttribute
    positions.setUsage(T.DynamicDrawUsage)
    return { positions, y: Float32Array.from({ length: positions.count }, (_, i) => positions.getY(i)) }
  })
  const texture = crackTexture()
  const marks: Stamp[] = Array.from({ length: 18 }, () => {
    const geo = new T.PlaneGeometry(2, 2, 16, 16).rotateX(-Math.PI / 2)
    const mat = new T.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, side: T.DoubleSide })
    const mesh = new T.Mesh(geo, mat)
    mesh.visible = false
    mesh.frustumCulled = false
    mesh.renderOrder = 2
    root.add(mesh)
    return { mesh, x: 0, z: 0, radius: 0, depth: 0, age: 1, progress: 0, angle: 0 }
  })
  let nextMark = 0
  let moving = false

  function deformation(x: number, z: number) {
    let value = 0
    for (const m of marks) {
      if (!m.mesh.visible || Math.abs(x - m.x) >= m.radius || Math.abs(z - m.z) >= m.radius) continue
      const r = ((x - m.x) ** 2 + (z - m.z) ** 2) / m.radius ** 2
      if (r < 1) value += m.depth * m.progress * (1 - r) ** 2
    }
    return -Math.min(1.55, value)
  }

  function updateMesh(mark: Stamp) {
    const p = mark.mesh.geometry.getAttribute('position')
    const uv = mark.mesh.geometry.getAttribute('uv')
    const cos = Math.cos(mark.angle)
    const sin = Math.sin(mark.angle)
    for (let i = 0; i < p.count; i++) {
      const u = (uv.getX(i) * 2 - 1) * mark.radius
      const v = (uv.getY(i) * 2 - 1) * mark.radius
      const x = mark.x + u * cos - v * sin
      const z = mark.z + u * sin + v * cos
      p.setXYZ(i, x, ground(x, z) + deformation(x, z) + .12, z)
    }
    p.needsUpdate = true
  }

  function updateSurface() {
    for (const { positions, y } of initial) {
      for (let i = 0; i < positions.count; i++) positions.setY(i, y[i] + deformation(positions.getX(i), positions.getZ(i)))
      positions.needsUpdate = true
    }
    for (const mark of marks) if (mark.mesh.visible) updateMesh(mark)
  }

  return {
    terrain: terrain.surface, lake, deformation,
    stamp(tool: Tool, x: number, z: number) {
      if (isWater(x, z) || Math.abs(x) > 69 || Math.abs(z) > 59) return
      const mark = marks[nextMark++ % marks.length]
      const style = markStyles[tool]
      Object.assign(mark, { x, z, radius: style.radius, depth: style.depth, age: 0, progress: 0, angle: nextMark * 1.4 })
      mark.mesh.material.opacity = 0
      mark.mesh.material.color.set(style.tint)
      mark.mesh.visible = true
      updateMesh(mark)
      moving = true
    },
    update(dt: number) {
      water.time.value += dt
      if (!moving) return false
      moving = false
      for (const mark of marks) {
        if (!mark.mesh.visible || mark.age >= .62) continue
        mark.age += dt
        mark.progress = T.MathUtils.smoothstep(mark.age, 0, .62)
        mark.mesh.material.opacity = T.MathUtils.smoothstep(mark.age, 0, .48) * .94
        moving ||= mark.age < .62
      }
      updateSurface()
      if (!moving) terrain.surface.geometry.computeVertexNormals()
      return true
    },
    setQuality(quality: Quality) {
      canopies.castShadow = quality !== 'low'
      const fraction = quality === 'low' ? .57 : quality === 'medium' ? .79 : 1
      canopies.count = Math.floor(maxLeaves * fraction)
      stems.count = Math.floor(maxStems * fraction)
    },
    reset() {
      for (const mark of marks) mark.mesh.visible = false
      nextMark = 0
      moving = false
      updateSurface()
      terrain.surface.geometry.computeVertexNormals()
    },
    get scars() { return marks.filter(({ mesh }) => mesh.visible).length },
  }
}
