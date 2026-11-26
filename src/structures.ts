import * as T from 'three'
import type RAPIER from '@dimforge/rapier3d-compat'
import { ground } from './landscape'
import { Instances, rectangle } from './model'

const palettes = {
  studio: { stone: '#c1beb0', glass: '#3f6d76', trim: '#e4dbc6', roof: '#778e87' },
  archive: { stone: '#b7b3a3', glass: '#386673', trim: '#d6cbb6', roof: '#9ba99b' },
  residence: { stone: '#c0a68b', glass: '#4b6867', trim: '#e0ccab', roof: '#8c8f79' },
  pavilion: { stone: '#b6b5a7', glass: '#496d71', trim: '#c9cdba', roof: '#596d67' },
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

// Display-space lots arranged around the valley paths and water.
const plans: Plan[] = [
  { x: -5, z: -4, w: 15, d: 11, angle: -.15, floors: [2, 2, 2, 1], style: 'studio', layout: 'court', roof: 'lights' },
  { x: 10, z: -6, w: 8.8, d: 8.6, angle: .14, floors: [2, 2, 1], style: 'archive', layout: 'block', roof: 'terrace' },
  { x: -28, z: -3, w: 13, d: 8.2, angle: .12, floors: [2, 2, 1], style: 'archive', layout: 'corner', roof: 'lights' },
  { x: -38, z: 10, w: 9.7, d: 7.3, angle: .26, floors: [2, 2, 1], style: 'pavilion', layout: 'block', roof: 'ridge' },
  { x: -29, z: 18, w: 10.8, d: 6.6, angle: -.09, floors: [2, 1], style: 'pavilion', layout: 'row', roof: 'ridge' },
  { x: -10, z: 19, w: 11, d: 7.3, angle: -.12, floors: [2, 2, 1], style: 'studio', layout: 'row', roof: 'terrace' },
  { x: 4, z: 16, w: 9.4, d: 6.2, angle: -.29, floors: [2, 1], style: 'pavilion', layout: 'block', roof: 'ridge' },
  { x: 17, z: 11, w: 8.1, d: 7.3, angle: -.38, floors: [2, 2, 1], style: 'archive', layout: 'block', roof: 'lights' },
  { x: 34, z: 1, w: 11.7, d: 6.9, angle: -.27, floors: [2, 2, 1], style: 'studio', layout: 'row', roof: 'terrace' },
  { x: 47, z: -14, w: 10.6, d: 7.7, angle: .28, floors: [2, 2, 2], style: 'residence', layout: 'block', roof: 'terrace' },
  { x: 26, z: -22, w: 11.5, d: 8.1, angle: .18, floors: [2, 2, 2, 1], style: 'residence', layout: 'corner', roof: 'terrace' },
  { x: 12, z: -24, w: 9, d: 6.8, angle: .18, floors: [2, 2, 2], style: 'residence', layout: 'row', roof: 'ridge' },
  { x: -3, z: -27, w: 11, d: 7, angle: .04, floors: [2, 2, 2, 1], style: 'residence', layout: 'row', roof: 'terrace' },
  { x: -17, z: -27, w: 9.2, d: 7.8, angle: -.13, floors: [2, 2, 1], style: 'studio', layout: 'block', roof: 'terrace' },
  { x: -34, z: -21, w: 10.1, d: 6.8, angle: -.25, floors: [2, 2, 1], style: 'pavilion', layout: 'row', roof: 'ridge' },
  { x: 54, z: 16, w: 7.1, d: 5.5, angle: -.17, floors: [2, 1], style: 'archive', layout: 'row', roof: 'lights' },
]

export const buildingPlots = plans.map(({ x, z, w, d }) => ({ x, z, radius: Math.hypot(w, d) * .48 + .85 }))

type PartKind = 'wall' | 'window' | 'ridge' | 'light'
type Part = { kind: PartKind, index: number, local: T.Matrix4 }

export interface Module {
  position: T.Vector3
  rotation: T.Quaternion
  size: T.Vector3
  parts: Part[]
  tier: number
  floor: number
  body?: RAPIER.RigidBody
  state: 'fixed' | 'scheduled' | 'moving' | 'resting'
}

export interface Structure {
  plan: Plan
  base: number
  bottom: number
  modules: Module[]
  disturbed: boolean
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
  const colors: Record<PartKind, T.Color[]> = { wall: [], window: [], ridge: [], light: [] }
  const foundations = new Instances()
  const dummy = new T.Object3D()
  const horizontal = new T.Vector3(0, 1, 0)
  const story = .94

  function add(module: Module, kind: PartKind, color: string, x: number, y: number, z: number,
    w: number, h: number, d: number, angle = 0) {
    dummy.position.set(x, y, z)
    dummy.rotation.set(0, angle, 0)
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
    const base = Math.max(ground(x, z), ...elevations) + .18
    const bottom = Math.min(ground(x, z), ...elevations) - .19
    foundations.add(x, (base + bottom) * .5, z, w + .61, base - bottom, d + .61, '#a19d87', -angle)
    foundations.add(x, base - .073, z, w + .84, .15, d + .84, '#c7c1ad', -angle)
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
            position, rotation, size: new T.Vector3(cellW, h, cellD), parts: [], tier, floor, state: 'fixed',
          }
          modules.push(module)
          add(module, 'wall', palette.stone, 0, 0, 0, cellW - .042, h - .037, cellD - .042)

          for (const [dx, dz] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
            if (present(col + dx, row + dz, tier)) continue
            const span = dx ? cellD : cellW
            const bays = Math.max(2, Math.floor(span / (style === 'studio' ? .82 : 1.04)))
            const interval = span / bays
            const facadeX = dx * cellW / 2
            const facadeZ = dz * cellD / 2
            for (let level = 0; level < count; level++) {
              const y = -h / 2 + (level + .53) * story
              const windowHeight = style === 'studio' ? .66 : .55
              add(module, 'wall', palette.trim, facadeX, y - .39, facadeZ, dx ? .13 : span, .13, dz ? .13 : span)
              for (let b = 0; b < bays; b++) {
                const along = -span / 2 + (b + .5) * interval
                const windowColor = (b + col + row + level) % 4 === 0 ? '#4d7980' : palette.glass
                add(module, 'window', windowColor, facadeX + dz * along, y, facadeZ + dx * along,
                  dx ? .085 : interval * .77, windowHeight, dz ? .085 : interval * .77)
              }
            }
          }

          if (!present(col, row, tier + 1) || tier === floors.length - 1) {
            const top = h / 2
            add(module, 'wall', palette.trim, 0, top + .057, 0, cellW + .16, .15, cellD + .16)
            add(module, 'wall', palette.roof, 0, top + .139, 0, cellW - .14, .025, cellD - .14)
            if (roof === 'ridge') add(module, 'ridge', palette.roof, 0, top + .40, 0, cellW + .13, .58, cellD + .17)
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
    return { plan, base, bottom, modules, disturbed: false }
  })

  const box = new T.BoxGeometry()
  root.add(foundations.mesh(box, new T.MeshStandardMaterial({ roughness: .91 })))
  const material = (roughness: number, metalness = 0) => new T.MeshStandardMaterial({ roughness, metalness, side: T.DoubleSide })
  const meshes = {
    wall: new T.InstancedMesh(box, material(.85), colors.wall.length),
    window: new T.InstancedMesh(box, material(.34, .18), colors.window.length),
    ridge: new T.InstancedMesh(gableGeometry(), material(.86), colors.ridge.length),
    light: new T.InstancedMesh(new T.TetrahedronGeometry(.7), material(.36, .11), colors.light.length),
  }
  for (const kind of Object.keys(meshes) as PartKind[]) {
    const mesh = meshes[kind]
    mesh.frustumCulled = false
    mesh.castShadow = kind !== 'window'
    mesh.receiveShadow = true
    mesh.instanceMatrix.setUsage(T.DynamicDrawUsage)
    colors[kind].forEach((color, i) => mesh.setColorAt(i, color))
    root.add(mesh)
  }
  const transform = new T.Matrix4()
  const composed = new T.Matrix4()
  const unit = new T.Vector3(1, 1, 1)

  function pose(module: Module, position = module.position, rotation = module.rotation) {
    transform.compose(position, rotation, unit)
    for (const part of module.parts) meshes[part.kind].setMatrixAt(part.index, composed.multiplyMatrices(transform, part.local))
  }

  function upload() {
    for (const mesh of Object.values(meshes)) mesh.instanceMatrix.needsUpdate = true
  }

  function reset() {
    for (const structure of structures) {
      structure.disturbed = false
      for (const module of structure.modules) {
        module.state = 'fixed'
        pose(module)
      }
    }
    upload()
  }
  reset()

  return { structures, pose, upload, reset }
}
