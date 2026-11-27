import * as T from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { AudioEngine } from './audio'
import { icon } from './icons'
import { type TranslationKey, qualityOrder, readPreference, savePreference, translations } from './i18n'
import { createLandmarkControls } from './landmark-ui'
import { shell } from './ui'
import type { CameraPose, CampusWorld, Language, Quality } from './world'
import './style.css'

const element = <E extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id)! as E
element('app').innerHTML = shell
const canvas = element<HTMLCanvasElement>('scene')
const viewport = element('viewport')
const status = element('scene-status')
const compassNeedle = element('needle')
const qualitySelect = element<HTMLSelectElement>('quality')
const compact = matchMedia('(max-width: 790px)')
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)')
const coarsePointer = matchMedia('(pointer: coarse)')
const savedQuality = readPreference('quality') as Quality | null
let quality: Quality = savedQuality && qualityOrder.includes(savedQuality) ? savedQuality : coarsePointer.matches ? 'medium' : 'high'
let language: Language = readPreference('language') === 'en-US' ? 'en-US' : 'zh-CN'
let sound = AudioEngine.supported && readPreference('sound') !== 'off'
let campus: CampusWorld | undefined
let renderer: T.WebGLRenderer | undefined
let controls: OrbitControls | undefined
let loading = false
let contextLost = false
let disposed = false
let statusKey: TranslationKey | undefined = 'loadingCampus'
let toastKey: TranslationKey | undefined
let toastHandle = 0
let frameId = 0
let pixelRatioScale = 1
let lastFrame = 0
let lastCompass = 0
let lowWindows = 0
let frameSum = 0
let frameCount = 0
let animation: { position: T.Vector3, target: T.Vector3, endPosition: T.Vector3, endTarget: T.Vector3, start: number } | undefined
const audio = new AudioEngine(sound)
const landmarks = createLandmarkControls(viewport, (pose) => {
  if (!campus || contextLost) return
  audio.play('select')
  moveCamera(pose)
})
const ray = new T.Raycaster()
const ndc = new T.Vector2()
const scene = new T.Scene()
const camera = new T.PerspectiveCamera(38, 1, .24, 800)
const hemisphere = new T.HemisphereLight('#e3fcf1', '#73674c', 2.15)
const sun = new T.DirectionalLight('#fff0d8', 2.8)
sun.position.set(-83, 131, 67)
sun.shadow.camera.near = 1
sun.shadow.camera.far = 415
sun.shadow.camera.left = sun.shadow.camera.bottom = -148
sun.shadow.camera.right = sun.shadow.camera.top = 148
sun.shadow.camera.updateProjectionMatrix()
sun.shadow.bias = -.00038
sun.shadow.normalBias = .046
sun.shadow.radius = 2
scene.add(hemisphere, sun)

const fullDoc = document as Document & { webkitFullscreenElement?: Element, webkitExitFullscreen?: () => Promise<void> | void }
const fullRoot = document.documentElement as HTMLElement & { webkitRequestFullscreen?: () => Promise<void> | void }
const fullscreen = () => Boolean(document.fullscreenElement || fullDoc.webkitFullscreenElement)
const text = (key: TranslationKey) => translations[language][key]

function accessible(control: HTMLElement, label: string) {
  control.title = label
  control.setAttribute('aria-label', label)
}

function showStatus(key?: TranslationKey, error = false) {
  statusKey = key
  element('status-message').textContent = key ? text(key) : ''
  status.hidden = !key
  element('retry').hidden = !error
  viewport.setAttribute('aria-busy', key && !error ? 'true' : 'false')
}

function showToast(key: TranslationKey) {
  toastKey = key
  const toast = element('toast')
  toast.textContent = text(key)
  toast.hidden = false
  window.clearTimeout(toastHandle)
  toastHandle = window.setTimeout(() => { toast.hidden = true; toastKey = undefined }, 1450)
}

function updateActions() {
  const soundButton = element<HTMLButtonElement>('sound')
  soundButton.innerHTML = icon(sound ? 'volume' : 'mute', 17)
  soundButton.disabled = !AudioEngine.supported
  soundButton.setAttribute('aria-pressed', `${sound}`)
  accessible(soundButton, text(!AudioEngine.supported ? 'soundUnavailable' : sound ? 'soundOn' : 'soundOff'))
  const fullButton = element<HTMLButtonElement>('fullscreen')
  fullButton.innerHTML = icon(fullscreen() ? 'minimize' : 'fullscreen', 18)
  accessible(fullButton, text(fullscreen() ? 'exitFullscreen' : 'fullscreen'))
  accessible(element('language'), text('language'))
  element('language-short').textContent = language === 'zh-CN' ? 'EN' : '简体'
}

function renderMetrics() {
  if (!campus) return
  element('buildings').textContent = campus.buildings.toLocaleString(language)
  element('elevation').textContent = `${campus.elevationRange.toLocaleString(language)} ${text('meters')}`
}

function applyLanguage() {
  document.documentElement.lang = language
  document.title = text('title')
  for (const node of document.querySelectorAll<HTMLElement>('[data-text]')) node.textContent = text(node.dataset.text as TranslationKey)
  for (const node of document.querySelectorAll<HTMLElement>('[data-title]')) node.title = text(node.dataset.title as TranslationKey)
  for (const node of document.querySelectorAll<HTMLElement>('[data-label]')) node.setAttribute('aria-label', text(node.dataset.label as TranslationKey))
  if (statusKey) element('status-message').textContent = text(statusKey)
  if (toastKey) element('toast').textContent = text(toastKey)
  updateActions()
  landmarks.setLanguage(language)
  renderMetrics()
}

function resize() {
  if (!renderer) return
  const width = viewport.clientWidth
  const height = viewport.clientHeight
  if (!width || !height) return
  const limit = quality === 'low' ? .92 : quality === 'medium' ? 1.23 : 1.62
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, limit) * pixelRatioScale)
  renderer.setSize(width, height, false)
  camera.aspect = width / height
  camera.zoom = Math.min(1, camera.aspect / 1.12)
  if (compact.matches) camera.clearViewOffset()
  else camera.setViewOffset(width, height, -Math.min(width * .08, 108), Math.round(height * .027), width, height)
  camera.updateProjectionMatrix()
}

function applyQuality() {
  qualitySelect.value = quality
  if (!renderer) return
  const shadowSize = quality === 'high' ? 2048 : 1024
  if (sun.shadow.mapSize.width !== shadowSize) {
    sun.shadow.map?.dispose()
    sun.shadow.map = null
    sun.shadow.mapSize.set(shadowSize, shadowSize)
  }
  sun.castShadow = quality !== 'low'
  renderer.shadowMap.enabled = quality !== 'low'
  renderer.shadowMap.needsUpdate = true
  campus?.setQuality(quality)
  pixelRatioScale = 1
  frameSum = frameCount = lowWindows = 0
  resize()
}

function moveCamera(pose: CameraPose, snap = false) {
  if (!controls) return
  const endPosition = new T.Vector3(...pose.position)
  const endTarget = new T.Vector3(...pose.target)
  const position = camera.position.clone()
  const target = controls.target.clone()
  controls.enableDamping = false
  controls.update()
  controls.enableDamping = true
  if (snap || reducedMotion.matches) {
    animation = undefined
    controls.target.copy(endTarget)
    camera.position.copy(endPosition)
    controls.update()
  } else {
    animation = { position, target, endPosition, endTarget, start: performance.now() }
  }
}

async function loadCampus() {
  if (!renderer || !controls || campus || loading || disposed || contextLost) return
  loading = true
  showStatus('loadingCampus')
  try {
    const { createCampus } = await import('./campus')
    if (disposed || contextLost) return
    campus = createCampus()
    scene.add(campus.root)
    controls.minDistance = campus.minDistance
    controls.maxDistance = campus.maxDistance
    landmarks.attach(campus)
    moveCamera(campus.home, true)
    applyQuality()
    renderMetrics()
    showStatus()
  } catch (error) {
    console.error('Campus initialization failed', error)
    if (campus) {
      scene.remove(campus.root)
      campus.dispose()
      campus = undefined
      landmarks.attach()
    }
    showStatus('sceneError', true)
  } finally { loading = false }
}

function tap(x: number, y: number) {
  if (!campus || contextLost) return
  const rect = canvas.getBoundingClientRect()
  ndc.set((x - rect.left) / rect.width * 2 - 1, -(y - rect.top) / rect.height * 2 + 1)
  ray.setFromCamera(ndc, camera)
  const landmark = campus.pick(ray)
  if (landmark) landmarks.choose(landmark)
}

function dolly(factor: number) {
  if (!controls || !campus) return
  animation = undefined
  const length = T.MathUtils.clamp(controls.getDistance() * factor, controls.minDistance, controls.maxDistance)
  camera.position.sub(controls.target).setLength(length).add(controls.target)
  controls.update()
}

const activePointers = new Set<number>()
let press: { x: number, y: number, id: number } | undefined
canvas.addEventListener('pointerdown', (event) => {
  activePointers.add(event.pointerId)
  if (activePointers.size === 1 && event.button === 0) press = { x: event.clientX, y: event.clientY, id: event.pointerId }
  else press = undefined
})
canvas.addEventListener('pointermove', (event) => {
  if (press && Math.hypot(event.clientX - press.x, event.clientY - press.y) > 6) press = undefined
})
canvas.addEventListener('pointerup', (event) => {
  activePointers.delete(event.pointerId)
  if (press?.id === event.pointerId && Math.hypot(event.clientX - press.x, event.clientY - press.y) <= 6) tap(event.clientX, event.clientY)
  press = undefined
})
canvas.addEventListener('pointercancel', (event) => { activePointers.delete(event.pointerId); press = undefined })
canvas.addEventListener('contextmenu', (event) => event.preventDefault())
canvas.addEventListener('webglcontextlost', (event) => { event.preventDefault(); contextLost = true; showStatus('contextLost', true) })

element('language').addEventListener('click', () => {
  language = language === 'zh-CN' ? 'en-US' : 'zh-CN'
  savePreference('language', language)
  audio.play('click')
  applyLanguage()
})
element('sound').addEventListener('click', () => {
  sound = !sound
  audio.setEnabled(sound)
  savePreference('sound', sound ? 'on' : 'off')
  updateActions()
})
qualitySelect.addEventListener('change', () => {
  quality = qualitySelect.value as Quality
  savePreference('quality', quality)
  applyQuality()
  audio.play('click')
})
element('fullscreen').addEventListener('click', async () => {
  audio.play('click')
  try {
    if (document.fullscreenElement) await document.exitFullscreen()
    else if (fullDoc.webkitFullscreenElement) await fullDoc.webkitExitFullscreen?.()
    else if (typeof fullRoot.requestFullscreen === 'function' && document.fullscreenEnabled) await fullRoot.requestFullscreen()
    else if (fullRoot.webkitRequestFullscreen) await fullRoot.webkitRequestFullscreen()
    else showToast('fullscreenError')
  } catch { showToast('fullscreenError') }
})
function handleFullscreenChange() { updateActions(); resize() }
document.addEventListener('fullscreenchange', handleFullscreenChange)
document.addEventListener('webkitfullscreenchange', handleFullscreenChange)
element('zoom-in').addEventListener('click', () => dolly(.78))
element('zoom-out').addEventListener('click', () => dolly(1.28))
element('reset').addEventListener('click', () => {
  if (!campus) return
  landmarks.choose()
  moveCamera(campus.home)
  audio.play('click')
})
element('overview').addEventListener('click', () => {
  if (!campus) return
  landmarks.choose()
  moveCamera(campus.overview)
  audio.play('click')
})
element('retry').addEventListener('click', () => {
  if (!renderer || contextLost) location.reload()
  else void loadCampus()
})
window.addEventListener('pointerdown', () => audio.unlock(), { capture: true, passive: true })
window.addEventListener('keydown', () => audio.unlock(), { capture: true, passive: true })

function frame(now: number) {
  frameId = requestAnimationFrame(frame)
  if (!renderer || !controls || contextLost) return
  const wallTime = lastFrame ? (now - lastFrame) / 1000 : 1 / 60
  const dt = Math.min(.065, wallTime)
  lastFrame = now
  if (animation) {
    const p = Math.min(1, (now - animation.start) / 575)
    const smooth = p * p * (3 - 2 * p)
    camera.position.lerpVectors(animation.position, animation.endPosition, smooth)
    controls.target.lerpVectors(animation.target, animation.endTarget, smooth)
    if (p === 1) animation = undefined
  }
  controls.update()
  camera.updateMatrixWorld()
  if (campus) {
    campus.update(dt, controls.target)
    landmarks.project(camera, controls.getDistance() < 55, compact.matches)
  }
  if (now - lastCompass > 76) {
    lastCompass = now
    compassNeedle.style.transform = `rotate(${-Math.round(T.MathUtils.radToDeg(controls.getAzimuthalAngle()))}deg)`
  }
  renderer.render(scene, camera)
  if (campus && wallTime < 1 && !document.hidden) {
    frameSum += wallTime
    frameCount++
    if (frameSum > 2.2) {
      lowWindows = frameCount / frameSum < 32 ? lowWindows + 1 : 0
      frameSum = frameCount = 0
      if (lowWindows >= 2 && pixelRatioScale > .62) {
        pixelRatioScale = Math.max(.62, pixelRatioScale - .12)
        lowWindows = 0
        resize()
      }
    }
  }
}

qualitySelect.value = quality
applyLanguage()
try {
  renderer = new T.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'high-performance' })
  renderer.outputColorSpace = T.SRGBColorSpace
  renderer.toneMapping = T.ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.08
  renderer.shadowMap.type = T.PCFShadowMap
  renderer.shadowMap.autoUpdate = false
  controls = new OrbitControls(camera, canvas)
  controls.enableDamping = true
  controls.dampingFactor = .12
  controls.maxPolarAngle = Math.PI * .473
  controls.minPolarAngle = .001
  controls.rotateSpeed = .75
  controls.zoomSpeed = .91
  controls.panSpeed = .78
  controls.addEventListener('start', () => { animation = undefined })
  new ResizeObserver(resize).observe(viewport)
  resize()
  frameId = requestAnimationFrame(frame)
  void loadCampus()
} catch (error) {
  console.error('WebGL initialization failed', error)
  showStatus('graphicsError', true)
}

window.addEventListener('pagehide', (event) => {
  if (event.persisted) return
  disposed = true
  cancelAnimationFrame(frameId)
  campus?.dispose()
  controls?.dispose()
  renderer?.dispose()
  audio.dispose()
})

// Browser acceptance tests read state while driving the regular controls.
if (new URLSearchParams(location.search).has('qa')) {
  Object.assign(window, { readCampusState: () => ({
    ready: !!campus, language, quality, sound, buildings: campus?.buildings, elevationRange: campus?.elevationRange,
    camera: camera.position.toArray(), target: controls?.target.toArray(), calls: renderer?.info.render.calls,
  }) })
}
