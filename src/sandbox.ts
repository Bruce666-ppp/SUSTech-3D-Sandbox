import * as T from 'three'
import RAPIER from '@dimforge/rapier3d-compat'
import type { AudioEngine } from './audio'
import { Effects } from './effects'
import { type Bounds, type Point, Instances, disposeScene, inside, makeTerrain, makeWater, planar, randomSource, rectangle, ribbon } from './model'
import type { SandboxWorld, Tool } from './world'

const arena: Bounds = [-59, -53, 59, 53]
const pool: Point[] = [[23, 31], [27, 25], [36, 23], [44, 25], [47, 31], [44, 38], [35, 40], [28, 36]]
const peaks = [
  [-47, -30, 16, 130], [-34, -43, 19, 150], [-13, -45, 15, 130], [7, -43, 20, 113],
  [30, -41, 18, 134], [47, -29, 16, 108], [52, -8, 13, 88], [-53, -8, 11, 115],
  [-47, 19, 8, 116], [47, 37, 6, 142], [-47, 38, 5, 110],
]
const radius: Record<Tool, number> = { grenade: 5.7, missile: 14.5, nuke: 28 }

function ground(x: number, z: number) {
  const [west, north, east, south] = arena
  x = T.MathUtils.clamp(x, west, east)
  z = T.MathUtils.clamp(z, north, south)
  let y = .87 * Math.sin(x * .116 + z * .13) + .65 * Math.sin(z * .24 - x * .16)
  for (const [a, b, height, width] of peaks) y += height * Math.exp(-((x - a) ** 2 + (z - b) ** 2) / width)
  const ruggedness = T.MathUtils.smoothstep(y, 2.4, 15)
  y += ruggedness * (1.3 * Math.sin(x * .75 + z * .14) + 1.5 * Math.cos(z * .47 - x * .16))
  const bank = Math.hypot((x - 35) / 13.6, (z - 31) / 9.5)
  const height = T.MathUtils.lerp(-.61, y + 1.25, T.MathUtils.smoothstep(bank, .73, 1.27))
  return inside(x, z, pool) ? Math.min(-.38, height) : height
}

interface StructureSpec {
  x: number
  z: number
  width: number
  depth: number
  height: number
  color: string
  tier: 'tower' | 'lab' | 'depot'
}

const structures: StructureSpec[] = [
  { x: 0, z: -5, width: 7.6, depth: 8.4, height: 15.1, color: '#be957b', tier: 'tower' },
  { x: 12, z: -10, width: 8.1, depth: 7.3, height: 9.1, color: '#9eaba3', tier: 'lab' },
  { x: -15, z: -8, width: 8.8, depth: 8.8, height: 8.8, color: '#a9b2a7', tier: 'lab' },
  { x: -13, z: 7, width: 8.2, depth: 6.5, height: 5.9, color: '#c2a58d', tier: 'depot' },
  { x: 1, z: 13, width: 7.9, depth: 6.8, height: 7.5, color: '#af8773', tier: 'lab' },
  { x: 13, z: 5, width: 6.4, depth: 8.7, height: 6.1, color: '#b9b7a2', tier: 'depot' },
  { x: -26, z: 11, width: 7, depth: 7.6, height: 6.5, color: '#b19079', tier: 'lab' },
  { x: 26, z: -11, width: 8.7, depth: 5.8, height: 7.6, color: '#aa9988', tier: 'lab' },
  { x: -24, z: -20, width: 6.7, depth: 6, height: 8, color: '#959f92', tier: 'tower' },
  { x: 24, z: 14, width: 7, depth: 6.7, height: 5.7, color: '#aba391', tier: 'depot' },
  { x: 4, z: -22, width: 7.7, depth: 6.9, height: 7.1, color: '#aba58c', tier: 'lab' },
  { x: -12, z: -24, width: 7, depth: 6.9, height: 6.3, color: '#998a7a', tier: 'depot' },
]

interface Structure {
  spec: StructureSpec
  base: number
  mesh: T.Group
  target: T.Mesh
  body?: RAPIER.RigidBody
  broken: boolean
}

interface Debris {
  body: RAPIER.RigidBody
  scale: T.Vector3
}

let ready: Promise<void> | undefined

function addLandscape(root: T.Group) {
  const dust = new T.Color('#a18b71')
  const rock = new T.Color('#826f66')
  const green = new T.Color('#7c8563')
  const tint = new T.Color()
  const terrain = makeTerrain(arena, 102, ground, (x, z, y) => {
    const blend = .5 + .5 * Math.sin(.15 * x + .16 * z) * Math.cos(.21 * z)
    tint.copy(y > 8 ? rock : dust).lerp(green, blend * (y > 8 ? .34 : .65))
    return tint.multiplyScalar(.88 + .14 * Math.sin(x * .19 - z * .33) + .075 * Math.cos(x * 1.04 + z * .94))
  }, -4)
  root.add(terrain.surface, terrain.rim)

  const groundMaterial = new T.MeshStandardMaterial({ color: '#a9a28d', roughness: .97, side: T.DoubleSide })
  const concrete = new T.MeshStandardMaterial({ color: '#c2b69e', roughness: .82 })
  const paths: Point[][] = [
    [[-58, 23], [-37, 19], [-22, 19], [-8, 21], [7, 22], [27, 20], [41, 13], [59, 13]],
    [[-33, 19], [-34, 8], [-31, -9], [-30, -27], [-15, -31], [9, -30], [29, -26], [36, -15], [37, 6], [30, 20]],
    [[-31, -9], [-18, -1], [-7, 3], [5, 4], [20, 3], [37, 6]],
    [[-8, 21], [-7, 3], [-6, -20], [-5, -29]],
  ]
  const lane = new T.MeshBasicMaterial({ color: '#decfa5', side: T.DoubleSide, transparent: true, opacity: .5 })
  for (const path of paths) {
    const road = new T.Mesh(ribbon(path, 2.15, (x, z) => ground(x, z) + .075), groundMaterial)
    road.receiveShadow = true
    root.add(road, new T.Mesh(ribbon(path, .065, (x, z) => ground(x, z) + .093), lane))
  }
  const water = makeWater()
  water.material.color.set('#3b7b77')
  const basin = new T.Mesh(planar(pool, () => .055), water.material)
  const embankment = new T.Mesh(ribbon([...pool, pool[0]], .47, () => .18), concrete)
  basin.receiveShadow = embankment.receiveShadow = true
  root.add(basin, embankment)

  const rng = randomSource(177144)
  const stones = new Instances()
  const grasses = new Instances()
  const pine = new Instances()
  for (let i = 0; i < 1700; i++) {
    const x = -56 + rng() * 112
    const z = -50 + rng() * 100
    const y = ground(x, z)
    if (Math.abs(x) < 39 && z > -32 && z < 23 || x > 22 && z > 22 && x < 49 && z < 42) continue
    const size = .27 + rng() * 1.57
    const color = ['#897467', '#9c8c79', '#ad9c82', '#756b62'][i % 4]
    if (y > 5.4 && i % 3 !== 0) stones.add(x, y + size * .21, z, size, size * (.35 + rng() * .75), size * (.7 + rng() * .6), color, rng() * 6, rng() * .3)
    else if (i % 9 === 0) pine.add(x, y + size * .98, z, size * .64, size * 2, size * .65, '#68745d', rng() * 6)
    else grasses.add(x, y + size * .1, z, size * .54, size * .2, size * .64, i % 2 ? '#8a8866' : '#a69a75', rng() * 6)
  }
  const stoneMesh = stones.mesh(new T.DodecahedronGeometry(.7), new T.MeshStandardMaterial({ roughness: 1, flatShading: true }))
  root.add(stoneMesh, pine.mesh(new T.ConeGeometry(.68, 1, 6), new T.MeshStandardMaterial({ roughness: .91 })),
    grasses.mesh(new T.IcosahedronGeometry(.69, 0), new T.MeshStandardMaterial({ roughness: .91 }), false))

  const bollards = new Instances()
  const paint = new Instances()
  for (let i = 0; i < 34; i++) {
    const x = -29 + i * 1.8
    const z = 23.1
    if (i % 4 === 0) bollards.add(x, ground(x, z) + .38, z, .14, .74, .14, '#5d6356')
    paint.add(x, ground(x, z - 1.4) + .11, z - 1.4, .6, .04, .11, '#ded2aa')
  }
  root.add(bollards.mesh(new T.BoxGeometry(), new T.MeshStandardMaterial({ roughness: .83 })),
    paint.mesh(new T.BoxGeometry(), new T.MeshStandardMaterial({ roughness: .77 }), false))
  return { terrain, water, stoneMesh }
}

function modelStructure(spec: StructureSpec, root: T.Group, foundations: Instances, box: T.BoxGeometry): Structure {
  const { x, z, width: w, depth: d, height: h, color, tier } = spec
  const base = Math.max(...rectangle(x, z, w + 1.1, d + 1.1).map(([a, b]) => ground(a, b)), ground(x, z)) + .11
  const slabBottom = Math.min(...rectangle(x, z, w + 1.2, d + 1.2).map(([a, b]) => ground(a, b))) - .12
  const mesh = new T.Group()
  mesh.position.set(x, base, z)
  const layers = new Instances()
  const details = new Instances()
  const panes = new Instances()
  foundations.add(x, (base + slabBottom) / 2, z, w + 1.7, base - slabBottom, d + 1.8, '#807766')
  foundations.add(x, base - .025, z, w + 1.8, .15, d + 1.9, '#b9ad97')
  layers.add(0, h / 2, 0, w - .13, h, d - .13, color)
  const floors = Math.max(3, Math.round(h / 1.39))
  const floor = h / floors
  for (let j = 0; j < floors; j++) {
    const y = (j + .51) * floor
    for (const face of [-1, 1]) {
      for (let i = 0; i < 5; i++) {
        const bay = (i - 2) * w / 5
        panes.add(bay, y, face * d / 2, w * .124, floor * .59, .10, i % 3 === 0 ? '#527a7a' : '#415f61')
        if (tier === 'tower') details.add(bay + w * .092, y, face * (d / 2 + .13), .1, floor, .35, '#d5c2a8')
      }
      for (let i = 0; i < 4; i++) panes.add(face * w / 2, y, (i - 1.5) * d / 4, .1, floor * .57, d * .16, '#527276')
    }
    details.add(0, j * floor + .10, 0, w + .23, .15, d + .24, j % 4 === 0 ? '#c9bba4' : color)
  }
  details.add(0, h + .09, 0, w + .46, .28, d + .46, '#d3c9b7')
  details.add(-w * .11, h + .58, d * .12, w * .52, .77, d * .41, tier === 'tower' ? '#677674' : '#828679')
  details.add(-w * .11, h + 1.04, d * .12, w * .55, .13, d * .45, '#bec0ab')
  if (tier === 'tower') {
    for (const side of [-1, 1]) {
      details.add(side * w * .43, h * .55, d * .5 + .10, .28, h * .91, .47, '#e0c6ad')
      details.add(side * (w * .5 + .11), h * .55, -d * .34, .47, h * .91, .28, '#c8a689')
    }
    details.add(w * .13, h + 1.65, -d * .23, .11, 3.3, .11, '#caa17e')
    details.add(w * .13, h + 2.52, -d * .23, 1.1, .11, .12, '#dac19e')
    details.add(w * .13, h + 2.98, -d * .23, .14, .14, .14, '#e47d58')
  }
  if (tier === 'depot') {
    details.add(0, h + .26, d * .10, w + .38, .29, d * .57, '#7b8380')
    for (let i = 0; i < 6; i++) details.add((i - 2.5) * w / 6, h + .45, d * .10, .052, .07, d * .57, '#a2aba4')
    details.add(0, 2.18, d * .5 + .28, w * .75, .14, .76, '#c8a683')
    details.add(0, 1.0, d * .5 + .08, w * .58, 1.85, .24, '#777a6d')
    for (let i = 0; i < 6; i++) details.add(0, .31 + .29 * i, d * .5 + .23, w * .57, .038, .045, '#a59f89')
  }
  const target = layers.mesh(box, new T.MeshStandardMaterial({ roughness: .86 }))
  mesh.add(target,
    details.mesh(box, new T.MeshStandardMaterial({ roughness: .81 })),
    panes.mesh(box, new T.MeshStandardMaterial({ roughness: .4, metalness: .26 }), false))
  root.add(mesh)
  return { spec, base, mesh, target, broken: false }
}

export async function createSandbox(audio: AudioEngine): Promise<SandboxWorld> {
  ready ??= RAPIER.init().catch((error: unknown) => { ready = undefined; throw error })
  await ready
  const root = new T.Group()
  const { terrain, water, stoneMesh } = addLandscape(root)
  const effects = new Effects(ground)
  root.add(effects.root)
  const box = new T.BoxGeometry()
  const foundations = new Instances()
  const models = structures.map((spec) => modelStructure(spec, root, foundations, box))
  root.add(foundations.mesh(box, new T.MeshStandardMaterial({ roughness: .91 })))
  const rubble = new T.InstancedMesh(box, new T.MeshStandardMaterial({ roughness: .81 }), 340)
  rubble.frustumCulled = false
  rubble.castShadow = rubble.receiveShadow = true
  rubble.instanceMatrix.setUsage(T.DynamicDrawUsage)
  rubble.count = 0
  root.add(rubble)

  const aimGuide = new T.Group()
  const aimMaterial = new T.MeshBasicMaterial({ color: '#ffcf97', transparent: true, opacity: .90, side: T.DoubleSide, depthWrite: false })
  const guideRing = new T.Mesh(new T.RingGeometry(.92, 1, 50), aimMaterial)
  const guideDot = new T.Mesh(new T.CircleGeometry(.12, 14), aimMaterial)
  guideRing.rotation.x = guideDot.rotation.x = -Math.PI / 2
  aimGuide.add(guideRing, guideDot)
  aimGuide.visible = false
  root.add(aimGuide)

  let world: RAPIER.World
  const events = new RAPIER.EventQueue(true)
  const rng = randomSource(241543)
  const debris: Debris[] = []
  const pending: { model: Structure, point: T.Vector3, tool: Tool, time: number }[] = []
  let incoming: { tool: Tool, at: T.Vector3, time: number } | undefined
  const matrix = new T.Matrix4()
  const vector = new T.Vector3()
  const quaternion = new T.Quaternion()
  let elapsed = 0
  let collisions = 0
  let nextSound = 0
  let accumulator = 0
  let interacting = false
  let quality = 1
  let occupied = true
  const groundPositions = new Float32Array(terrain.surface.geometry.getAttribute('position').array)
  const groundIndices = new Uint32Array(terrain.surface.geometry.index!.array)

  const createWorld = () => {
    world = new RAPIER.World({ x: 0, y: -22, z: 0 })
    world.timestep = 1 / 60
    world.createCollider(RAPIER.ColliderDesc.trimesh(groundPositions, groundIndices).setFriction(.96))
    world.createCollider(RAPIER.ColliderDesc.cuboid(60, .4, 55).setTranslation(0, -4.15, 0).setFriction(.92))
    for (const model of models) {
      const { x, z, width, depth, height } = model.spec
      model.mesh.visible = true
      model.broken = false
      model.body = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(x, model.base + height / 2, z))
      world.createCollider(RAPIER.ColliderDesc.cuboid(width / 2, height / 2, depth / 2).setFriction(.8), model.body)
    }
  }
  createWorld()

  const fracture = (model: Structure, origin: T.Vector3, tool: Tool) => {
    if (model.broken || !model.body) return
    model.broken = true
    model.mesh.visible = false
    world.removeRigidBody(model.body)
    model.body = undefined
    const { x, z, width, depth, height, color, tier } = model.spec
    const rows = quality === 0 ? (tier === 'tower' ? 4 : 3) : tier === 'tower' ? 6 : 4
    const sx = width / 2
    const sz = depth / 2
    const sy = height / rows
    const energy = tool === 'grenade' ? 3.3 : tool === 'missile' ? 6.5 : 9.8
    const distance = Math.hypot(x - origin.x, z - origin.z)
    const push = energy * (1 - .51 * Math.min(distance / radius[tool], 1))
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < 4; col++) {
        const a = x + (col % 2 ? .5 : -.5) * sx
        const b = z + (col < 2 ? .5 : -.5) * sz
        const y = model.base + (row + .5) * sy
        const index = debris.length
        if (index >= rubble.instanceMatrix.count) continue
        const outwardX = (a - origin.x) / Math.max(1.5, Math.hypot(a - origin.x, b - origin.z))
        const outwardZ = (b - origin.z) / Math.max(1.5, Math.hypot(a - origin.x, b - origin.z))
        const angular = .35 + rng() * 1.2
        const desc = RAPIER.RigidBodyDesc.dynamic()
          .setTranslation(a, y, b)
          .setLinvel(outwardX * push + (rng() - .5) * push * .75, push * (.05 + rng() * .57) + row * .18, outwardZ * push + (rng() - .5) * push * .75)
          .setAngvel({ x: (rng() - .5) * angular * 2, y: (rng() - .5) * angular, z: (rng() - .5) * angular * 2 })
          .setLinearDamping(.20).setAngularDamping(.29).setCanSleep(true)
        const body = world.createRigidBody(desc)
        world.createCollider(RAPIER.ColliderDesc.cuboid(sx * .483, sy * .476, sz * .483)
          .setDensity(.61).setFriction(.81).setRestitution(.11).setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS), body)
        debris.push({ body, scale: new T.Vector3(sx * .973, sy * .973, sz * .973) })
        rubble.setColorAt(index, new T.Color(row === rows - 1 ? '#c6baaa' : color).multiplyScalar(.69 + rng() * .36))
      }
    }
    if (rubble.instanceColor) rubble.instanceColor.needsUpdate = true
    interacting = true
  }

  const detonate = (tool: Tool, at: T.Vector3) => {
    effects.erupt(tool, at)
    audio.play(tool)
    for (const model of models) {
      if (model.broken || pending.some((item) => item.model === model)) continue
      const { x, z, width, depth } = model.spec
      const distance = Math.hypot(Math.max(0, Math.abs(x - at.x) - width * .50), Math.max(0, Math.abs(z - at.z) - depth * .50))
      if (distance <= radius[tool]) pending.push({ model, point: at, tool, time: elapsed + .04 + distance * .015 })
    }
  }

  const updateBodies = () => {
    for (let i = 0; i < debris.length; i++) {
      const { body, scale } = debris[i]
      const pos = body.translation()
      const rot = body.rotation()
      vector.set(pos.x, pos.y, pos.z)
      quaternion.set(rot.x, rot.y, rot.z, rot.w)
      matrix.compose(vector, quaternion, scale)
      rubble.setMatrixAt(i, matrix)
    }
    rubble.count = debris.length
    rubble.instanceMatrix.needsUpdate = true
  }

  return {
    root,
    home: { position: [61, 65, 92], target: [1, 2.1, 0] },
    overview: { position: [0, 151, .15], target: [0, 0, 0] },
    minDistance: 12, maxDistance: 210,
    targetPoint: new T.Vector3(structures[0].x, models[0].base + structures[0].height * .57, structures[0].z),
    aim(ray, tool = 'grenade') {
      const targets = models.filter((model) => !model.broken).map((model) => model.target)
      const result = ray?.intersectObjects([...targets, terrain.surface], false)[0]
      aimGuide.visible = !!result
      if (!result) return undefined
      const point = result.point
      aimGuide.position.set(point.x, point.y + .14, point.z)
      guideRing.scale.setScalar(tool === 'grenade' ? .95 : tool === 'missile' ? 1.36 : 1.89)
      return point
    },
    activate(tool, at) {
      if (tool === 'missile') {
        audio.play('launch')
        effects.launch(at)
        incoming = { tool, at, time: elapsed + .52 }
      } else detonate(tool, at)
    },
    update(dt) {
      elapsed += dt
      water.time.value += dt
      if (incoming && incoming.time <= elapsed) {
        detonate(incoming.tool, incoming.at)
        incoming = undefined
      }
      for (let i = pending.length - 1; i >= 0; i--) {
        const hit = pending[i]
        if (hit.time > elapsed) continue
        pending.splice(i, 1)
        fracture(hit.model, hit.point, hit.tool)
      }
      if (interacting) {
        accumulator = Math.min(accumulator + dt, 4 / 60)
        let bumped = 0
        while (accumulator >= 1 / 60) {
          world.step(events)
          accumulator -= 1 / 60
          events.drainCollisionEvents((_a, _b, began) => { if (began) bumped++ })
        }
        collisions += bumped
        if (bumped && elapsed > nextSound) {
          audio.play('impact', Math.min(1, bumped / 12))
          nextSound = elapsed + .10
        }
        updateBodies()
        interacting = debris.some(({ body }) => !body.isSleeping())
      }
      return effects.update(dt, 570 * Math.min(window.devicePixelRatio || 1, quality === 2 ? 1.55 : quality === 1 ? 1.2 : 1))
    },
    setQuality(value) {
      effects.setQuality(value)
      quality = value === 'low' ? 0 : value === 'medium' ? 1 : 2
      stoneMesh.castShadow = quality > 0
    },
    rebuild() {
      effects.clear()
      incoming = undefined
      pending.length = 0
      debris.length = 0
      rubble.count = 0
      accumulator = 0
      elapsed = nextSound = collisions = 0
      aimGuide.visible = interacting = false
      events.clear()
      world.free()
      createWorld()
    },
    stats() {
      return { intact: models.filter((model) => !model.broken).length, total: models.length, fragments: debris.length, collisions, effects: effects.count }
    },
    moving: () => interacting,
    dispose() {
      if (!occupied) return
      occupied = false
      world.free()
      events.free()
      disposeScene(root)
    },
  }
}
