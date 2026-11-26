import type { Quality } from './world'

export const translations = {
  'zh-CN': {
    title: '南科大 3D 沙盒', subtitle: '山地校园与实时物理', worldLabel: '虚构山地校园', worldTitle: '岚谷校园',
    language: '切换为 English', soundOn: '关闭音效', soundOff: '开启音效', soundUnavailable: '当前浏览器不支持音效',
    quality: '渲染画质', low: '低画质', medium: '中画质', high: '高画质',
    fullscreen: '全屏', exitFullscreen: '退出全屏', fullscreenError: '当前浏览器无法进入全屏。',
    drag: '拖动旋转', wheel: '滚轮缩放', pan: '右键平移', touch: '单指旋转 · 双指缩放和平移',
    reset: '重置镜头', rebuild: '重建场景', zoomIn: '放大', zoomOut: '缩小',
    dropHint: '选好道具，点击场景投放。', descending: '道具投放中', structures: '完整建筑', fragments: '碎片', tools: '投放道具',
    orb: '冲击球', pod: '能量舱', core: '超级能量核心', ready: '就绪', seconds: '秒', cooldown: '冷却中', rebuilt: '场景已重建',
    loading: '正在构建岚谷校园', launchBusy: '正在投放，请稍候。',
    graphicsError: '当前浏览器无法启动 WebGL 2。请开启硬件加速后重试。',
    sceneError: '场景加载失败，请重试。', contextLost: '图形连接已中断，请重试。', retry: '重试',
    scene: '可交互 3D 场景', north: '北', east: '东', south: '南', west: '西',
  },
  'en-US': {
    title: 'SUSTech 3D Sandbox', subtitle: 'Mountain campus & real-time physics', worldLabel: 'Fictional mountain campus', worldTitle: 'Mistridge Campus',
    language: 'Switch to 简体中文', soundOn: 'Mute sound', soundOff: 'Enable sound', soundUnavailable: 'Sound is unavailable in this browser',
    quality: 'Render quality', low: 'Low quality', medium: 'Medium quality', high: 'High quality',
    fullscreen: 'Fullscreen', exitFullscreen: 'Exit fullscreen', fullscreenError: 'Fullscreen is unavailable in this browser.',
    drag: 'Drag to orbit', wheel: 'Scroll to zoom', pan: 'Right-drag to pan', touch: 'One finger to orbit · Two to zoom or pan',
    reset: 'Reset camera', rebuild: 'Rebuild', zoomIn: 'Zoom in', zoomOut: 'Zoom out',
    dropHint: 'Choose a tool and click the scene to drop it.', descending: 'Drop in progress', structures: 'Intact buildings', fragments: 'Fragments', tools: 'Drop tools',
    orb: 'Impact Orb', pod: 'Energy Pod', core: 'Mega Core', ready: 'Ready', seconds: 's', cooldown: 'Cooling down', rebuilt: 'Scene rebuilt',
    loading: 'Building Mistridge Campus', launchBusy: 'Drop in progress. Try again shortly.',
    graphicsError: 'WebGL 2 could not start. Enable hardware acceleration and try again.',
    sceneError: 'The scene could not load. Please try again.', contextLost: 'The graphics connection was interrupted. Please try again.', retry: 'Retry',
    scene: 'Interactive 3D scene', north: 'N', east: 'E', south: 'S', west: 'W',
  },
} as const

export type TranslationKey = keyof typeof translations['en-US']
export const qualityOrder: Quality[] = ['low', 'medium', 'high']

export function readPreference(key: string) {
  try { return localStorage.getItem(`sustech-3d:${key}`) }
  catch { return null }
}

export function savePreference(key: string, value: string) {
  try { localStorage.setItem(`sustech-3d:${key}`, value) }
  catch { /* The scene remains usable with storage disabled. */ }
}
