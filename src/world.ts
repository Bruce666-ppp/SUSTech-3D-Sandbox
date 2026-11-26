import type { Camera, Group, Raycaster, Vector3 } from 'three'

export type Language = 'zh-CN' | 'en-US'
export type Quality = 'low' | 'medium' | 'high'
export type Tool = 'orb' | 'pod' | 'core'
export type Vec = readonly [number, number, number]

export const toolOrder: Tool[] = ['orb', 'pod', 'core']
export const tools = {
  orb: { seconds: 1, stars: 1, icon: 'spark', color: '#ffd090', rgb: '255 208 144', descent: .87 },
  pod: { seconds: 5, stars: 3, icon: 'cube', color: '#8ae6d7', rgb: '138 230 215', descent: 1.21 },
  core: { seconds: 15, stars: 5, icon: 'orbit', color: '#e3b5ff', rgb: '227 181 255', descent: 1.55 },
} as const

export interface CameraPose {
  position: Vec
  target: Vec
}

export interface SceneStats {
  intact: number
  total: number
  fragments: number
  moving: number
  collisions: number
  scars: number
  particles: number
  impacts: number
  pending: number
}

export interface Playground {
  root: Group
  home: CameraPose
  minDistance: number
  maxDistance: number
  update(dt: number, pointScale: number): number
  setQuality(quality: Quality): void
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
  dispose(): void
}
