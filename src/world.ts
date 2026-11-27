import type { Group, Raycaster, Vector3 } from 'three'

export type Language = 'zh-CN' | 'en-US'
export type Quality = 'low' | 'medium' | 'high'
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

export interface CampusWorld {
  root: Group
  home: CameraPose
  overview: CameraPose
  minDistance: number
  maxDistance: number
  landmarks: Landmark[]
  buildings: number
  elevationRange: number
  update(dt: number, target: Vector3): void
  setQuality(quality: Quality): void
  pick(ray: Raycaster): Landmark | undefined
  select(id?: string): void
  dispose(): void
}
