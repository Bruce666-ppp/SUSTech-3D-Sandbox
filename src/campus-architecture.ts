import * as T from 'three'
import { type Instances, type Point, boundsOf, centerOf, inside, rectangle } from './model'

export const landmarkFootprints = {
  lynn: '533170974',
  engineeringSouth: '695571961',
  engineeringNorth: '695571962',
  nexus: '876065295',
  center: 'r12480428',
  yidan: '710848316',
  humanities: '703098288',
} as const

export const campusReferences = {
  engineering: 'https://aa.sustech.edu.cn/news/detail/27.html',
  lynn: 'https://www.szdesigncenter.com/01',
  nexus: 'https://lib.sustech.edu.cn/_upload/article/files/92/4e/491216e745daacdf9126b03f1390/ef2b6781-d204-4018-b72d-0fc8d6fdd50c.pdf',
  yidan: 'https://www.sustech.edu.cn/10th/news/39486.html',
} as const

interface BuildingProfile {
  floors: number
  publishedMeters?: number
  estimatedMeters?: number
}

export const buildingsWithPublishedData = new Map<string, BuildingProfile>([
  [landmarkFootprints.lynn, { floors: 3, estimatedMeters: 14.8 }],
  [landmarkFootprints.engineeringSouth, { floors: 9, publishedMeters: 42.3 }],
  [landmarkFootprints.engineeringNorth, { floors: 10, publishedMeters: 46.8 }],
  [landmarkFootprints.yidan, { floors: 4, estimatedMeters: 19.4 }],
  [landmarkFootprints.nexus, { floors: 2, estimatedMeters: 8.6 }],
])

export function colorize(geometry: T.BufferGeometry, color: T.Color) {
  const colors = new Float32Array(geometry.getAttribute('position').count * 3)
  for (let i = 0; i < colors.length; i += 3) color.toArray(colors, i)
  geometry.setAttribute('color', new T.BufferAttribute(colors, 3))
  return geometry
}

export function footprintAnchor(ring: Point[]): Point {
  const center = centerOf(ring)
  if (inside(...center, ring)) return center

  const [west, north, east, south] = boundsOf(ring)
  let best = ring[0]
  let distance = Infinity
  for (let i = 0; i < 16; i++) {
    for (let j = 0; j < 16; j++) {
      const x = T.MathUtils.lerp(west, east, (i + .5) / 16)
      const z = T.MathUtils.lerp(north, south, (j + .5) / 16)
      const range = Math.hypot(x - center[0], z - center[1])
      if (range < distance && inside(x, z, ring)) { distance = range; best = [x, z] }
    }
  }
  return best
}

type Vertex = readonly [x: number, y: number, z: number]

function face(a: Vertex, b: Vertex, c: Vertex, tint: string) {
  const shape = new T.BufferGeometry()
  shape.setAttribute('position', new T.Float32BufferAttribute([...a, ...b, ...c], 3))
  shape.setIndex([0, 1, 2])
  shape.computeVertexNormals()
  return colorize(shape, new T.Color(tint))
}

function roofPoint([x, z]: Point, angle: number, dx: number, dz: number): Point {
  return [x + dx * Math.cos(angle) - dz * Math.sin(angle), z + dx * Math.sin(angle) + dz * Math.cos(angle)]
}

function vertex([x, z]: Point, y: number): Vertex {
  return [x, y, z]
}

function addLynnSkylights(batch: T.BufferGeometry[], ring: Point[], roof: number) {
  const [west, north, east, south] = boundsOf(ring)
  const center = centerOf(ring)
  for (let i = 0; i < 8; i++) {
    const col = i % 4
    const row = Math.floor(i / 4)
    const angle = (i * 137.5 + 18) * Math.PI / 180
    let spot: Point = [T.MathUtils.lerp(west, east, .22 + col * .176 + row * .026), T.MathUtils.lerp(north, south, .34 + row * .27)]
    if (!rectangle(...spot, 1.35, 1.10, angle).every((corner) => inside(...corner, ring))) {
      spot = [T.MathUtils.lerp(spot[0], center[0], .19), T.MathUtils.lerp(spot[1], center[1], .19)]
    }
    const a = roofPoint(spot, angle, -.62, -.46)
    const b = roofPoint(spot, angle, .62, -.46)
    const c = roofPoint(spot, angle, .03, .60)
    const d = roofPoint(spot, angle, .03, -.44)
    const peak = vertex(d, roof + .31 + (i % 3) * .035)
    batch.push(face(vertex(a, roof + .03), vertex(c, roof + .04), peak, '#cbd4cb'))
    batch.push(face(vertex(c, roof + .04), vertex(b, roof + .03), peak, '#a7b9b3'))
    batch.push(face(vertex(b, roof + .03), vertex(a, roof + .03), peak, '#3d747b'))
  }
}

export function addLynnFacadeFin(batch: T.BufferGeometry[], from: Point, direction: Point, along: number, y: number, interval: number, floor: number, flip: number) {
  const [dx, dz] = direction
  const at = (side: number, vertical: number, offset: number): Vertex => [
    from[0] + dx * (along + side) + dz * offset,
    y + vertical,
    from[1] + dz * (along + side) - dx * offset,
  ]
  batch.push(face(at(interval * -.45, floor * .39, .057), at(interval * .43, floor * .39, .057),
    at(interval * .35 * flip, floor * -.30, .16), flip > 0 ? '#d2d9d0' : '#adbdb8'))
}

function addRoofPlant(trim: Instances, ring: Point[], roof: number) {
  // The courtyard plans leave narrow roof strips, so place housings along their walls.
  const slots: Point[] = []
  for (let i = 0; i < ring.length; i++) {
    const [x, z] = ring[i]
    const [a, b] = ring[(i + 1) % ring.length]
    const length = Math.hypot(a - x, b - z)
    if (length < 3.6) continue
    const dx = (a - x) / length
    const dz = (b - z) / length
    const angle = Math.atan2(dz, dx)
    const spot: Point = [(x + a) / 2 - dz * .74, (z + b) / 2 + dx * .74]
    if (slots.some(([u, v]) => Math.hypot(u - spot[0], v - spot[1]) < 2.7)) continue
    if (!rectangle(...spot, 2.3, .85, angle).every((p) => inside(...p, ring))) continue
    slots.push(spot)
    trim.add(spot[0], roof + .11, spot[1], 2.3, .20, .85, '#c4b49d', -angle)
    trim.add(spot[0], roof + .233, spot[1], 2.42, .055, .94, '#e0d1b6', -angle)
  }
}

function addGable(batch: T.BufferGeometry[], trim: Instances, spot: Point, width: number, depth: number, angle: number, roof: number) {
  const [a, b, c, d] = rectangle(...spot, width, depth, angle).map((point) => vertex(point, roof))
  const ridge = Math.min(.68, depth * .29)
  const e = vertex(roofPoint(spot, angle, -width / 2, 0), roof + ridge)
  const f = vertex(roofPoint(spot, angle, width / 2, 0), roof + ridge)
  batch.push(face(a, e, b, '#52615d'), face(b, e, f, '#52615d'), face(e, d, f, '#687673'),
    face(d, c, f, '#687673'), face(a, d, e, '#b2b4a6'), face(b, f, c, '#b2b4a6'))
  trim.add(spot[0], roof + ridge + .025, spot[1], width + .09, .06, .095, '#a6aaa0', -angle)
}

export function addLandmarkRoof(id: string, batch: T.BufferGeometry[], trim: Instances, ring: Point[], roof: number) {
  if (id === landmarkFootprints.lynn) {
    addLynnSkylights(batch, ring, roof)
    return true
  }
  if (id === landmarkFootprints.engineeringSouth || id === landmarkFootprints.engineeringNorth) {
    addRoofPlant(trim, ring, roof)
    return true
  }
  if (id === landmarkFootprints.humanities) {
    // Align each gable to a wing of the mapped courtyard footprint.
    addGable(batch, trim, [-12.13, 33.48], 3.72, 1.94, -.61, roof + .04)
    addGable(batch, trim, [-7.74, 33.26], 3.45, 2.0, .125, roof + .04)
    addGable(batch, trim, [-3.96, 32.73], 2.90, 1.67, .149, roof + .04)
    addGable(batch, trim, [-2.33, 35.85], 3.68, 2.17, .81, roof + .04)
    return true
  }
  if (id === landmarkFootprints.center) {
    trim.add(-51.4, roof + .077, 36.75, 5.65, .13, 4.69, '#bdb49f', -.19)
    trim.add(-51.24, roof + .175, 36.91, 3.97, .10, 2.91, '#8c9b77', -.19)
    trim.add(-53.74, roof + .11, 39.1, 2.03, .12, 1.96, '#b9aa90', .03)
    return true
  }
  return false
}
