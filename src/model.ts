import * as T from 'three'

export type Point = readonly [number, number]
export type Height = (x: number, z: number) => number
export type Bounds = [minX: number, minZ: number, maxX: number, maxZ: number]

export function randomSource(seed: number) {
  return () => {
    seed = (Math.imul(1664525, seed) + 1013904223) | 0
    return (seed >>> 0) / 4294967296
  }
}

export function inside(x: number, z: number, ring: readonly Point[]) {
  let result = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [a, b] = ring[i]
    const [c, d] = ring[j]
    if ((b > z) !== (d > z) && x < (c - a) * (z - b) / (d - b) + a) result = !result
  }
  return result
}

export function boundsOf(ring: readonly Point[]): Bounds {
  return [
    Math.min(...ring.map((p) => p[0])), Math.min(...ring.map((p) => p[1])),
    Math.max(...ring.map((p) => p[0])), Math.max(...ring.map((p) => p[1])),
  ]
}

export function centerOf(ring: readonly Point[]): Point {
  let x = 0
  let z = 0
  for (const point of ring) {
    x += point[0]
    z += point[1]
  }
  return [x / ring.length, z / ring.length]
}

export function rectangle(x: number, z: number, w: number, d: number, angle = 0): Point[] {
  const cos = Math.cos(angle)
  const sin = Math.sin(angle)
  const offsets: Point[] = [[-w / 2, -d / 2], [w / 2, -d / 2], [w / 2, d / 2], [-w / 2, d / 2]]
  return offsets.map(([a, b]) => [x + a * cos - b * sin, z + a * sin + b * cos])
}

export function clipPolygon(ring: readonly Point[], [west, north, east, south]: Bounds): Point[] {
  let output = [...ring]
  const edges = [[0, west, 1], [0, east, -1], [1, north, 1], [1, south, -1]] as const
  for (const [axis, edge, sense] of edges) {
    const input = output
    output = []
    for (let i = 0; i < input.length; i++) {
      const a = input[(i + input.length - 1) % input.length]
      const b = input[i]
      const hasA = (a[axis] - edge) * sense >= 0
      const hasB = (b[axis] - edge) * sense >= 0
      if (hasA !== hasB) {
        const t = (edge - a[axis]) / (b[axis] - a[axis])
        output.push([T.MathUtils.lerp(a[0], b[0], t), T.MathUtils.lerp(a[1], b[1], t)])
      }
      if (hasB) output.push(b)
    }
  }
  return output
}

export function planar(ring: readonly Point[], at: Height) {
  const geometry = new T.BufferGeometry()
  const contour = ring.map(([x, z]) => new T.Vector2(x, -z))
  const faces = T.ShapeUtils.triangulateShape(contour, [])
  geometry.setAttribute('position', new T.Float32BufferAttribute(ring.flatMap(([x, z]) => [x, at(x, z), z]), 3))
  geometry.setIndex(faces.flat())
  geometry.computeVertexNormals()
  return geometry
}

export function ribbon(line: readonly Point[], width: number, height: Height) {
  const position: number[] = []
  const indices: number[] = []
  const points: Point[] = []
  for (let i = 1; i < line.length; i++) {
    const [x0, z0] = line[i - 1]
    const [x1, z1] = line[i]
    const divisions = Math.ceil(Math.hypot(x1 - x0, z1 - z0) / 1.1)
    for (let j = 0; j < divisions; j++) points.push([T.MathUtils.lerp(x0, x1, j / divisions), T.MathUtils.lerp(z0, z1, j / divisions)])
  }
  points.push(line[line.length - 1])
  for (let i = 0; i < points.length; i++) {
    const [x, z] = points[i]
    const [ax, az] = points[Math.max(0, i - 1)]
    const [bx, bz] = points[Math.min(points.length - 1, i + 1)]
    const length = Math.hypot(bx - ax, bz - az) || 1
    const nx = (bz - az) * width / (2 * length)
    const nz = -(bx - ax) * width / (2 * length)
    position.push(x + nx, height(x + nx, z + nz), z + nz, x - nx, height(x - nx, z - nz), z - nz)
    if (i) {
      const a = (i - 1) * 2
      indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2)
    }
  }
  const geometry = new T.BufferGeometry()
  geometry.setAttribute('position', new T.Float32BufferAttribute(position, 3))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  return geometry
}

export function makeTerrain(bounds: Bounds, resolution: number, height: Height, tint: (x: number, z: number, y: number) => T.Color, floor = -5,
  edgeColors = ['#526b58', '#354940', '#28413c', '#173333']) {
  const [minX, minZ, maxX, maxZ] = bounds
  const positions: number[] = []
  const colors: number[] = []
  const indices: number[] = []
  const edge: number[] = []
  const span = resolution + 1
  for (let row = 0; row <= resolution; row++) {
    for (let col = 0; col <= resolution; col++) {
      const x = T.MathUtils.lerp(minX, maxX, col / resolution)
      const z = T.MathUtils.lerp(minZ, maxZ, row / resolution)
      const y = height(x, z)
      const color = tint(x, z, y)
      positions.push(x, y, z)
      colors.push(color.r, color.g, color.b)
      if (row && col) {
        const a = row * span + col
        indices.push(a, a - span, a - 1, a - 1, a - span, a - span - 1)
      }
    }
  }
  for (let i = 0; i < resolution; i++) edge.push(i)
  for (let i = 0; i < resolution; i++) edge.push(i * span + resolution)
  for (let i = resolution; i > 0; i--) edge.push(resolution * span + i)
  for (let i = resolution; i > 0; i--) edge.push(i * span)
  const geometry = new T.BufferGeometry()
  geometry.setAttribute('position', new T.Float32BufferAttribute(positions, 3))
  geometry.setAttribute('color', new T.Float32BufferAttribute(colors, 3))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  const surface = new T.Mesh(geometry, new T.MeshStandardMaterial({ vertexColors: true, roughness: 1 }))
  surface.receiveShadow = true
  surface.castShadow = true
  const side = new T.BufferGeometry()
  const sidePositions: number[] = []
  const sideColors: number[] = []
  const sideIndices: number[] = []
  const bands = edgeColors.map((color) => new T.Color(color))
  for (const index of edge) {
    const [x, y, z] = positions.slice(index * 3, index * 3 + 3)
    sidePositions.push(x, y - .01, z, x, Math.max(floor + 1.6, y - 1.1), z, x, floor + 1.1, z, x, floor, z)
    const lit = .90 + .12 * Math.sin(x * .26 + z * .13)
    for (const color of bands) sideColors.push(color.r * lit, color.g * lit, color.b * lit)
  }
  for (let i = 0; i < edge.length; i++) {
    const a = i * 4
    const b = (i + 1) % edge.length * 4
    for (let band = 0; band < 3; band++) sideIndices.push(a + band, a + band + 1, b + band, b + band, a + band + 1, b + band + 1)
  }
  side.setAttribute('position', new T.Float32BufferAttribute(sidePositions, 3))
  side.setAttribute('color', new T.Float32BufferAttribute(sideColors, 3))
  side.setIndex(sideIndices)
  side.computeVertexNormals()
  const rim = new T.Mesh(side, new T.MeshStandardMaterial({ vertexColors: true, side: T.DoubleSide, roughness: 1 }))
  rim.receiveShadow = true
  return { surface, rim }
}

export class Instances {
  private readonly matrices: T.Matrix4[] = []
  private readonly colors: T.Color[] = []
  private readonly dummy = new T.Object3D()

  add(x: number, y: number, z: number, w: number, h: number, d: number, tint: T.ColorRepresentation, angle = 0, tip = 0) {
    this.dummy.position.set(x, y, z)
    this.dummy.scale.set(w, h, d)
    this.dummy.rotation.set(tip, angle, 0)
    this.dummy.updateMatrix()
    this.matrices.push(this.dummy.matrix.clone())
    this.colors.push(new T.Color(tint))
  }

  mesh(geometry: T.BufferGeometry, material: T.Material, castShadow = true) {
    const mesh = new T.InstancedMesh(geometry, material, this.matrices.length)
    this.matrices.forEach((matrix, i) => {
      mesh.setMatrixAt(i, matrix)
      mesh.setColorAt(i, this.colors[i])
    })
    mesh.receiveShadow = true
    mesh.castShadow = castShadow
    return mesh
  }
}

export function makeWater() {
  const time = { value: 0 }
  const material = new T.MeshStandardMaterial({ color: '#3b7a83', metalness: .12, roughness: .37, side: T.DoubleSide })
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uWaterTime = time
    shader.vertexShader = `varying vec2 vWater;\n${shader.vertexShader}`.replace('#include <begin_vertex>', '#include <begin_vertex>\nvWater = position.xz;')
    shader.fragmentShader = `varying vec2 vWater;\nuniform float uWaterTime;\n${shader.fragmentShader}`.replace('#include <color_fragment>', `
      #include <color_fragment>
      float ripple = sin(vWater.x * 1.6 + vWater.y * 2.8 - uWaterTime * 1.35 + sin(vWater.x * .73 + vWater.y * .61) * 1.4);
      float glint = pow(max(ripple, 0.0), 8.0) * (.48 + .48 * sin(vWater.x * .83 - vWater.y * .46));
      diffuseColor.rgb *= .86 + .14 * sin(vWater.x * .32 + vWater.y * .44 + uWaterTime * .5);
      diffuseColor.rgb += vec3(.037, .071, .085) * glint;
    `)
  }
  return { material, time }
}

export function disposeScene(root: T.Object3D) {
  const geometries = new Set<T.BufferGeometry>()
  const materials = new Set<T.Material>()
  const textures = new Set<T.Texture>()
  root.traverse((object) => {
    if (!(object instanceof T.Mesh || object instanceof T.Line || object instanceof T.Points)) return
    if (object instanceof T.InstancedMesh) object.dispose()
    geometries.add(object.geometry)
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) materials.add(material)
  })
  for (const material of materials) {
    for (const value of Object.values(material)) if (value instanceof T.Texture) textures.add(value)
    material.dispose()
  }
  for (const geometry of geometries) geometry.dispose()
  for (const texture of textures) texture.dispose()
  root.clear()
}
