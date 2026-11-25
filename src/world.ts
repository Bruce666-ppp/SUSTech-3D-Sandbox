import type { Group, Raycaster, Vector3 } from 'three'

export type Language = 'zh-CN' | 'en-US'
export type Mode = 'campus' | 'sandbox'
export type Quality = 'low' | 'medium' | 'high'
export type Tool = 'grenade' | 'missile' | 'nuke'
export type Localized = readonly [zh: string, en: string]
export type Vec = readonly [number, number, number]

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

export interface World {
  root: Group
  home: CameraPose
  overview: CameraPose
  minDistance: number
  maxDistance: number
  update(dt: number, target: Vector3): number
  setQuality(quality: Quality): void
  dispose(): void
}

export interface CampusWorld extends World {
  landmarks: Landmark[]
  buildings: number
  elevationRange: number
  pick(ray: Raycaster): Landmark | undefined
  select(id?: string): void
}

export interface SandboxStats {
  intact: number
  total: number
  fragments: number
  collisions: number
  effects: number
}

export interface SandboxWorld extends World {
  aim(ray?: Raycaster, tool?: Tool): Vector3 | undefined
  activate(tool: Tool, position: Vector3): void
  rebuild(): void
  stats(): SandboxStats
  moving(): boolean
  targetPoint: Vector3
}
