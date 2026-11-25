import * as T from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import {
  addLandmarkRoof, addLynnFacadeFin, buildingsWithPublishedData, campusReferences, colorize, footprintAnchor, landmarkFootprints,
} from './campus-architecture'
import osm from './data/osm-campus.json'
import elevation from './data/elevation.json'
import {
  type Bounds, type Point, type Height, Instances, boundsOf, centerOf, clipPolygon,
  disposeScene, inside, makeTerrain, makeWater, planar, randomSource, rectangle, ribbon,
} from './model'
import type { CampusWorld, Landmark, LandmarkDimensions, Localized } from './world'

interface Footprint {
  id: string
  points: Point[]
  type: string
  name: string | null
  height: number | null
  levels: number | null
}

const bounds: Bounds = [elevation.minX, elevation.minZ, elevation.maxX, elevation.maxZ]
const boundary = osm.boundary as unknown as Point[]
const buildingData = osm.buildings as unknown as Footprint[]
const places = new Map(osm.places.map(({ id, point }) => [id, point as unknown as Point]))
const [minX, minZ, maxX, maxZ] = bounds

function sampledHeight(x: number, z: number) {
  const { columns, rows, values, low } = elevation
  const i = T.MathUtils.clamp((x - minX) / (maxX - minX), 0, 1) * (columns - 1)
  const j = T.MathUtils.clamp((z - minZ) / (maxZ - minZ), 0, 1) * (rows - 1)
  const a = Math.min(columns - 2, Math.floor(i))
  const b = Math.min(rows - 2, Math.floor(j))
  const near = T.MathUtils.lerp(values[b * columns + a], values[b * columns + a + 1], i - a)
  const far = T.MathUtils.lerp(values[(b + 1) * columns + a], values[(b + 1) * columns + a + 1], i - a)
  return (T.MathUtils.lerp(near, far, j - b) - low) * .132
}

const areas = osm.areas.map(({ id, kind, points }) => {
  const polygon = clipPolygon(points as unknown as Point[], bounds)
  return { id, kind, polygon, bounds: boundsOf(polygon) }
}).filter(({ polygon }) => polygon.length > 2)

function contains(x: number, z: number, box: Bounds, ring: Point[]) {
  return x >= box[0] && x <= box[2] && z >= box[1] && z <= box[3] && inside(x, z, ring)
}

const waterAreas = areas.filter((area) => area.kind === 'water').map((area) => {
  const heights = area.polygon.map(([x, z]) => sampledHeight(x, z)).sort((a, b) => a - b)
  const level = heights[Math.floor(heights.length * .21)] + .11
  return { ...area, level, large: heights.at(-1)! - heights[0] > 1.7 }
})

const woods = areas.filter((area) => area.kind === 'wood')
const fields = areas.filter((area) => area.kind === 'field' || area.kind === 'court')
const stadiumField = osm.areas.find(({ id }) => id === '539645880')!.points as unknown as Point[]
const stadiumCenter = centerOf(stadiumField)
const stadiumEdges = stadiumField.map(([x, z], i) => [stadiumField[(i + 1) % stadiumField.length][0] - x, stadiumField[(i + 1) % stadiumField.length][1] - z] as const)
const longestEdge = stadiumEdges.reduce((a, b) => Math.hypot(...a) > Math.hypot(...b) ? a : b)
const stadiumAngle = Math.atan2(longestEdge[1], longestEdge[0])
const pitchCos = Math.cos(stadiumAngle)
const pitchSin = Math.sin(stadiumAngle)
const pitchLevel = sampledHeight(...stadiumCenter)
const trackDistance = (x: number, z: number) => {
  const dx = x - stadiumCenter[0]
  const dz = z - stadiumCenter[1]
  return Math.hypot((dx * pitchCos + dz * pitchSin) / 9.3, (dz * pitchCos - dx * pitchSin) / 5.9)
}
const isWood = (x: number, z: number) => woods.some((area) => contains(x, z, area.bounds, area.polygon))
const inWater = (x: number, z: number) => waterAreas.find((area) => contains(x, z, area.bounds, area.polygon))
const ground: Height = (x, z) => {
  const y = sampledHeight(x, z)
  const venue = trackDistance(x, z)
  if (venue < 1.26) return T.MathUtils.lerp(pitchLevel, y, T.MathUtils.smoothstep(venue, .9, 1.26))
  const water = inWater(x, z)
  return water && !water.large ? Math.min(y, water.level - .24) : y
}

const styles = {
  academic: ['#b9b4a0', '#dad5c4', '#395c63', '#dedbc6'],
  research: ['#b8c1bb', '#718785', '#375b63', '#d4d9cf'],
  dorm: ['#c7b592', '#8a7b6c', '#536963', '#dbcaab'],
  campus: ['#a5aca5', '#4b5c56', '#415650', '#c4c9bc'],
  library: ['#a8b7ae', '#789393', '#2c6973', '#d2d6c8'],
  lynn: ['#bfc6be', '#a4ada6', '#345b67', '#e0e2d5'],
  engineering: ['#bca98b', '#959689', '#38606a', '#dcd1b9'],
  yidan: ['#9d765f', '#8b9189', '#2c616b', '#b89572'],
  nexus: ['#aeab91', '#8d9d95', '#385f67', '#d4c5a8'],
  center: ['#ac8c72', '#9ca193', '#41676c', '#d5c4aa'],
  hall: ['#baae9a', '#90674f', '#4e6366', '#d9cbb6'],
  gym: ['#a1aaa8', '#738d91', '#355c65', '#dce5dd'],
} as const
type Style = keyof typeof styles

interface LandmarkInfo {
  id: string
  osmId: string
  name: Localized
  category: Localized
  description: Localized
  icon: string
  dimensions?: LandmarkDimensions
  pin?: boolean
  wide?: boolean
  point?: Point
}

const library = ['图书馆', 'Library'] as const
const sport = ['体育设施', 'Sports'] as const
const study = ['教学与科研', 'Teaching & research'] as const

function dimensions(source: string, ...buildings: [id: string, label?: Localized][]): LandmarkDimensions {
  return { source, buildings: buildings.map(([id, label]) => {
    const profile = buildingsWithPublishedData.get(id)!
    return { label, floors: profile.floors, heightMeters: profile.publishedMeters }
  }) }
}

const landmarkInfo: LandmarkInfo[] = [
  { id: 'lynn', osmId: landmarkFootprints.lynn, name: ['琳恩图书馆', 'Lynn Library'], category: library, icon: 'book', pin: true,
    dimensions: dimensions(campusReferences.lynn, [landmarkFootprints.lynn]),
    description: ['位于第一教学楼对面。弧形立面由重复的几何遮阳构件组成，屋面设有八组三角天窗。', 'Opposite Lecture Hall 1, the curved façade has repeating geometric shades, and eight triangular skylights punctuate the roof.'] },
  { id: 'engineering', osmId: landmarkFootprints.engineeringSouth, name: ['工学院', 'College of Engineering'], category: study, icon: 'building', pin: true, wide: true,
    dimensions: dimensions(campusReferences.engineering, [landmarkFootprints.engineeringSouth, ['南楼', 'South building']], [landmarkFootprints.engineeringNorth, ['北楼', 'North building']]),
    description: ['南楼呈 C 形，北楼呈 U 形。两栋楼沿山坡布置，庭院与广场连通校园步道。', 'A C-shaped south building and a U-shaped north building follow the hillside, with courtyards and plazas linked to campus paths.'] },
  { id: 'stadium', osmId: '6054395700', name: ['松禾体育场', 'Songhe Stadium'], category: sport, icon: 'track', pin: true, wide: true,
    description: ['位于校园东北部体育组团，设有环形跑道和中央运动场，东侧毗邻润杨体育馆。', 'The athletics track wraps around a central field in the campus sports precinct, close to Runyang Gymnasium.'] },
  { id: 'learning-nexus', osmId: landmarkFootprints.nexus, name: ['涵泳图书馆', 'Learning Nexus'], category: library, icon: 'book', pin: true,
    dimensions: dimensions(campusReferences.nexus, [landmarkFootprints.nexus]),
    description: ['位于工学院与宿舍组团之间，提供阅读和协作学习空间。', 'Between Engineering and the residence precinct, the Learning Nexus offers reading and collaborative study spaces.'] },
  { id: 'center', osmId: landmarkFootprints.center, name: ['南科大中心', 'SUSTech Center'], category: ['公共空间', 'Public space'], icon: 'building', pin: true, wide: true,
    description: ['二期校园的公共组团，建筑围绕庭院与公共步行空间展开。', 'A Phase II campus precinct organized around courtyards and pedestrian spaces.'] },
  { id: 'lakeside', osmId: '536044862', name: ['湖畔公园', 'Lakeside Park'], category: ['自然景观', 'Landscape'], icon: 'trees', pin: true, wide: true,
    description: ['校园中央的水岸绿地，步道串联湖岸、林坡和邻近的学生生活区。', 'Waterside paths link the green banks, hillside woods and nearby student quarters.'] },
  { id: 'lychee', osmId: '638398293', name: ['荔园', 'Lychee Hills'], category: ['学生生活', 'Student life'], icon: 'home', pin: true, wide: true,
    description: ['北侧学生生活组团，宿舍沿起伏地形布置，并通过步道与餐饮及教学区相连。', 'Residence blocks in the northern hills connect to dining and academic areas through the pedestrian network.'] },
  { id: 'yidan', osmId: landmarkFootprints.yidan, name: ['一丹图书馆', 'Yidan Library'], category: library, icon: 'book',
    dimensions: dimensions(campusReferences.yidan, [landmarkFootprints.yidan]),
    description: ['位于南科大中心组团，弧形玻璃幕墙外布置暖棕色竖向构件。', 'Part of the SUSTech Center precinct, with warm brown vertical fins along a curved glass façade.'] },
  { id: 'science', osmId: 'r18716462', name: ['理学院', 'College of Science'], category: study, icon: 'building',
    description: ['校园南侧的教学科研建筑，邻近商学院与教学楼。', 'A teaching and research complex in the southern academic precinct, near Business and lecture buildings.'] },
  { id: 'research', osmId: '1506997102', name: ['第三科研楼', 'Research Building 3'], category: study, icon: 'building',
    description: ['校园西北侧科研组团，可从南科一路沿校园道路前往。', 'A research building in the northwest precinct, accessible from the Nanke 1st Road side of campus.'] },
  { id: 'admin', osmId: '1360556608', name: ['行政楼', 'Administration Building'], category: ['行政', 'Administration'], icon: 'building',
    description: ['坐落在一期教学区南侧，邻近琳恩图书馆和校园南侧水系。', 'On the southern side of the original teaching area, near Lynn Library and the campus waterway.'] },
  { id: 'runyang', osmId: '638398880', name: ['润杨体育馆', 'Runyang Gymnasium'], category: sport, icon: 'track',
    description: ['位于松禾体育场东侧，为校园提供室内体育活动空间。', 'An indoor sports venue just east of Songhe Stadium.'] },
  { id: 'medicine', osmId: '927428587', name: ['医学院', 'School of Medicine'], category: study, icon: 'building', wide: true,
    description: ['东部片区的医学教学组团，模型以概略体量表示。', 'The eastern medical teaching precinct is represented by approximate building volumes.'] },
  { id: 'hall', osmId: '736809369', name: ['南科大会堂', 'SUSTech Hall'], category: ['文化设施', 'Culture'], icon: 'building',
    description: ['校园南部的集会和活动空间，靠近一号门与一期教学区。', 'An events venue near Gate 1 and the original academic precinct in the south.'] },
  { id: 'humanities', osmId: landmarkFootprints.humanities, name: ['人文社会科学学院', 'School of Humanities and Social Sciences'], category: study, icon: 'building', wide: true,
    description: ['校园二期东侧教学组团。灰砖、坡屋顶和挑檐围合出连续的庭院与步行空间。', 'A Phase II teaching precinct with grey brick, pitched roofs and overhanging eaves around interconnected courtyards.'] },
]

function getStyle(building: Footprint): Style {
  if (building.id === landmarkFootprints.lynn) return 'lynn'
  if (building.id === landmarkFootprints.yidan) return 'yidan'
  if (building.id === landmarkFootprints.nexus) return 'nexus'
  if (building.id === landmarkFootprints.center) return 'center'
  if (building.id === landmarkFootprints.engineeringSouth || building.id === landmarkFootprints.engineeringNorth) return 'engineering'
  if (building.id === '638398880') return 'gym'
  if (building.name?.includes('图书馆')) return 'library'
  if (building.id === '736809369') return 'hall'
  if (building.type === 'dormitory' || building.type === 'apartments' || /园\d|宿舍|公寓/.test(building.name ?? '')) return 'dorm'
  if (/人文|学术交流/.test(building.name ?? '')) return 'campus'
  return /科研|工学院|学院|实验/.test(building.name ?? '') ? 'research' : 'academic'
}

function heightOf(building: Footprint) {
  const profile = buildingsWithPublishedData.get(building.id)
  const meters = profile?.publishedMeters ?? profile?.estimatedMeters
  if (meters) return meters / 10
  if (building.id === '638398880') return 2.25
  if (building.id === landmarkFootprints.center) return 1.53
  return T.MathUtils.clamp(building.height ? building.height / 10 : (building.levels ?? 4) * .365, .72, 8.5)
}

function addSurfaceBatch(root: T.Group, geometries: T.BufferGeometry[], material: T.Material) {
  if (geometries.length === 0) return
  const mesh = new T.Mesh(mergeGeometries(geometries), material)
  geometries.forEach((geometry) => geometry.dispose())
  mesh.receiveShadow = true
  root.add(mesh)
}

function shell(ring: Point[], low: number, high: number, color: T.Color) {
  const vertices: number[] = []
  const indices: number[] = []
  let signedArea = 0
  for (let i = 0; i < ring.length; i++) {
    const [x, z] = ring[i]
    const [a, b] = ring[(i + 1) % ring.length]
    signedArea += x * b - z * a
  }
  const perimeter = signedArea > 0 ? ring : [...ring].reverse()
  for (let i = 0; i < perimeter.length; i++) {
    const [x, z] = perimeter[i]
    const [a, b] = perimeter[(i + 1) % perimeter.length]
    const k = vertices.length / 3
    vertices.push(x, low, z, a, low, b, a, high, b, x, high, z)
    indices.push(k, k + 2, k + 1, k, k + 3, k + 2)
  }
  const geometry = new T.BufferGeometry()
  geometry.setAttribute('position', new T.Float32BufferAttribute(vertices, 3))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  return { geometry: colorize(geometry, color), perimeter }
}

function approximateMedicalVolumes(): Footprint[] {
  return [[43.2, 1, 8.4, 4.8, 6], [48.8, 7.5, 7.8, 5, 6], [49, -.4, 3.9, 5.8, 4]].map(([x, z, w, d, levels], i) => ({
    id: `medical-${i}`, name: '医学院示意体量', type: 'university', height: null, levels, points: rectangle(x, z, w, d, -.12),
  }))
}

function addCampusBuildings(root: T.Group, footprints: Footprint[]) {
  const batch: T.BufferGeometry[] = []
  const glass = new Instances()
  const trim = new Instances()
  const heights = new Map<string, number>()
  const random = randomSource(74922)

  for (const building of footprints) {
    const ring = building.points
    const [x, z] = centerOf(ring)
    const height = heightOf(building)
    const floors = buildingsWithPublishedData.get(building.id)?.floors ?? Math.max(1, Math.round(height / .37))
    const style = getStyle(building)
    const [walls, roof, window, fascia] = styles[style]
    const curtainWall = style === 'yidan' || style === 'center' || style === 'nexus'
    const broadWindows = curtainWall || style === 'library' || style === 'lynn'
    const y = Math.max(...ring.map(([a, b]) => ground(a, b)), ground(x, z)) + .045
    const base = Math.min(...ring.map(([a, b]) => ground(a, b))) - .24
    const top = y + height
    heights.set(building.id, top)
    const facades = shell(ring, base, top, new T.Color(walls).multiplyScalar(.92 + random() * .19))
    batch.push(facades.geometry, colorize(planar(ring, () => top + .013), new T.Color(roof)))
    for (let i = 0; i < facades.perimeter.length; i++) {
      const [a, b] = facades.perimeter[i]
      const [c, d] = facades.perimeter[(i + 1) % facades.perimeter.length]
      const length = Math.hypot(c - a, d - b)
      if (length < .43) continue
      const dx = (c - a) / length
      const dz = (d - b) / length
      const angle = -Math.atan2(dz, dx)
      const cx = (a + c) / 2
      const cz = (b + d) / 2
      trim.add(cx, top + .055, cz, length + .08, .14, .15, fascia, angle)
      trim.add(cx, y + .085, cz, length, .14, .14, '#73786e', angle)
      const bays = Math.max(1, Math.floor(length / (broadWindows ? .43 : .67)))
      const interval = length / bays
      const floorHeight = (top - y) / floors
      for (let floor = 0; floor < floors; floor++) {
        const py = y + (floor + .53) * floorHeight
        if (style === 'gym') {
          if (floor % 3 === 0) glass.add(cx + dz * .07, py, cz - dx * .07, length * .82, floorHeight * .66, .08, window, angle)
          continue
        }
        for (let bay = 0; bay < bays; bay++) {
          const t = (bay + .53) * interval
          const tint = new T.Color(window).multiplyScalar(.73 + random() * .5)
          glass.add(a + dx * t + dz * .04, py, b + dz * t - dx * .04,
            interval * (broadWindows ? .82 : .58), floorHeight * (curtainWall ? .82 : .57), .07, tint, angle)
          if (style === 'lynn') addLynnFacadeFin(batch, [a, b], [dx, dz], t, py, interval, floorHeight, (floor + bay) % 2 ? 1 : -1)
          if (floor === 0 && (curtainWall || (style === 'engineering' && bay % 2 === 0))) {
            const seam = t - interval * .47
            trim.add(a + dx * seam + dz * .075, y + height / 2, b + dz * seam - dx * .075, .074, height, .15, fascia, angle)
          }
        }
        if (style === 'dorm' || broadWindows) trim.add(cx + dz * .09, py - floorHeight * .39, cz - dx * .09, length, .06, .15, fascia, angle)
      }
    }
    const [a, b, c, d] = boundsOf(ring)
    const customRoof = addLandmarkRoof(building.id, batch, trim, facades.perimeter, top + .013)
    if (!customRoof && inside(x, z, ring) && c - a > 1.8 && d - b > 1.8) {
      const roofWidth = Math.min(3.2, (c - a) * .26)
      const roofDepth = Math.min(2.6, (d - b) * .24)
      trim.add(x, top + .22, z, roofWidth, .36, roofDepth, fascia)
      trim.add(x, top + .415, z, roofWidth * .78, .09, roofDepth * .78, '#667b78')
    }
    if (building.id === '638398880' || style === 'hall') {
      const roofHousing = new T.Mesh(new T.SphereGeometry(1, 24, 12), new T.MeshStandardMaterial({ color: roof, roughness: .55 }))
      roofHousing.position.set(x, top - .13, z)
      roofHousing.scale.set((c - a) * .42, style === 'hall' ? .58 : 1.09, (d - b) * .43)
      roofHousing.castShadow = true
      root.add(roofHousing)
    }
  }

  const body = new T.Mesh(mergeGeometries(batch), new T.MeshStandardMaterial({ vertexColors: true, roughness: .77, side: T.DoubleSide }))
  batch.forEach((geometry) => geometry.dispose())
  body.castShadow = body.receiveShadow = true
  root.add(body)
  root.add(glass.mesh(new T.BoxGeometry(), new T.MeshStandardMaterial({ roughness: .31, metalness: .19 }), false))
  root.add(trim.mesh(new T.BoxGeometry(), new T.MeshStandardMaterial({ roughness: .76 })))
  return { body, heights }
}

function addRoutes(root: T.Group, water: T.Material) {
  const batches: Record<string, T.BufferGeometry[]> = { avenue: [], road: [], path: [], stream: [] }
  for (const route of osm.roads) {
    const points = route.points as unknown as Point[]
    const width = route.kind === 'avenue' ? 1.07 : route.kind === 'road' ? .61 : route.kind === 'path' ? .23 : .51
    batches[route.kind].push(ribbon(points, width, (x, z) => ground(x, z) + (route.bridge ? .45 : .07)))
  }
  const colors: Record<string, string> = { avenue: '#9b9f93', road: '#b4b6a1', path: '#d6c5a2' }
  for (const [kind, list] of Object.entries(batches)) {
    const material = kind === 'stream' ? water : new T.MeshStandardMaterial({ color: colors[kind], roughness: 1 })
    addSurfaceBatch(root, list, material)
  }
}

function addSport(root: T.Group) {
  const [x, z] = stadiumCenter
  const angle = stadiumAngle
  const rx = pitchCos
  const rz = pitchSin
  const fieldWidth = 10.4
  const fieldDepth = 6.5
  const at: Height = () => pitchLevel + .20
  const local = (a: number, b: number): Point => [x + a * rx - b * rz, z + a * rz + b * rx]
  const oval = (a: number, b: number) => Array.from({ length: 97 }, (_, i) => local(Math.cos(i / 96 * Math.PI * 2) * a, Math.sin(i / 96 * Math.PI * 2) * b))
  const track = new T.Mesh(planar(oval(8.14, 4.42).slice(0, -1), at), new T.MeshStandardMaterial({ color: '#aa614f', roughness: .94, side: T.DoubleSide }))
  track.receiveShadow = true
  root.add(track)
  const paint = new T.MeshBasicMaterial({ color: '#d6c6ae', side: T.DoubleSide })
  for (let lane = 0; lane < 5; lane++) {
    root.add(new T.Mesh(ribbon(oval(7.96 - lane * .195, 4.3 - lane * .195), .043, (a, b) => at(a, b) + .028), paint))
  }
  const grass = new T.MeshStandardMaterial({ color: '#7b9d54', roughness: 1, side: T.DoubleSide })
  root.add(new T.Mesh(planar(rectangle(x, z, fieldWidth, fieldDepth, angle), (a, b) => at(a, b) + .045), grass))
  const cutGrass = new T.MeshStandardMaterial({ color: '#74934f', roughness: 1, side: T.DoubleSide })
  for (let i = -2; i <= 2; i++) {
    const [a, b] = local(i * 2.04, 0)
    root.add(new T.Mesh(planar(rectangle(a, b, 1.04, fieldDepth, angle), () => pitchLevel + .258), cutGrass))
  }
  const markings: Point[][] = [
    [...rectangle(x, z, 10, 6.07, angle), local(-5, -3.035)], [local(0, -3.03), local(0, 3.03)],
    Array.from({ length: 33 }, (_, i) => local(Math.cos(i / 32 * Math.PI * 2), Math.sin(i / 32 * Math.PI * 2))),
    [local(-5, -1.66), local(-3.5, -1.66), local(-3.5, 1.66), local(-5, 1.66)],
    [local(5, -1.66), local(3.5, -1.66), local(3.5, 1.66), local(5, 1.66)],
  ]
  for (const line of markings) root.add(new T.Mesh(ribbon(line, .055, (a, b) => at(a, b) + .076), paint))
  const seats = new Instances()
  for (const side of [-1, 1]) {
    for (let row = 0; row < 4; row++) {
      const [a, b] = local(0, side * (4.53 + row * .36))
      seats.add(a, ground(a, b) + .29 + row * .22, b, 9.15, .32, .38, row % 2 ? '#d3c8b7' : '#839891', -angle)
    }
  }
  root.add(seats.mesh(new T.BoxGeometry(), new T.MeshStandardMaterial({ roughness: .83 })))
}

function addVegetation(root: T.Group, footprints: Footprint[]) {
  const random = randomSource(1012109)
  const trunks = new Instances()
  const leaves = new Instances()
  const canopyColors = ['#416951', '#577e55', '#668e60', '#346451', '#779260', '#527d68']
  const footprintsWithBounds = footprints.map(({ points }) => ({ points, bounds: boundsOf(points) }))
  const gridSize = 1.25
  const roadCells = new Set<string>()
  for (const { points, kind } of osm.roads) {
    if (kind === 'path') continue
    for (let i = 1; i < points.length; i++) {
      const [a, b] = points[i - 1]
      const [c, d] = points[i]
      const steps = Math.ceil(Math.hypot(c - a, d - b) * 1.5)
      for (let j = 0; j <= steps; j++) roadCells.add(`${Math.floor(T.MathUtils.lerp(a, c, j / (steps || 1)) / gridSize)},${Math.floor(T.MathUtils.lerp(b, d, j / (steps || 1)) / gridSize)}`)
    }
  }
  for (let i = 0; i < 7200; i++) {
    const x = T.MathUtils.lerp(minX + .7, maxX - .7, random())
    const z = T.MathUtils.lerp(minZ + .7, maxZ - .7, random())
    const y = ground(x, z)
    const patch = .45 + .22 * Math.sin(x * .17 + z * .13) + .16 * Math.cos(x * .24 - z * .21)
    const wooded = isWood(x, z)
    if (random() > (wooded ? .81 : y > 5 ? patch : patch * .43)) continue
    if (roadCells.has(`${Math.floor(x / gridSize)},${Math.floor(z / gridSize)}`) || inWater(x, z)) continue
    if (footprintsWithBounds.some((feature) => contains(x, z, feature.bounds, feature.points))) continue
    if (trackDistance(x, z) < 1.14 || fields.some((area) => contains(x, z, area.bounds, area.polygon))) continue
    const size = .36 + random() * .79
    const color = canopyColors[Math.floor(random() * canopyColors.length)]
    trunks.add(x, y + size * .49, z, .095 * size, size * 1.02, .095 * size, '#746a53')
    leaves.add(x, y + size * 1.18, z, size * (.87 + random() * .4), size * (1.03 + random() * .44), size, color, random() * Math.PI)
  }
  const trees = leaves.mesh(new T.IcosahedronGeometry(.68, 1), new T.MeshStandardMaterial({ roughness: .92, flatShading: true }))
  const stems = trunks.mesh(new T.CylinderGeometry(.45, .65, 1, 5), new T.MeshStandardMaterial({ roughness: 1 }), false)
  root.add(trees, stems)
  return { trees, stems }
}

export function createCampus(): CampusWorld {
  const root = new T.Group()
  const forest = new T.Color('#49765a')
  const grass = new T.Color('#87976b')
  const hill = new T.Color('#678766')
  const color = new T.Color()
  const { surface, rim } = makeTerrain(bounds, 156, ground, (x, z, y) => {
    const texture = .79 + .12 * Math.sin(x * .91 + z * .57) * Math.cos(z * 1.01) + .16 * Math.sin(x * .13 - z * .12)
    color.copy(isWood(x, z) ? forest : y > 7.2 ? hill : grass)
    return color.multiplyScalar(texture)
  })
  root.add(surface, rim)
  const water = makeWater()
  addSurfaceBatch(root, waterAreas.map((area) => planar(area.polygon, area.large ? (x, z) => ground(x, z) + .13 : () => area.level)), water.material)
  const parkMaterial = new T.MeshStandardMaterial({ color: '#8b9e6d', roughness: 1, side: T.DoubleSide })
  const pavedMaterial = new T.MeshStandardMaterial({ color: '#b9b3a1', side: T.DoubleSide, roughness: .91 })
  const courtMaterial = new T.MeshStandardMaterial({ color: '#6b8d72', side: T.DoubleSide, roughness: .92 })
  const park: T.BufferGeometry[] = []
  const plazas: T.BufferGeometry[] = []
  const courts: T.BufferGeometry[] = []
  for (const area of areas) {
    if (['water', 'wood'].includes(area.kind) || area.id === '539645880') continue
    const batch = area.kind === 'plaza' ? plazas : area.kind === 'court' ? courts : park
    batch.push(planar(area.polygon, (x, z) => ground(x, z) + .043))
  }
  addSurfaceBatch(root, park, parkMaterial)
  addSurfaceBatch(root, plazas, pavedMaterial)
  addSurfaceBatch(root, courts, courtMaterial)
  addRoutes(root, water.material)
  addSport(root)

  const campusOutline = new T.Line(new T.BufferGeometry().setFromPoints([...boundary, boundary[0]].map(([x, z]) => new T.Vector3(x, ground(x, z) + .24, z))),
    new T.LineDashedMaterial({ color: '#c9d7a1', opacity: .56, transparent: true, dashSize: .68, gapSize: .56 }))
  campusOutline.computeLineDistances()
  root.add(campusOutline)

  const footprints = [...buildingData, ...approximateMedicalVolumes()]
  const { body, heights } = addCampusBuildings(root, footprints)
  const { trees, stems } = addVegetation(root, footprints)
  const treeCount = trees.count
  const landmarks = landmarkInfo.map((info): Landmark => {
    const footprint = footprints.find(({ id }) => id === info.osmId)
    const [x, z] = info.point ?? (footprint ? centerOf(footprint.points) : places.get(info.osmId)!)
    const y = heights.get(info.osmId) ?? ground(x, z) + .72
    const labelPosition = footprint ? footprintAnchor(footprint.points) : [x, z]
    const scale = info.wide ? 1.45 : 1
    return { ...info, anchor: new T.Vector3(labelPosition[0], y + .85, labelPosition[1]), focus: { position: [x + 14 * scale, y + 14 * scale, z + 19 * scale], target: [x, y - .45, z] } }
  })
  const focusMarker = new T.Mesh(new T.RingGeometry(.88, 1.04, 40), new T.MeshBasicMaterial({ color: '#99f5d4', side: T.DoubleSide, transparent: true, opacity: .84, depthWrite: false }))
  focusMarker.rotation.x = -Math.PI / 2
  focusMarker.visible = false
  root.add(focusMarker)

  return {
    root, landmarks, buildings: buildingData.length, elevationRange: Math.round(elevation.high - elevation.low),
    home: { position: [127, 157, 205], target: [-5, .7, 2] },
    overview: { position: [0, 355, .15], target: [0, 0, 0] },
    minDistance: 8, maxDistance: 425,
    update(dt, target) {
      water.time.value += dt
      if (focusMarker.visible) focusMarker.scale.setScalar(1 + .16 * Math.sin(water.time.value * 3.2))
      target.y = Math.max(-5, target.y)
      return 0
    },
    setQuality(quality) {
      trees.castShadow = quality !== 'low'
      trees.count = stems.count = Math.round(treeCount * (quality === 'low' ? .56 : quality === 'medium' ? .81 : 1))
    },
    pick(ray) {
      const hit = ray.intersectObjects([body, surface], false)[0]
      if (!hit) return undefined
      let result: Landmark | undefined
      let closest = hit.object === body ? 11 : 5
      for (const landmark of landmarks) {
        const range = Math.hypot(landmark.anchor.x - hit.point.x, landmark.anchor.z - hit.point.z)
        if (range < closest) {
          closest = range
          result = landmark
        }
      }
      return result
    },
    select(id) {
      const anchor = landmarks.find((landmark) => landmark.id === id)?.anchor
      focusMarker.visible = !!anchor
      if (anchor) focusMarker.position.set(anchor.x, anchor.y - .8, anchor.z)
    },
    dispose() { disposeScene(root) },
  }
}
