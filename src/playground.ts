import * as T from 'three'
import RAPIER from '@dimforge/rapier3d-compat'
import type { AudioEngine } from './audio'
import { Descent } from './descent'
import { Effects } from './effects'
import { createLandscape, ground, landscapeBounds } from './landscape'
import { disposeScene, randomSource } from './model'
import { Parachutes } from './parachutes'
import { createStructures, type Module, type Structure } from './structures'
import { tools, type DropTarget, type Playground, type Tool } from './world'

const timing = {
  canister: { reach: 7.4, collapseAt: 0, separation: .12, drift: 7.3, lift: 1.8, loft: 2.7, floorLift: .26, lean: 2.15 },
  crate: { reach: 19.3, collapseAt: 16.6, separation: .16, drift: 10.6, lift: 4.8, loft: 4.2, floorLift: .12, lean: 2.53 },
  core: { reach: 35.7, collapseAt: 35.7, separation: .20, drift: 16.1, lift: 3.1, loft: 4.5, floorLift: 1.63, lean: 3.36 },
}

type Release = { structure: Structure, module: Module, tool: Tool, impact: T.Vector3, time: number }

let initialized: Promise<void> | undefined

export async function createPlayground(audio: AudioEngine): Promise<Playground> {
  initialized ??= RAPIER.init().catch((error: unknown) => { initialized = undefined; throw error })
  await initialized

  const root = new T.Group()
  const land = createLandscape(root)
  const buildings = createStructures(root)
  const surfaceHeight = (x: number, z: number) => ground(x, z) + land.deformation(x, z)
  const effects = new Effects(surfaceHeight)
  const parachutes = new Parachutes(surfaceHeight, clearLanding, buildings.structures.length)
  const descent = new Descent()
  root.add(effects.root, descent.root, parachutes.root)
  const marker = new T.Group()
  const reticleMaterial = new T.MeshBasicMaterial({ color: tools.canister.color, transparent: true, side: T.DoubleSide, depthWrite: false, toneMapped: false })
  const outer = new T.Mesh(new T.RingGeometry(.91, 1, 52), reticleMaterial)
  const inner = new T.Mesh(new T.RingGeometry(.19, .26, 20), reticleMaterial)
  outer.rotation.x = inner.rotation.x = -Math.PI / 2
  marker.add(outer, inner)
  marker.visible = false
  root.add(marker)

  const landVertices = new Float32Array(land.terrain.geometry.getAttribute('position').array)
  const landIndices = new Uint32Array(land.terrain.geometry.index!.array)
  let world: RAPIER.World
  const events = new RAPIER.EventQueue(true)
  const releases: Release[] = []
  const released = new Set<Module>()
  const colliderOwners = new Map<number, number>()
  const rng = randomSource(241543)
  const position = new T.Vector3()
  const rotation = new T.Quaternion()
  const direction = new T.Vector3()
  const contact = new T.Vector3()
  const hitPoint = new T.Vector3()
  const aimTarget: DropTarget = { point: hitPoint }
  let elapsed = 0
  let accumulator = 0
  let nextSound = 0
  let collisions = 0
  let fragments = 0
  let moving = 0
  let impacts = 0
  let maxTilt = 0
  let maxOffset = 0
  let terrainMoved = false
  let physicsMoved = false
  let lastAt: T.Vector3 | undefined
  let lastImpact: Tool | undefined
  let occupied = true

  function clearLanding(x: number, z: number) {
    return [[0, 0], [.34, .22], [-.34, -.22]].every(([dx, dz]) => {
      const a = x + dx
      const b = z + dz
      const ray = new RAPIER.Ray({ x: a, y: ground(a, b) + 12, z: b }, { x: 0, y: -1, z: 0 })
      return !world.castRay(ray, 11.6, true)
    })
  }

  function createWorld() {
    world = new RAPIER.World({ x: 0, y: -18.6, z: 0 })
    colliderOwners.clear()
    world.timestep = 1 / 60
    world.createCollider(RAPIER.ColliderDesc.trimesh(landVertices, landIndices).setFriction(.93))
    world.createCollider(RAPIER.ColliderDesc.cuboid(86, .4, 68).setTranslation(0, -4.13, 0).setFriction(.87))
    for (const [index, structure] of buildings.structures.entries()) {
      const { base, bottom, plan } = structure
      const support = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(plan.x, (base + bottom) * .5, plan.z)
        .setRotation(structure.modules[0].rotation))
      const foundation = world.createCollider(RAPIER.ColliderDesc.cuboid((plan.w + .6) * .5, (base - bottom) * .5, (plan.d + .6) * .5).setFriction(.92), support)
      colliderOwners.set(foundation.handle, index)
      for (const module of structure.modules) {
        const { x, y, z } = module.position
        module.body = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(x, y, z).setRotation(module.rotation)
          .setCanSleep(true).setAngularDamping(.35).setLinearDamping(.23))
        const collider = world.createCollider(RAPIER.ColliderDesc.cuboid(module.size.x * .484, module.size.y * .479, module.size.z * .484)
          .setDensity(.8).setFriction(.81).setRestitution(.08).setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS), module.body)
        colliderOwners.set(collider.handle, index)
      }
    }
    world.step(events)
    events.clear()
  }

  function schedule(tool: Tool, impact: T.Vector3, hitStructure?: number) {
    const profile = timing[tool]
    for (const [index, structure] of buildings.structures.entries()) {
      const { x, z, w, d } = structure.plan
      const edge = Math.hypot(Math.max(0, Math.abs(x - impact.x) - w * .43), Math.max(0, Math.abs(z - impact.z) - d * .43))
      const direct = hitStructure === index
      if (!direct && edge > profile.reach) continue
      const top = structure.plan.floors.length - 1
      const whole = direct || edge <= profile.collapseAt
      const fixed = structure.modules.filter(({ state, tier }) => state === 'fixed' && (whole || tier === top))
      const distance = (module: Module) => Math.hypot(impact.x - module.position.x, impact.z - module.position.z)
      const set = whole ? fixed : fixed.sort((a, b) => distance(a) - distance(b)).slice(0, tool === 'canister' ? 3 : 4)
      if (!set.length) continue
      structure.collapse ||= whole
      if (structure.stage === 'intact') structure.stage = 'damaged'
      for (const module of set) {
        const order = tool === 'crate' ? Math.abs(module.tier - 1) : module.tier
        const cadence = tool === 'canister' && whole ? .052 : profile.separation
        const time = elapsed + .20 + order * cadence + (direct ? 0 : edge * .013) + distance(module) * .008 + rng() * .060
        buildings.scorch(module)
        module.state = 'scheduled'
        releases.push({ structure, module, impact, tool, time })
      }
    }
    buildings.upload()
  }

  function release(item: Release) {
    const { module, structure, tool, impact } = item
    const body = module.body!
    const dx = module.position.x - impact.x
    const dz = module.position.z - impact.z
    const distance = Math.hypot(dx, dz)
    const tipForward = tool === 'canister' && structure.collapse
    if (tipForward) {
      const along = module.position.x - structure.plan.x
      const ahead = module.position.z - structure.plan.z
      direction.set(along * .76 + (rng() - .5) * 2.7, 0, 3.6 + ahead * .14 + rng())
    } else {
      direction.set(dx, 0, dz)
      if (distance < .5) direction.set(rng() - .5, 0, rng() - .5)
      direction.x += (rng() - .5) * 3.4
      direction.z += (rng() - .5) * 3.4
    }
    direction.normalize()
    const profile = timing[tool]
    const swing = tipForward ? 1.24 + module.tier * .23 : 1
    const drift = profile.drift * swing * (.76 + rng() * .35) * (1 - .43 * Math.min(distance / (profile.reach + 4), 1))
    const lift = profile.lift + profile.floorLift * module.tier + rng() * profile.loft + (tipForward ? .78 + module.tier * .44 : 0)
    const lean = profile.lean + rng() * 1.28 + (tipForward ? 1.28 : 0)
    body.setBodyType(RAPIER.RigidBodyType.Dynamic, true)
    body.setLinvel({ x: direction.x * drift, y: lift, z: direction.z * drift }, true)
    body.setAngvel({ x: direction.z * lean, y: (rng() - .5) * (tool === 'crate' ? 2.8 : 1.16), z: -direction.x * lean }, true)
    if (structure.collapse) {
      structure.stage = 'collapsing'
      structure.settleAfter = elapsed + 2.25
    }
    module.state = 'moving'
    released.add(module)
    moving++
    fragments++
  }

  function impact(tool: Tool, target: T.Vector3, hitStructure?: number) {
    lastAt = target.clone()
    lastImpact = tool
    impacts++
    land.stamp(tool, target.x, target.z)
    effects.erupt(tool, target)
    audio.play(tool)
    schedule(tool, lastAt, hitStructure)
  }

  function updatePhysics(dt: number) {
    for (let i = releases.length - 1; i >= 0; i--) {
      const item = releases[i]
      if (item.time > elapsed) continue
      releases.splice(i, 1)
      release(item)
    }
    if (!moving) return false
    accumulator = Math.min(accumulator + dt, 4 / 60)
    let bumped = 0
    let step = false
    while (accumulator >= 1 / 60) {
      world.step(events)
      accumulator -= 1 / 60
      step = true
      events.drainCollisionEvents((first, second, began) => {
        if (!began) return
        bumped++
        if (bumped === 1) {
          const a = world.getCollider(first)?.parent()
          const b = world.getCollider(second)?.parent()
          const point = (a?.isDynamic() ? a : b)?.translation()
          if (point) contact.set(point.x, Math.max(ground(point.x, point.z), point.y - .44), point.z)
        }
      })
    }
    if (!step) return false
    collisions += bumped
    if (bumped && elapsed >= nextSound) {
      audio.play('impact', Math.min(1, bumped / 9))
      effects.landing(contact, Math.min(2, bumped / 4))
      nextSound = elapsed + .11
    }
    moving = 0
    for (const module of released) {
      const body = module.body!
      const resting = body.isSleeping()
      if (resting && module.state === 'resting') continue
      const p = body.translation()
      const q = body.rotation()
      position.set(p.x, p.y, p.z)
      rotation.set(q.x, q.y, q.z, q.w)
      buildings.pose(module, position, rotation)
      maxTilt = Math.max(maxTilt, module.rotation.angleTo(rotation))
      maxOffset = Math.max(maxOffset, module.position.distanceTo(position))
      module.state = resting ? 'resting' : 'moving'
      if (!resting) moving++
    }
    if (!moving) accumulator = 0
    buildings.upload()
    return true
  }

  createWorld()
  root.updateMatrixWorld(true)
  const roofPoint = ({ modules }: Structure) => {
    const tile = modules.at(-2)!
    return tile.position.clone().add(new T.Vector3(0, tile.size.y * .35, 0))
  }
  const structureTarget = roofPoint(buildings.structures[0])
  const centerStructure = buildings.structures[0]
  const centerRoof = centerStructure.modules.filter(({ tier }) => tier === centerStructure.plan.floors.length - 1)
  const edgeTile = buildings.structures[7].modules.at(-2)!
  const edgeTarget = edgeTile.position.clone().add(new T.Vector3(0, edgeTile.size.y / 2 + 1.19, 0))
  const terrainTarget = new T.Vector3(3, ground(3, 20), 20)

  return {
    root, home: { position: [64, 76, 116], target: [-2, 1.55, -1] }, minDistance: 10, maxDistance: 248,
    update(dt, pointScale) {
      elapsed += dt
      descent.update(dt, impact, (tool, point) => effects.trail(tool, point))
      terrainMoved = land.update(dt)
      physicsMoved = updatePhysics(dt)
      for (const [index, structure] of buildings.structures.entries()) {
        if (structure.stage === 'collapsing' && elapsed >= structure.settleAfter
            && !structure.modules.some(({ state }) => state === 'scheduled')) {
          structure.stage = 'ruined'
          const top = Math.max(...structure.modules.map(({ position, size }) => position.y + size.y / 2))
          parachutes.launch(index, structure.plan.x, top, structure.plan.z)
        }
      }
      parachutes.update(dt)
      return effects.update(dt, pointScale)
    },
    setQuality(value) { land.setQuality(value); effects.setQuality(value) },
    aim(raycaster, tool, available, checkRoof = false) {
      marker.visible = false
      if (!raycaster) return undefined
      const { origin, direction } = raycaster.ray
      const found = world.castRay(new RAPIER.Ray(origin, direction), 760, true)
      if (!found) return undefined
      const owner = colliderOwners.get(found.collider.handle)
      // Roof details can extend beyond their supporting physics block.
      const roof = checkRoof && owner === undefined ? buildings.pick(raycaster, found.timeOfImpact) : undefined
      if (roof) hitPoint.copy(roof.point)
      else raycaster.ray.at(found.timeOfImpact, hitPoint)
      const [minX, minZ, maxX, maxZ] = landscapeBounds
      if (hitPoint.x < minX || hitPoint.x > maxX || hitPoint.z < minZ || hitPoint.z > maxZ) return undefined
      aimTarget.structure = roof?.structure ?? owner
      const y = ground(hitPoint.x, hitPoint.z)
      if (Math.abs(hitPoint.y - y) < .27) hitPoint.y += land.deformation(hitPoint.x, hitPoint.z)
      marker.visible = true
      marker.position.set(hitPoint.x, hitPoint.y + .19, hitPoint.z)
      reticleMaterial.color.set(available ? tools[tool].color : '#a9b8b8')
      reticleMaterial.opacity = available ? .91 : .43
      outer.scale.setScalar(tool === 'canister' ? 1.21 : tool === 'crate' ? 1.62 : 2.17)
      return aimTarget
    },
    drop(tool, target, camera) {
      const accepted = descent.launch(tool, target, camera)
      if (accepted) audio.play(tool === 'canister' ? 'drop-canister' : tool === 'crate' ? 'drop-crate' : 'drop-core')
      return accepted
    },
    rebuild() {
      descent.clear()
      effects.clear()
      parachutes.clear()
      land.reset()
      released.clear()
      releases.length = 0
      marker.visible = false
      elapsed = nextSound = accumulator = collisions = fragments = moving = impacts = maxTilt = maxOffset = 0
      terrainMoved = physicsMoved = false
      lastAt = lastImpact = undefined
      buildings.reset()
      events.clear()
      world.free()
      createWorld()
    },
    shadowsMoving: () => terrainMoved || physicsMoved,
    stats: () => ({
      intact: buildings.structures.filter(({ stage }) => stage === 'intact').length,
      damaged: buildings.structures.filter(({ stage }) => stage === 'damaged').length,
      collapsing: buildings.structures.filter(({ stage }) => stage === 'collapsing').length,
      ruined: buildings.structures.filter(({ stage }) => stage === 'ruined').length,
      total: buildings.structures.length, fragments, moving, collisions,
      scars: land.scars, particles: effects.count, impacts, pending: descent.count,
      parachuting: parachutes.airborne, landed: parachutes.landed,
    }),
    inspect: () => ({
      drops: descent.inspect(), tilt: maxTilt, offset: maxOffset, lastImpact,
      groundOffset: lastAt ? land.deformation(lastAt.x, lastAt.z) : 0,
      structureTarget, edgeTarget, terrainTarget, structureStages: buildings.structures.map(({ stage }) => stage),
      roofDrop: centerRoof.reduce((sum, tile) => sum + tile.position.y - tile.body!.translation().y, 0) / centerRoof.length,
      openParachutes: parachutes.open, landingsClear: parachutes.landingsClear,
    }),
    dispose() {
      if (!occupied) return
      occupied = false
      world.free()
      events.free()
      disposeScene(root)
    },
  }
}
