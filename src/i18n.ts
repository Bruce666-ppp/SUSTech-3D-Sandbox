import type { Language, Localized, Quality, Tool } from './world'

export const translations = {
  'zh-CN': {
    title: '南科大 3D 沙盒', subtitle: '校园数字孪生与实时物理', campus: '校园探索', sandbox: '物理沙盒', modes: '场景模式',
    language: '切换为 English', soundOn: '关闭音效', soundOff: '开启音效', quality: '渲染画质', low: '低画质', medium: '中画质', high: '高画质',
    fullscreen: '全屏', exitFullscreen: '退出全屏', fullscreenError: '当前浏览器无法进入全屏。',
    soundUnavailable: '当前浏览器不支持音效', floorUnit: '层', dimensions: '校方公开数据', dimensionSource: '查看来源',
    campusTitle: '南方科技大学', campusLabel: '校园数字孪生', location: '中国深圳 · 南山区',
    footprints: '建筑轮廓', elevation: '覆盖区高程差', landmarks: '校园地标', details: '地标简介', close: '关闭',
    drag: '拖动旋转', wheel: '滚轮缩放', pan: '右键平移', touch: '单指旋转 · 双指缩放和平移',
    pick: '点击地标探索', overview: '垂直俯瞰', reset: '重置镜头', rebuild: '重建场景', zoomIn: '放大', zoomOut: '缩小',
    terrain: '高程数据', sandboxTitle: '岚谷试验场', sandboxLabel: '虚构物理场景',
    sandboxHint: '选择道具后，点击场景触发特效。', structures: '完整结构', fragments: '碎片', tools: '沙盒道具',
    grenade: '手榴弹', missile: '导弹', nuke: '核弹', ready: '就绪', seconds: '秒', cooldown: '冷却中', rebuilt: '场景已重建',
    loadingCampus: '正在生成校园地形和建筑', loadingSandbox: '正在初始化物理沙盒',
    graphicsError: '当前浏览器无法启动 WebGL 2。请开启硬件加速后重试。',
    sceneError: '场景加载失败，请重试。', contextLost: '图形连接已中断，请重试。', retry: '重试',
    scene: '可交互 3D 场景', meters: '米', north: '北', east: '东', south: '南', west: '西',
  },
  'en-US': {
    title: 'SUSTech 3D Sandbox', subtitle: 'Campus digital twin & real-time physics', campus: 'Campus Explorer', sandbox: 'Physics Sandbox', modes: 'Scene modes',
    language: 'Switch to 简体中文', soundOn: 'Mute sound', soundOff: 'Enable sound', quality: 'Render quality', low: 'Low quality', medium: 'Medium quality', high: 'High quality',
    fullscreen: 'Fullscreen', exitFullscreen: 'Exit fullscreen', fullscreenError: 'Fullscreen is unavailable in this browser.',
    soundUnavailable: 'Sound is unavailable in this browser', floorUnit: 'floors', dimensions: 'Published building dimensions', dimensionSource: 'View source',
    campusTitle: 'Southern University of Science and Technology', campusLabel: 'Campus digital twin', location: 'Nanshan, Shenzhen · China',
    footprints: 'Mapped buildings', elevation: 'Elevation range', landmarks: 'Campus landmarks', details: 'Landmark details', close: 'Close',
    drag: 'Drag to orbit', wheel: 'Scroll to zoom', pan: 'Right-drag to pan', touch: 'One finger to orbit · Two to zoom or pan',
    pick: 'Select a landmark to explore', overview: 'Top-down view', reset: 'Reset camera', rebuild: 'Rebuild', zoomIn: 'Zoom in', zoomOut: 'Zoom out',
    terrain: 'Elevation data', sandboxTitle: 'Ember Ridge', sandboxLabel: 'Fictional physics scene',
    sandboxHint: 'Choose a tool, then click the scene to trigger its effect.', structures: 'Intact structures', fragments: 'Fragments', tools: 'Sandbox tools',
    grenade: 'Grenade', missile: 'Missile', nuke: 'Nuke', ready: 'Ready', seconds: 's', cooldown: 'Cooling down', rebuilt: 'Scene rebuilt',
    loadingCampus: 'Building the campus terrain and architecture', loadingSandbox: 'Starting the physics sandbox',
    graphicsError: 'WebGL 2 could not start. Enable hardware acceleration and try again.',
    sceneError: 'The scene could not load. Please try again.', contextLost: 'The graphics connection was interrupted. Please try again.', retry: 'Retry',
    scene: 'Interactive 3D scene', meters: 'm', north: 'N', east: 'E', south: 'S', west: 'W',
  },
} as const

export type TranslationKey = keyof typeof translations['en-US']
export const toolOrder: Tool[] = ['grenade', 'missile', 'nuke']
export const qualityOrder: Quality[] = ['low', 'medium', 'high']
export const tools: Record<Tool, { seconds: number, stars: number, icon: string }> = {
  grenade: { seconds: 1, stars: 1, icon: 'spark' },
  missile: { seconds: 5, stars: 3, icon: 'bolt' },
  nuke: { seconds: 15, stars: 5, icon: 'orbit' },
}

export function translated(value: Localized, language: Language) {
  return value[language === 'zh-CN' ? 0 : 1]
}

export function readPreference(key: string) {
  try { return localStorage.getItem(`sustech-3d:${key}`) }
  catch { return null }
}

export function savePreference(key: string, value: string) {
  try { localStorage.setItem(`sustech-3d:${key}`, value) }
  catch { /* The scene remains usable with storage disabled. */ }
}
