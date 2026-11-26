import type { Camera, Group, Raycaster, Vector3 } from 'three'

export type Language = 'zh-CN' | 'en-US'
export type Mode = 'campus' | 'sandbox'
export type Quality = 'low' | 'medium' | 'high'
export type Tool = 'canister' | 'crate' | 'core'
export type Localized = readonly [zh: string, en: string]
export type Vec = readonly [number, number, number]

export const toolOrder: Tool[] = ['canister', 'crate', 'core']
export const tools = {
  canister: { seconds: 1, stars: 1, icon: 'spark', color: '#ffd090', rgb: '255 208 144', descent: .93 },
  crate: { seconds: 5, stars: 3, icon: 'cube', color: '#9cdeff', rgb: '156 222 255', descent: 1.27 },
  core: { seconds: 15, stars: 5, icon: 'orbit', color: '#ffab89', rgb: '255 171 137', descent: 1.66 },
} as const

export interface CameraPose {
  position: Vec
  target: Vec
}

export interface LandmarkDimensions {
  source: string
  buildings: { label?: Localized, floors: number, heightMeters?: number }[]
}

export interface Landmark {
  id: string
  name: Localized
  category: Localized
  description: Localized
  icon: string
  anchor: Vector3
  focus: CameraPose
  dimensions?: LandmarkDimensions
  pin?: boolean
}

export interface SceneModel {
  root: Group
  home: CameraPose
  minDistance: number
  maxDistance: number
  setQuality(quality: Quality): void
  dispose(): void
}

export interface CampusWorld extends SceneModel {
  overview: CameraPose
  landmarks: Landmark[]
  buildings: number
  elevationRange: number
  update(dt: number, target: Vector3): void
  pick(ray: Raycaster): Landmark | undefined
  select(id?: string): void
}

export interface SceneStats {
  intact: number
  total: number
  damaged: number
  collapsing: number
  ruined: number
  fragments: number
  moving: number
  collisions: number
  scars: number
  particles: number
  impacts: number
  pending: number
}

export interface Playground extends SceneModel {
  update(dt: number, pointScale: number): number
  aim(ray: Raycaster | undefined, tool: Tool, available: boolean): Vector3 | undefined
  drop(tool: Tool, point: Vector3, camera: Camera): boolean
  rebuild(): void
  shadowsMoving(): boolean
  stats(): SceneStats
  inspect(): {
    drops: { tool: Tool, progress: number, height: number }[]
    tilt: number
    offset: number
    groundOffset: number
    lastImpact?: Tool
    structureTarget: Vector3
    terrainTarget: Vector3
  }
}
