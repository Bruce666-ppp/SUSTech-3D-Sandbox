import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { XMLParser } from 'fast-xml-parser'
import { fromFile } from 'geotiff'

const [osmFile, ...demFiles] = process.argv.slice(2)
if (!osmFile || demFiles.length === 0) {
  throw new Error('Usage: npm run data:campus -- campus.osm E113.tif E114.tif')
}

// Local display coordinates use ten meters per unit, with north at negative z.
const bounds = [113.9882, 22.5934, 114.0072, 22.61345]
const [west, south, east, north] = bounds
const center = [(west + east) / 2, (south + north) / 2]
const meterLon = 111320 * Math.cos(center[1] * Math.PI / 180)
const meterLat = 110740
const round = (value, decimals = 2) => Number(value.toFixed(decimals))
const local = (lon, lat) => [round((lon - center[0]) * meterLon / 10), round((center[1] - lat) * meterLat / 10)]
const [minX, minZ] = local(west, north)
const [maxX, maxZ] = local(east, south)
const contains = ([x, z]) => x >= minX && x <= maxX && z >= minZ && z <= maxZ

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '',
  isArray: (name) => ['node', 'way', 'relation', 'nd', 'tag', 'member'].includes(name),
})
const { osm } = parser.parse(await readFile(resolve(osmFile), 'utf8'))
const nodeCoords = new Map(osm.node.map((node) => [node.id, local(+node.lon, +node.lat)]))
const rawWays = new Map(osm.way.map((way) => [way.id, way.nd.map(({ ref }) => ref)]))
const tagsOf = (feature) => Object.fromEntries((feature.tag ?? []).map(({ k, v }) => [k, v]))

function coordinates(references, closed = false) {
  const points = references.map((id) => nodeCoords.get(id)).filter(Boolean)
  if (closed && references.at(0) === references.at(-1)) points.pop()
  return points.filter((p, i) => !i || p[0] !== points[i - 1][0] || p[1] !== points[i - 1][1])
}

const boundary = coordinates(rawWays.get('456349157'), true)

function inPolygon([x, z], ring) {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, zi] = ring[i]
    const [xj, zj] = ring[j]
    if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) inside = !inside
  }
  return inside
}

function polygonArea(ring) {
  return Math.abs(ring.reduce((sum, [x, z], i) => {
    const [nextX, nextZ] = ring[(i + 1) % ring.length]
    return sum + x * nextZ - nextX * z
  }, 0) / 2)
}

function clipSegment(a, b) {
  const [dx, dz] = [b[0] - a[0], b[1] - a[1]]
  let start = 0
  let end = 1
  for (const [p, q] of [[-dx, a[0] - minX], [dx, maxX - a[0]], [-dz, a[1] - minZ], [dz, maxZ - a[1]]]) {
    if (p === 0 && q < 0) return null
    if (p < 0) start = Math.max(start, q / p)
    if (p > 0) end = Math.min(end, q / p)
  }
  if (start >= end) return null
  return [start, end].map((t) => [round(a[0] + dx * t), round(a[1] + dz * t)])
}

function clipLine(points) {
  const paths = []
  let current
  for (let i = 1; i < points.length; i++) {
    const segment = clipSegment(points[i - 1], points[i])
    if (!segment) {
      current = undefined
      continue
    }
    const [start, end] = segment
    if (current?.at(-1)[0] === start[0] && current.at(-1)[1] === start[1]) current.push(end)
    else paths.push(current = [start, end])
  }
  return paths
}

function areaKind(tags) {
  if (tags.natural === 'water' || tags.waterway === 'riverbank' || tags.landuse === 'reservoir') return 'water'
  if (tags.natural === 'wood' || tags.landuse === 'forest' || tags.landuse === 'orchard') return 'wood'
  if (['track', 'pitch', 'stadium'].includes(tags.leisure)) return tags.sport === 'soccer' || tags.leisure === 'stadium' ? 'field' : 'court'
  if (['park', 'garden'].includes(tags.leisure) || ['grass', 'meadow'].includes(tags.landuse)) return 'lawn'
  if (tags.place === 'square' || tags.highway === 'pedestrian' || tags.amenity === 'parking') return 'plaza'
}

const map = { boundary, buildings: [], roads: [], areas: [], places: [] }
const areaRelationMembers = new Set()
// Some mapped university buildings sit just outside the amenity way.
const campusExtensions = new Set(['536044884', '536044910', '536044912', '695571961', '695571962', '1506997102'])
const labeledPlaces = new Set([...campusExtensions, '710848316', '927428587', '881493873', '881493874'])

function building(id, points, tags) {
  if (points.length < 3 || polygonArea(points) < .08 || !points.every(contains)) return
  if (!campusExtensions.has(id) && !points.some((point) => inPolygon(point, boundary))) return
  const height = parseFloat(tags.height) || null
  const levels = parseFloat(tags['building:levels']) || null
  map.buildings.push({ id, points, type: tags.building, name: tags.name ?? null, height, levels })
}

for (const relation of osm.relation) {
  const tags = tagsOf(relation)
  const kind = areaKind(tags)
  if (tags.type !== 'multipolygon' || (!kind && !tags.building)) continue
  const chains = relation.member
    .filter((member) => member.type === 'way' && member.role !== 'inner' && rawWays.has(member.ref))
    .map((member) => [...rawWays.get(member.ref)])
  while (chains.length) {
    const ring = chains.pop()
    while (ring[0] !== ring.at(-1)) {
      const nextIndex = chains.findIndex((chain) => chain[0] === ring.at(-1) || chain.at(-1) === ring.at(-1))
      if (nextIndex < 0) break
      const [next] = chains.splice(nextIndex, 1)
      if (next[0] !== ring.at(-1)) next.reverse()
      ring.push(...next.slice(1))
    }
    if (ring[0] !== ring.at(-1)) continue
    const points = coordinates(ring, true)
    if (tags.building) building(`r${relation.id}`, points, tags)
    else if (points.length >= 3 && points.some(contains)) map.areas.push({ id: `r${relation.id}`, kind, points })
  }
  for (const { ref, type } of relation.member) if (type === 'way') areaRelationMembers.add(ref)
}

const vehicleRoads = new Set(['primary', 'secondary', 'tertiary', 'unclassified', 'residential', 'service', 'living_street'])
const walkingRoads = new Set(['footway', 'path', 'cycleway', 'steps', 'pedestrian', 'track'])
for (const way of osm.way) {
  const tags = tagsOf(way)
  const references = rawWays.get(way.id)
  const closed = references[0] === references.at(-1)
  const points = coordinates(references, closed)
  if (!points.length) continue
  const center = points.reduce(([sx, sz], [x, z]) => [sx + x / points.length, sz + z / points.length], [0, 0]).map((n) => round(n))
  if (closed && (!areaRelationMembers.has(way.id) || campusExtensions.has(way.id))) {
    if ((tags.building && tags.building !== 'no') || way.id === '710848316') {
      building(way.id, points, { ...tags, building: tags.building ?? 'university' })
    }
    const kind = areaKind(tags)
    if (kind && points.length >= 3 && points.some(contains) && polygonArea(points) > .5) {
      map.areas.push({ id: way.id, kind, points })
    }
  }
  let kind
  if (tags.waterway === 'river' || tags.waterway === 'stream') kind = 'stream'
  if (vehicleRoads.has(tags.highway)) kind = ['primary', 'secondary', 'tertiary'].includes(tags.highway) ? 'avenue' : 'road'
  if (walkingRoads.has(tags.highway) && tags.area !== 'yes') kind = 'path'
  if (kind && tags.tunnel !== 'yes' && tags.tunnel !== 'culvert') {
    for (const path of clipLine(closed ? [...points, points[0]] : points)) {
      map.roads.push({ kind, points: path, bridge: tags.bridge === 'yes' })
    }
  }
  if (tags.name && (inPolygon(center, boundary) || labeledPlaces.has(way.id))) map.places.push({ id: way.id, point: center, name: tags.name })
}

for (const node of osm.node) {
  const tags = tagsOf(node)
  const point = nodeCoords.get(node.id)
  if (tags.name && inPolygon(point, boundary)) map.places.push({ id: node.id, point, name: tags.name })
}

const tiles = []
for (const filename of demFiles) {
  const tiff = await fromFile(resolve(filename))
  const image = await tiff.getImage()
  const [left, bottom, right, top] = image.getBoundingBox()
  const [pixelX, pixelY] = [(right - left) / image.getWidth(), (top - bottom) / image.getHeight()]
  const x0 = Math.max(0, Math.floor((west - left) / pixelX) - 2)
  const y0 = Math.max(0, Math.floor((top - north) / pixelY) - 2)
  const x1 = Math.min(image.getWidth(), Math.ceil((east - left) / pixelX) + 2)
  const y1 = Math.min(image.getHeight(), Math.ceil((top - south) / pixelY) + 2)
  const height = y1 - y0
  const width = x1 - x0
  const pixels = await image.readRasters({ window: [x0, y0, x1, y1], interleave: true })
  tiles.push({ left, bottom, right, top, pixelX, pixelY, x0, y0, width, height, pixels })
  await tiff.close()
}

function sample(lon, lat) {
  const tile = tiles.find(({ left, right, bottom, top }) => lon >= left && lon <= right && lat >= bottom && lat <= top)
  if (!tile) throw new Error(`DEM coverage gap at ${lon}, ${lat}`)
  const { left, top, pixelX, pixelY, x0, y0, width, height, pixels } = tile
  const x = Math.max(0, Math.min(width - 1, (lon - left) / pixelX - x0 - .5))
  const y = Math.max(0, Math.min(height - 1, (top - lat) / pixelY - y0 - .5))
  const ix = Math.floor(x)
  const iy = Math.floor(y)
  const jx = Math.min(ix + 1, width - 1)
  const jy = Math.min(iy + 1, height - 1)
  const a = pixels[iy * width + ix] * (1 - x + ix) + pixels[iy * width + jx] * (x - ix)
  const b = pixels[jy * width + ix] * (1 - x + ix) + pixels[jy * width + jx] * (x - ix)
  return a * (1 - y + iy) + b * (y - iy)
}

const columns = 76
const rows = 84
const values = []
for (let row = 0; row < rows; row++) {
  for (let col = 0; col < columns; col++) {
    const lon = west + (east - west) * col / (columns - 1)
    const lat = north - (north - south) * row / (rows - 1)
    values.push(round(sample(lon, lat), 1))
  }
}
if (values.some((value) => !Number.isFinite(value) || value < -120 || value > 600)) throw new Error('Invalid elevation sample')
const elevation = { bounds, minX, maxX, minZ, maxZ, columns, rows, values, low: Math.min(...values), high: Math.max(...values) }
await mkdir(new URL('../src/data/', import.meta.url), { recursive: true })
await writeFile(new URL('../src/data/osm-campus.json', import.meta.url), JSON.stringify(map) + '\n')
await writeFile(new URL('../src/data/elevation.json', import.meta.url), JSON.stringify(elevation) + '\n')
console.log(`${map.buildings.length} footprints, ${map.roads.length} paths, ${map.areas.length} land features, ${map.places.length} named places`)
console.log(`${columns} x ${rows} elevation samples, ${elevation.low}–${elevation.high} m`)
