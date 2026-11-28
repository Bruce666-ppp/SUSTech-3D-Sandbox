import type { Language, Localized, Quality } from './world'

export const translations = {
  'zh-CN': {
    title: '南科大 3D 沙盒', subtitle: '校园漫游与影视特效', modes: '场景选择', campus: '校园探索', sandbox: '特效试验场',
    campusLabel: '公开地图与地形', campusTitle: '南方科技大学', location: '广东深圳 · 南山区',
    sandboxLabel: '虚构影视布景', sandboxTitle: '校园布景',
    footprints: '建筑轮廓', elevation: '地形高差', meters: '米', landmarks: '校园地标', overview: '俯瞰校园',
    details: '地标详情', close: '关闭详情', dimensions: '公开建筑资料', dimensionSource: '查看资料来源', floorUnit: '层',
    terrain: 'Copernicus 高程数据说明',
    language: '切换为 English', soundOn: '关闭音效', soundOff: '开启音效', soundUnavailable: '当前浏览器不支持音效',
    quality: '渲染画质', low: '低画质', medium: '中画质', high: '高画质',
    fullscreen: '全屏', exitFullscreen: '退出全屏', fullscreenError: '当前浏览器无法进入全屏。',
    drag: '拖动旋转', wheel: '滚轮缩放', pan: '右键平移', touch: '单指旋转 · 双指缩放和平移',
    reset: '重置镜头', rebuild: '重建场景', zoomIn: '放大', zoomOut: '缩小',
    dropHint: '选好道具，点击场景投放。', descending: '道具投放中', structures: '完整布景', fragments: '碎片', tools: '影视特效道具',
    damaged: '受损', collapsing: '坍塌中', ruined: '废墟', parachuting: '卡通角色正在伞降', landed: '已着陆',
    canister: '闪焰筒', crate: '烟火箱', core: '焰云核心', ready: '就绪', seconds: '秒', cooldown: '冷却中', rebuilt: '布景已重建',
    loadingCampus: '正在加载南科大校园', loadingSandbox: '正在搭建影视布景', launchBusy: '正在投放，请稍候。',
    graphicsError: '当前浏览器无法启动 WebGL 2。请开启硬件加速后重试。',
    sceneError: '场景加载失败，请重试。', contextLost: '图形连接已中断，请重试。', retry: '重试',
    scene: '可交互 3D 场景', north: '北', east: '东', south: '南', west: '西',
  },
  'en-US': {
    title: 'SUSTech 3D Sandbox', subtitle: 'Campus tours & cinematic effects', modes: 'Choose scene', campus: 'Campus Explorer', sandbox: 'Effects Sandbox',
    campusLabel: 'Open map and terrain data', campusTitle: 'Southern University of Science and Technology', location: 'Nanshan · Shenzhen, China',
    sandboxLabel: 'Fictional film set', sandboxTitle: 'Campus Backlot',
    footprints: 'Building footprints', elevation: 'Elevation range', meters: 'm', landmarks: 'Campus landmarks', overview: 'Overhead view',
    details: 'Landmark details', close: 'Close details', dimensions: 'Published building details', dimensionSource: 'View source', floorUnit: 'floors',
    terrain: 'Copernicus elevation data notice',
    language: 'Switch to 简体中文', soundOn: 'Mute sound', soundOff: 'Enable sound', soundUnavailable: 'Sound is unavailable in this browser',
    quality: 'Render quality', low: 'Low quality', medium: 'Medium quality', high: 'High quality',
    fullscreen: 'Fullscreen', exitFullscreen: 'Exit fullscreen', fullscreenError: 'Fullscreen is unavailable in this browser.',
    drag: 'Drag to orbit', wheel: 'Scroll to zoom', pan: 'Right-drag to pan', touch: 'One finger to orbit · Two to zoom or pan',
    reset: 'Reset camera', rebuild: 'Rebuild', zoomIn: 'Zoom in', zoomOut: 'Zoom out',
    dropHint: 'Choose a prop and click the set to drop it.', descending: 'Prop descending', structures: 'Intact sets', fragments: 'Fragments', tools: 'Cinematic props',
    damaged: 'Damaged', collapsing: 'Collapsing', ruined: 'Ruins', parachuting: 'Characters are parachuting', landed: 'Landed',
    canister: 'Flash Canister', crate: 'Pyro Crate', core: 'Firecloud Core', ready: 'Ready', seconds: 's', cooldown: 'Cooling down', rebuilt: 'Sets rebuilt',
    loadingCampus: 'Loading the SUSTech campus', loadingSandbox: 'Building the film set', launchBusy: 'Drop in progress. Try again shortly.',
    graphicsError: 'WebGL 2 could not start. Enable hardware acceleration and try again.',
    sceneError: 'The scene could not load. Please try again.', contextLost: 'The graphics connection was interrupted. Please try again.', retry: 'Retry',
    scene: 'Interactive 3D scene', north: 'N', east: 'E', south: 'S', west: 'W',
  },
} as const

export type TranslationKey = keyof typeof translations['en-US']
export const qualityOrder: Quality[] = ['low', 'medium', 'high']

export function translated(value: Localized, language: Language) { return value[language === 'zh-CN' ? 0 : 1] }

export function readPreference(key: string) {
  try { return localStorage.getItem(`sustech-3d:${key}`) }
  catch { return null }
}

export function savePreference(key: string, value: string) {
  try { localStorage.setItem(`sustech-3d:${key}`, value) }
  catch { /* The scene remains usable with storage disabled. */ }
}
