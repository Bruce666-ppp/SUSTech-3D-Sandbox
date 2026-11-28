import * as T from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { type Bounds, type Point, Instances, makeTerrain, planar, randomSource, rectangle, ribbon } from './model'
import type { Quality, Tool } from './world'

export const landscapeBounds: Bounds = [-64, -46, 64, 46]

export function ground(x: number, z: number) {
  const grading = Math.max(Math.abs(x) / 55, Math.abs(z + 2) / 39)
  const berm = T.MathUtils.smoothstep(grading, .79, 1.18)
  const rock = .55 + .35 * Math.cos(x * .18 - z * .11) + .14 * Math.sin(x * .42 + z * .17)
  const apron = T.MathUtils.smoothstep(z, 13, 33)
  return .24 + .16 * Math.sin(x * .089 + z * .13) - .18 * apron + berm * rock * (z < 7 ? 5.9 : 2.3)
}

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
  canister: { radius: 4.5, depth: .58, tint: '#efb994' },
  crate: { radius: 7.4, depth: .89, tint: '#acc9b7' },
  core: { radius: 12.1, depth: 1.32, tint: '#e1a68e' },
}

type Stamp = {
  mesh: T.Mesh<T.PlaneGeometry, T.MeshBasicMaterial>, x: number, z: number,
  radius: number, depth: number, age: number, progress: number, angle: number,
}


export function createLandscape(root: T.Group) {
  const gravel = new T.Color('#a79888')
  const slope = new T.Color('#74675e')
  const tint = new T.Color()
  const terrain = makeTerrain(landscapeBounds, 104, ground, (x, z, y) => {
    const grain = Math.sin(x * .72 + z * .81) * Math.cos(z * .32 - x * .09)
    return tint.copy(gravel).lerp(slope, T.MathUtils.smoothstep(y, .5, 5.5)).multiplyScalar(.92 + grain * .08)
  }, -3.8, ['#80726b', '#655950', '#4d4542', '#353438'])
  root.add(terrain.surface, terrain.rim)

  const surfaces = [terrain.surface.geometry]
  const concrete = new T.MeshStandardMaterial({ color: '#687476', roughness: .86, side: T.DoubleSide })
  const road = new T.MeshStandardMaterial({ color: '#4f585d', roughness: .96, side: T.DoubleSide })
  const tape = new T.MeshBasicMaterial({ color: '#d5a65e', side: T.DoubleSide })
  const joints = new T.MeshBasicMaterial({ color: '#545d60', side: T.DoubleSide })
  const paint = new T.MeshBasicMaterial({ color: '#bac1b5', side: T.DoubleSide })
  const court = new T.MeshStandardMaterial({ color: '#537d78', roughness: .94, side: T.DoubleSide })
  const greens = new T.MeshStandardMaterial({ color: '#6f8466', roughness: 1, side: T.DoubleSide })
  const paintAt = (x: number, z: number) => ground(x, z) + .083
  const batches = new Map<T.Material, T.BufferGeometry[]>()

  function lay(geometry: T.BufferGeometry, material: T.Material) {
    const batch = batches.get(material)
    if (batch) batch.push(geometry)
    else batches.set(material, [geometry])
  }

  const contour: Point[] = [[-46, -29], [44, -29], [51, -22], [51, 19], [40, 27], [-43, 27], [-50, 20], [-50, -19]]
  const panels = new T.PlaneGeometry(100, 56, 50, 28).rotateX(-Math.PI / 2).translate(0, 0, -1)
  const vertices = panels.getAttribute('position')
  for (let i = 0; i < vertices.count; i++) vertices.setY(i, ground(vertices.getX(i), vertices.getZ(i)) + .038)
  lay(panels, concrete)
  lay(ribbon([[-59, 32], [-40, 32], [-15, 32], [13, 32], [39, 32], [59, 26]], 5.8, (x, z) => ground(x, z) + .058), road)
  lay(ribbon([...contour, contour[0]], .12, paintAt), paint)
  for (let x = -42; x <= 43; x += 14) lay(ribbon([[x, -29], [x, 27]], .060, paintAt), joints)
  for (let z = -22; z <= 24; z += 11) lay(ribbon([[-49, z], [49, z]], .064, paintAt), joints)
  for (let x = -49; x < 51; x += 7) lay(planar(rectangle(x, 32, 2.9, .14), paintAt), tape)

  for (const [x, z] of [[-22, 19], [3, 20], [27, 19]]) {
    const outline = rectangle(x, z, 8.8, 6.4)
    lay(ribbon([...outline, outline[0]], .11, paintAt), paint)
    lay(ribbon([[x - 1.15, z], [x + 1.15, z]], .15, paintAt), tape)
    lay(ribbon([[x, z - 1.15], [x, z + 1.15]], .15, paintAt), tape)
    for (let i = -4; i < 5; i++) lay(planar(rectangle(x + i * .55, z + 2.5, .43, .99, -.4), paintAt), tape)
  }

  const courtAt = (x: number, z: number) => ground(x, z) + .122
  const perimeter = rectangle(-42, 12.6, 11.2, 7.6)
  lay(planar(rectangle(-42, 12.6, 12.1, 8.5), (x, z) => ground(x, z) + .093), court)
  lay(ribbon([...perimeter, perimeter[0]], .14, courtAt), paint)
  lay(ribbon([[-42, 8.8], [-42, 16.4]], .12, courtAt), paint)
  const centerCircle: Point[] = Array.from({ length: 25 }, (_, i) => {
    const angle = i * Math.PI / 12
    return [-42 + Math.cos(angle) * 1.25, 12.6 + Math.sin(angle) * 1.25]
  })
  lay(ribbon(centerCircle, .11, courtAt), paint)
  for (const x of [-35, -10, 17, 36]) lay(planar(rectangle(x, 26.3, 5.3, 1.15), (a, b) => ground(a, b) + .112), greens)

  for (const [material, batch] of batches) {
    const geometry = batch.length === 1 ? batch[0] : mergeGeometries(batch)
    if (batch.length > 1) for (const item of batch) item.dispose()
    const mesh = new T.Mesh(geometry, material)
    mesh.receiveShadow = true
    root.add(mesh)
    surfaces.push(geometry)
  }

  const rng = randomSource(6882)
  const barriers = new Instances()
  const posts = new Instances()
  const equipment = new Instances()
  const boulders = new Instances()
  const shrubs = new Instances()
  for (let x = -54; x <= 54; x += 3.8) {
    const z = -33
    const y = ground(x, z)
    barriers.add(x, y + .44, z, 3.3, .79, 1.32, '#73797b')
    barriers.add(x, y + .93, z, 2.92, .20, 1.01, '#5b6569')
    if (Math.round(x) % 3 === 0) barriers.add(x, y + .57, z + .66, 1.24, .18, .038, '#ba9160')
  }
  for (const [x, z] of [[-46, -27], [43, -27], [-49, 17], [47, 21]]) {
    const y = ground(x, z)
    posts.add(x, y + 2.6, z, .24, 5.2, .24, '#465459')
    equipment.add(x, y + .16, z, .95, .32, .91, '#7a8081')
    equipment.add(x, y + 5.07, z, 1.98, .16, .36, '#4b5659')
    for (const side of [-1, 1]) equipment.add(x + side * .75, y + 4.96, z + .21, .65, .37, .48, '#d9ba83', 0, .25)
  }
  for (const [x, z] of [[-54, -14], [-54, 6], [45, 27], [48, 27], [-39, 25], [25, -26]]) {
    const y = ground(x, z)
    equipment.add(x, y + .58, z, 1.75, 1.16, 1.49, '#596b6d', .13)
    equipment.add(x, y + 1.19, z, 1.86, .13, 1.60, '#879492', .13)
    equipment.add(x, y + .54, z + .74, 1.15, .21, .035, '#cf9f63', .13)
  }
  for (const x of [-35, -10, 17, 36]) {
    for (const offset of [-1.65, 0, 1.65]) {
      const z = 26.3
      shrubs.add(x + offset, ground(x + offset, z) + .43, z, 1.23, .83, .86, '#69866c', rng() * 5)
    }
  }

  for (let i = 0; i < 330; i++) {
    const x = (rng() - .5) * 124
    const z = (rng() - .5) * 88
    if (Math.abs(x) < 53 && z < 38 && z > -34) continue
    const s = .25 + rng() ** 2 * 2.35
    const y = ground(x, z)
    boulders.add(x, y + s * .1, z, s * (1.3 + rng()), s * (.4 + rng()), s * (1 + rng()), i % 3 ? '#948276' : '#a69683', rng() * 6)
    if (i % 4 === 0) shrubs.add(x + .6, y + .23, z - .26, .81, .59, .9, '#81856d', rng() * 5)
  }
  const block = new T.BoxGeometry()
  const mat = new T.MeshStandardMaterial({ roughness: .94 })
  const crags = boulders.mesh(new T.DodecahedronGeometry(.61), mat)
  const scrub = shrubs.mesh(new T.IcosahedronGeometry(.69), mat)
  root.add(barriers.mesh(block, mat), equipment.mesh(block, mat), posts.mesh(new T.CylinderGeometry(.53, .68, 1, 7), mat), crags, scrub)
  const rockCount = crags.count
  const scrubCount = scrub.count

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
    terrain: terrain.surface, deformation,
    stamp(tool: Tool, x: number, z: number) {
      if (Math.abs(x) > 62 || Math.abs(z) > 44) return
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
      crags.castShadow = quality !== 'low'
      const fraction = quality === 'low' ? .57 : quality === 'medium' ? .79 : 1
      crags.count = Math.floor(rockCount * fraction)
      scrub.count = Math.floor(scrubCount * fraction)
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
