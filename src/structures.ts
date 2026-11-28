import * as T from 'three'
import type RAPIER from '@dimforge/rapier3d-compat'
import { ground } from './landscape'
import { Instances, rectangle } from './model'

const palettes = {
  stage: { stone: '#9ca5a5', glass: '#3d505b', trim: '#d4ba8e', roof: '#4f636d' },
  steel: { stone: '#778b8e', glass: '#445f65', trim: '#a4b9b9', roof: '#536c70' },
  brick: { stone: '#aa6d56', glass: '#464f53', trim: '#d5a284', roof: '#6e5550' },
  timber: { stone: '#c2a584', glass: '#444d4c', trim: '#8d705b', roof: '#91624c' },
}

type Style = keyof typeof palettes
type Layout = 'row' | 'court' | 'corner' | 'block'
type Roof = 'terrace' | 'ridge' | 'lights'

interface Plan {
  x: number
  z: number
  w: number
  d: number
  angle: number
  floors: number[]
  style: Style
  layout: Layout
  roof: Roof
}

// Original scenery lots on the backlot apron.
const plans: Plan[] = [
  { x: 0, z: -2, w: 16, d: 10.6, angle: 0, floors: [2, 2, 2, 2], style: 'stage', layout: 'court', roof: 'lights' },
  { x: -18, z: -1, w: 12.8, d: 11.2, angle: -.03, floors: [3, 2], style: 'steel', layout: 'row', roof: 'ridge' },
  { x: 18, z: -5, w: 9.9, d: 8.8, angle: .03, floors: [2, 2, 2, 2], style: 'brick', layout: 'corner', roof: 'terrace' },
  { x: -34, z: -9, w: 13.5, d: 10.1, angle: 0, floors: [2, 2], style: 'timber', layout: 'row', roof: 'ridge' },
  { x: -29, z: 10, w: 13.2, d: 5.8, angle: .03, floors: [2, 1], style: 'timber', layout: 'row', roof: 'ridge' },
  { x: -10, z: 10, w: 9, d: 6.5, angle: 0, floors: [2, 2, 1], style: 'stage', layout: 'row', roof: 'terrace' },
  { x: 14, z: 10, w: 8.7, d: 5.9, angle: -.03, floors: [2, 1], style: 'timber', layout: 'row', roof: 'ridge' },
  { x: 33, z: 2, w: 14.0, d: 10, angle: 0, floors: [3, 2, 1], style: 'steel', layout: 'block', roof: 'ridge' },
  { x: 34, z: -17, w: 13, d: 8.3, angle: .03, floors: [2, 2, 1], style: 'timber', layout: 'row', roof: 'ridge' },
  { x: 9, z: -20, w: 10, d: 8.6, angle: 0, floors: [2, 2, 2], style: 'brick', layout: 'block', roof: 'terrace' },
  { x: -8, z: -20, w: 11, d: 7.2, angle: -.02, floors: [2, 2, 2], style: 'brick', layout: 'row', roof: 'terrace' },
  { x: -25, z: -23, w: 15, d: 6.7, angle: .03, floors: [3, 2], style: 'steel', layout: 'row', roof: 'ridge' },
]

type PartKind = 'wall' | 'window' | 'ridge' | 'light' | 'fracture'
type Part = { kind: PartKind, index: number, local: T.Matrix4 }
type Stage = 'intact' | 'damaged' | 'collapsing' | 'ruined'

export interface Module {
  position: T.Vector3
  rotation: T.Quaternion
  size: T.Vector3
  parts: Part[]
  tier: number
  body?: RAPIER.RigidBody
  state: 'fixed' | 'scheduled' | 'moving' | 'resting'
  scorched: boolean
}

export interface Structure {
  plan: Plan
  base: number
  bottom: number
  modules: Module[]
  stage: Stage
  collapse: boolean
  settleAfter: number
}

function gableGeometry() {
  const g = new T.BufferGeometry()
  const corners = [-.5, -.5, -.5, .5, -.5, -.5, -.5, -.5, .5, .5, -.5, .5, -.5, .5, 0, .5, .5, 0]
  g.setAttribute('position', new T.Float32BufferAttribute(corners, 3))
  g.setIndex([0, 4, 1, 1, 4, 5, 4, 2, 5, 2, 3, 5, 0, 2, 4, 1, 5, 3, 0, 1, 2, 2, 1, 3])
  const planar = g.toNonIndexed()
  g.dispose()
  planar.computeVertexNormals()
  return planar
}

export function createStructures(root: T.Group) {
  const colors: Record<PartKind, T.Color[]> = { wall: [], window: [], ridge: [], light: [], fracture: [] }
  const foundations = new Instances()
  const dummy = new T.Object3D()
  const horizontal = new T.Vector3(0, 1, 0)
  const story = .94

  function add(module: Module, kind: PartKind, color: string, x: number, y: number, z: number,
    w: number, h: number, d: number, angle = 0, roll = 0) {
    dummy.position.set(x, y, z)
    dummy.rotation.set(0, angle, roll, 'YXZ')
    dummy.scale.set(w, h, d)
    dummy.updateMatrix()
    module.parts.push({ kind, index: colors[kind].length, local: dummy.matrix.clone() })
    colors[kind].push(new T.Color(color))
  }

  const structures = plans.map((plan): Structure => {
    const { x, z, w, d, angle, floors, style, layout, roof } = plan
    const palette = palettes[style]
    const rotation = new T.Quaternion().setFromAxisAngle(horizontal, -angle)
    const elevations = rectangle(x, z, w + .5, d + .5, angle).map(([a, b]) => ground(a, b))
    const base = Math.max(ground(x, z), ...elevations) + .14
    const bottom = Math.min(ground(x, z), ...elevations) - .19
    foundations.add(x, (base + bottom) * .5, z, w + .61, base - bottom, d + .61, '#80807d', -angle)
    foundations.add(x, base - .073, z, w + .84, .15, d + .84, '#9a9d97', -angle)
    const cols = layout === 'court' || layout === 'corner' ? 3 : 2
    const rows = layout === 'row' ? 1 : 2
    const present = (col: number, row: number, tier: number) => col >= 0 && col < cols && row >= 0 && row < rows
      && !(layout === 'court' && col === 1 && row === 1)
      && !(layout === 'corner' && row === 0 && col === 0)
      && !(tier === floors.length - 1 && layout === 'court' && row === 1 && col === 0)
    const cellW = w / cols
    const cellD = d / rows
    const modules: Module[] = []
    let floor = 0

    floors.forEach((count, tier) => {
      const h = count * story
      for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
          if (!present(col, row, tier)) continue
          const position = new T.Vector3((col + .5) * cellW - w / 2, 0, (row + .5) * cellD - d / 2).applyQuaternion(rotation)
          position.add(new T.Vector3(x, base + floor * story + h / 2, z))
          const module: Module = {
            position, rotation, size: new T.Vector3(cellW, h, cellD), parts: [], tier, state: 'fixed', scorched: false,
          }
          modules.push(module)
          add(module, 'wall', palette.stone, 0, 0, 0, cellW - .042, h - .037, cellD - .042)

          for (const [dx, dz] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
            if (present(col + dx, row + dz, tier)) continue
            const span = dx ? cellD : cellW
            const bays = Math.max(2, Math.floor(span / (style === 'brick' ? 1.04 : 1.44)))
            const interval = span / bays
            const facadeX = dx * cellW / 2
            const facadeZ = dz * cellD / 2
            for (let level = 0; level < count; level++) {
              const y = -h / 2 + (level + .53) * story
              const windowHeight = style === 'brick' ? .56 : style === 'stage' ? .34 : .25
              add(module, 'wall', palette.trim, facadeX, y - .39, facadeZ, dx ? .13 : span, .13, dz ? .13 : span)
              for (let b = 0; b < bays; b++) {
                const along = -span / 2 + (b + .5) * interval
                const windowColor = (b + col + row + level) % 4 === 0 ? '#647a80' : palette.glass
                add(module, 'window', windowColor, facadeX + dz * along, y, facadeZ + dx * along,
                  dx ? .085 : interval * .70, windowHeight, dz ? .085 : interval * .70)
              }
            }
            if (style === 'steel' || style === 'stage') {
              for (let batten = 1; batten < bays * 2; batten++) {
                const along = span * (batten / (bays * 2) - .5)
                add(module, 'wall', palette.trim, facadeX + dz * along, 0, facadeZ + dx * along,
                  dx ? .08 : .045, h * .92, dz ? .08 : .045)
              }
              if (tier === 0 && dz === 1) {
                add(module, 'wall', '#424e55', facadeX, -.28, facadeZ + .079, span * .59, h * .68, .09)
                add(module, 'wall', '#c49d63', facadeX, h * .22, facadeZ + .123, span * .62, .115, .074)
              }
            }
            const face = dx ? Math.PI * .5 : 0
            add(module, 'fracture', '#473733', facadeX + dx * .154, .11 * h, facadeZ + dz * .154,
              .13, .61 * h, .025, face, -.72)
            add(module, 'fracture', '#473733', facadeX + dx * .155 + dz * .21, -.22 * h, facadeZ + dz * .155 + dx * .21,
              .07, .37 * h, .025, face, .51)
          }

          if (!present(col, row, tier + 1) || tier === floors.length - 1) {
            const top = h / 2
            add(module, 'wall', palette.trim, 0, top + .057, 0, cellW + .16, .15, cellD + .16)
            add(module, 'wall', palette.roof, 0, top + .139, 0, cellW - .14, .025, cellD - .14)
            if (roof === 'ridge') {
              const peak = style === 'steel' ? 1.18 : .81
              add(module, 'ridge', palette.roof, 0, top + peak * .5 + .10, 0, cellW + .13, peak, cellD + .17)
              add(module, 'wall', palette.trim, 0, top + peak + .11, 0, cellW + .17, .09, .115)
            }
            if (roof === 'lights') {
              add(module, 'light', '#bad2ce', cellW * -.17, top + .34, 0, cellW * .56, .46, cellD * .61, (row + col) * .48)
              add(module, 'wall', '#e8e0ca', cellW * -.17, top + .146, 0, cellW * .53, .10, cellD * .58)
            }
            if (roof === 'terrace') {
              add(module, 'wall', '#819971', 0, top + .194, cellD * .09, cellW * .66, .09, cellD * .58)
              add(module, 'wall', '#c9c4af', -cellW * .14, top + .29, -cellD * .23, cellW * .35, .25, cellD * .31)
            }
          }
        }
      }
      floor += count
    })
    return { plan, base, bottom, modules, stage: 'intact', collapse: false, settleAfter: 0 }
  })

  const box = new T.BoxGeometry()
  root.add(foundations.mesh(box, new T.MeshStandardMaterial({ roughness: .91 })))
  const material = (roughness: number, metalness = 0) => new T.MeshStandardMaterial({ roughness, metalness, side: T.DoubleSide })
  const meshes = {
    wall: new T.InstancedMesh(box, material(.85), colors.wall.length),
    window: new T.InstancedMesh(box, material(.34, .18), colors.window.length),
    ridge: new T.InstancedMesh(gableGeometry(), material(.86), colors.ridge.length),
    light: new T.InstancedMesh(new T.TetrahedronGeometry(.7), material(.36, .11), colors.light.length),
    fracture: new T.InstancedMesh(box, material(.98), colors.fracture.length),
  }
  const pickable = [meshes.wall, meshes.window, meshes.ridge, meshes.light]
  const owners = new Map<T.Object3D, Uint8Array>(pickable.map((mesh) => [mesh, new Uint8Array(mesh.count)]))
  for (const [index, structure] of structures.entries()) {
    for (const { parts } of structure.modules) {
      for (const part of parts) {
        const lookup = owners.get(meshes[part.kind])
        if (lookup) lookup[part.index] = index
      }
    }
  }
  for (const kind of Object.keys(meshes) as PartKind[]) {
    const mesh = meshes[kind]
    mesh.frustumCulled = false
    mesh.castShadow = kind !== 'window' && kind !== 'fracture'
    mesh.receiveShadow = true
    mesh.instanceMatrix.setUsage(T.DynamicDrawUsage)
    colors[kind].forEach((color, i) => mesh.setColorAt(i, color))
    root.add(mesh)
  }
  const transform = new T.Matrix4()
  const composed = new T.Matrix4()
  const unit = new T.Vector3(1, 1, 1)
  const hidden = new T.Matrix4().makeScale(0, 0, 0)
  const char = new T.Color('#50413e')
  const tint = new T.Color()

  function pose(module: Module, position = module.position, rotation = module.rotation) {
    transform.compose(position, rotation, unit)
    for (const part of module.parts) {
      const matrix = part.kind === 'fracture' && !module.scorched ? hidden : composed.multiplyMatrices(transform, part.local)
      meshes[part.kind].setMatrixAt(part.index, matrix)
    }
  }

  function upload() {
    for (const mesh of Object.values(meshes)) {
      mesh.instanceMatrix.needsUpdate = true
      mesh.boundingSphere = null
    }
  }

  function charModule(module: Module, scorched: boolean) {
    if (module.scorched === scorched) return
    module.scorched = scorched
    for (const { kind, index } of module.parts) {
      if (kind !== 'wall' && kind !== 'ridge') continue
      tint.copy(colors[kind][index]).lerp(char, scorched ? .33 : 0)
      meshes[kind].setColorAt(index, tint)
      meshes[kind].instanceColor!.needsUpdate = true
    }
    pose(module)
  }

  function reset() {
    for (const structure of structures) {
      structure.stage = 'intact'
      structure.collapse = false
      structure.settleAfter = 0
      for (const module of structure.modules) {
        module.state = 'fixed'
        charModule(module, false)
        pose(module)
      }
    }
    upload()
  }
  reset()

  function pick(ray: T.Raycaster, groundDistance: number) {
    const hit = ray.intersectObjects(pickable, false)[0]
    if (!hit || hit.instanceId === undefined || hit.distance > groundDistance) return undefined
    return { point: hit.point, structure: owners.get(hit.object)![hit.instanceId] }
  }

  return { structures, pose, upload, reset, pick, scorch: (module: Module) => charModule(module, true) }
}
