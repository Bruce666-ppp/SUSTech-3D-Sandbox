import * as T from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { AudioEngine } from './audio'
import { icon } from './icons'
import { type TranslationKey, qualityOrder, readPreference, savePreference, translations } from './i18n'
import { createLandmarkControls } from './landmark-ui'
import { shell } from './ui'
import { toolOrder, tools, type CameraPose, type CampusWorld, type Language, type Mode, type Playground, type Quality, type Tool } from './world'
import './style.css'

const element = <E extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id)! as E
element('app').innerHTML = shell
const canvas = element<HTMLCanvasElement>('scene')
const viewport = element('viewport')
const status = element('scene-status')
const qualitySelect = element<HTMLSelectElement>('quality')
const compact = matchMedia('(max-width: 790px)')
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)')
const coarsePointer = matchMedia('(pointer: coarse)')
const savedQuality = readPreference('quality') as Quality | null
let quality: Quality = savedQuality && qualityOrder.includes(savedQuality) ? savedQuality : coarsePointer.matches ? 'medium' : 'high'
let language: Language = readPreference('language') === 'en-US' ? 'en-US' : 'zh-CN'
let sound = AudioEngine.supported && readPreference('sound') !== 'off'
let selected: Tool = 'canister'
const modeFromUrl = (): Mode => location.hash === '#sandbox' ? 'sandbox' : 'campus'
let mode = modeFromUrl()
let view: { kind: 'campus', model: CampusWorld } | { kind: 'sandbox', model: Playground } | undefined
let transition = 0
let renderer: T.WebGLRenderer | undefined
let controls: OrbitControls | undefined
let loading = false
let contextLost = false
let disposed = false
let statusKey: TranslationKey | undefined = mode === 'campus' ? 'loadingCampus' : 'loadingSandbox'
let toastKey: TranslationKey | undefined
let toastHandle = 0
let frameId = 0
let pointScale = 560
let pixelRatioScale = 1
let lastFrame = 0
let lastUi = 0
let lastShadow = 0
let lastHover = 0
let lowWindows = 0
let frameSum = 0
let frameCount = 0
let hover: { x: number, y: number } | undefined
let animation: { position: T.Vector3, target: T.Vector3, endPosition: T.Vector3, endTarget: T.Vector3, start: number } | undefined
const audio = new AudioEngine(sound)
const readyAt: Record<Tool, number> = { canister: 0, crate: 0, core: 0 }
const landmarks = createLandmarkControls(viewport, (pose) => {
  if (view?.kind !== 'campus' || contextLost) return
  audio.play('select')
  moveCamera(pose)
})
const toolButtons = toolOrder.map((tool) => {
  const button = element<HTMLButtonElement>(`tool-${tool}`)
  return { tool, button, label: button.querySelector('.tool-time')! }
})
const ray = new T.Raycaster()
const ndc = new T.Vector2()
const temporary = new T.Vector3()
const scene = new T.Scene()
const camera = new T.PerspectiveCamera(38, 1, .24, 800)
const hemisphere = new T.HemisphereLight('#e3fcf1', '#73674c', 2.15)
const sun = new T.DirectionalLight('#fff0d8', 2.8)
sun.position.set(-83, 131, 67)
sun.shadow.camera.near = 1
sun.shadow.camera.far = 325
sun.shadow.camera.left = sun.shadow.camera.bottom = -98
sun.shadow.camera.right = sun.shadow.camera.top = 98
sun.shadow.bias = -.00038
sun.shadow.normalBias = .046
sun.shadow.radius = 2
scene.add(hemisphere, sun)

const fullDoc = document as Document & { webkitFullscreenElement?: Element, webkitExitFullscreen?: () => Promise<void> | void }
const fullRoot = document.documentElement as HTMLElement & { webkitRequestFullscreen?: () => Promise<void> | void }
const fullscreen = () => Boolean(document.fullscreenElement || fullDoc.webkitFullscreenElement)
const t = (key: TranslationKey) => translations[language][key]

function accessible(control: HTMLElement, label: string) {
  control.title = label
  control.setAttribute('aria-label', label)
}

function showStatus(key?: TranslationKey, error = false) {
  statusKey = key
  element('status-message').textContent = key ? t(key) : ''
  status.hidden = !key
  element('retry').hidden = !error
  viewport.setAttribute('aria-busy', key && !error ? 'true' : 'false')
}

function showToast(key: TranslationKey) {
  toastKey = key
  const toast = element('toast')
  toast.textContent = t(key)
  toast.hidden = false
  window.clearTimeout(toastHandle)
  toastHandle = window.setTimeout(() => { toast.hidden = true; toastKey = undefined }, 1450)
}

function updateActions() {
  const soundButton = element<HTMLButtonElement>('sound')
  soundButton.innerHTML = icon(sound ? 'volume' : 'mute', 17)
  soundButton.disabled = !AudioEngine.supported
  soundButton.setAttribute('aria-pressed', `${sound}`)
  accessible(soundButton, t(!AudioEngine.supported ? 'soundUnavailable' : sound ? 'soundOn' : 'soundOff'))
  const fullButton = element('fullscreen')
  fullButton.innerHTML = icon(fullscreen() ? 'minimize' : 'fullscreen', 18)
  accessible(fullButton, t(fullscreen() ? 'exitFullscreen' : 'fullscreen'))
  accessible(element('language'), t('language'))
  element('language-short').textContent = language === 'zh-CN' ? 'EN' : '简体'
}

function updateTools(now: number) {
  for (const { tool, button, label } of toolButtons) {
    const remaining = Math.max(0, readyAt[tool] - now)
    const duration = tools[tool].seconds
    const time = `${remaining ? Math.ceil(remaining / 100) / 10 : duration} ${t('seconds')}`
    const message = remaining ? time : `${t('ready')} · ${time}`
    if (label.textContent !== message) label.textContent = message
    button.classList.toggle('is-cooling', remaining > 0)
    button.setAttribute('aria-pressed', `${selected === tool}`)
    button.style.setProperty('--progress', `${1 - remaining / (duration * 1000)}`)
    button.setAttribute('aria-label', `${t(tool)} · ${'★'.repeat(tools[tool].stars)} · ${remaining ? `${t('cooldown')} ${time}` : message}`)
  }
}

function renderMetrics() {
  if (view?.kind !== 'sandbox') return
  const stats = view.model.stats()
  element('structures').textContent = `${stats.intact} / ${stats.total}`
  element('fragments').textContent = `${stats.fragments}`
  for (const key of ['damaged', 'collapsing', 'ruined'] as const) element(key).textContent = String(stats[key])
  const landings = element('landing-count')
  landings.hidden = stats.landed === 0
  element('landed').textContent = String(stats.landed)
  element('set-states').hidden = stats.intact === stats.total
  const hint = element('drop-hint')
  const copy = t(stats.pending ? 'descending' : stats.parachuting ? 'parachuting' : 'dropHint')
  if (hint.textContent !== copy) hint.textContent = copy
  hint.classList.toggle('is-active', stats.pending + stats.parachuting > 0)
}

function renderCampusMetrics() {
  if (view?.kind !== 'campus') return
  element('buildings').textContent = view.model.buildings.toLocaleString(language)
  element('elevation').textContent = `${view.model.elevationRange.toLocaleString(language)} ${t('meters')}`
}

function applyLanguage() {
  document.documentElement.lang = language
  document.title = t('title')
  for (const node of document.querySelectorAll<HTMLElement>('[data-text]')) node.textContent = t(node.dataset.text as TranslationKey)
  for (const node of document.querySelectorAll<HTMLElement>('[data-title]')) node.title = t(node.dataset.title as TranslationKey)
  for (const node of document.querySelectorAll<HTMLElement>('[data-label]')) node.setAttribute('aria-label', t(node.dataset.label as TranslationKey))
  if (statusKey) element('status-message').textContent = t(statusKey)
  if (toastKey) element('toast').textContent = t(toastKey)
  updateActions()
  updateTools(performance.now())
  landmarks.setLanguage(language)
  renderCampusMetrics()
  renderMetrics()
}

function resize() {
  if (!renderer) return
  const width = viewport.clientWidth
  const height = viewport.clientHeight
  if (!width || !height) return
  const limit = quality === 'low' ? .92 : quality === 'medium' ? 1.23 : 1.62
  const ratio = Math.min(window.devicePixelRatio || 1, limit) * pixelRatioScale
  renderer.setPixelRatio(ratio)
  renderer.setSize(width, height, false)
  pointScale = height * ratio * .75
  camera.aspect = width / height
  camera.zoom = Math.min(1, camera.aspect / (mode === 'campus' ? 1.12 : 1.04))
  if (compact.matches) camera.clearViewOffset()
  else if (mode === 'campus') camera.setViewOffset(width, height, -Math.min(width * .08, 108), Math.round(height * .027), width, height)
  else camera.setViewOffset(width, height, -Math.min(width * .055, 76), Math.round(height * .015), width, height)
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
  view?.model.setQuality(quality)
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

function bindMode() {
  document.body.dataset.mode = mode
  element('campus-tab').setAttribute('aria-pressed', `${mode === 'campus'}`)
  element('sandbox-tab').setAttribute('aria-pressed', `${mode === 'sandbox'}`)
}

function disposeView() {
  if (!view) return
  scene.remove(view.model.root)
  view.model.dispose()
  view = undefined
  renderer?.renderLists.dispose()
  landmarks.attach()
}

async function switchMode(next: Mode, retry = false) {
  if (!renderer || !controls || disposed || contextLost || (!retry && next === mode && (view || loading))) return
  const revision = ++transition
  loading = true
  mode = next
  bindMode()
  disposeView()
  animation = hover = undefined
  audio.clear()
  window.clearTimeout(toastHandle)
  element('toast').hidden = true
  toastKey = undefined
  showStatus(mode === 'campus' ? 'loadingCampus' : 'loadingSandbox')
  try {
    const created = next === 'campus'
      ? { kind: 'campus' as const, model: (await import('./campus')).createCampus() }
      : { kind: 'sandbox' as const, model: await (await import('./playground')).createPlayground(audio) }
    if (revision !== transition || disposed || contextLost) { created.model.dispose(); return }
    view = created
    scene.add(created.model.root)
    controls.minDistance = created.model.minDistance
    controls.maxDistance = created.model.maxDistance
    const daylight = created.kind === 'campus'
    const extent = daylight ? 148 : 88
    sun.shadow.camera.left = sun.shadow.camera.bottom = -extent
    sun.shadow.camera.right = sun.shadow.camera.top = extent
    sun.shadow.camera.far = daylight ? 415 : 325
    sun.shadow.camera.updateProjectionMatrix()
    sun.color.set(daylight ? '#fff0d8' : '#ffe3cb')
    hemisphere.groundColor.set(daylight ? '#73674c' : '#68534d')
    if (created.kind === 'campus') landmarks.attach(created.model)
    else resetTools()
    moveCamera(created.model.home, true)
    applyQuality()
    renderCampusMetrics()
    renderMetrics()
    showStatus()
  } catch (error) {
    if (revision !== transition || disposed || contextLost) return
    console.error('Scene initialization failed', error)
    showStatus('sceneError', true)
  } finally { if (revision === transition) loading = false }
}

function sceneRay(x: number, y: number) {
  const rect = canvas.getBoundingClientRect()
  ndc.set((x - rect.left) / rect.width * 2 - 1, -(y - rect.top) / rect.height * 2 + 1)
  ray.setFromCamera(ndc, camera)
  return ray
}

function tap(x: number, y: number) {
  if (!view || contextLost) return
  const cursor = sceneRay(x, y)
  if (view.kind === 'campus') {
    const landmark = view.model.pick(cursor)
    if (landmark) landmarks.choose(landmark)
    return
  }
  const now = performance.now()
  const ready = readyAt[selected] <= now
  const target = view.model.aim(cursor, selected, ready, true)
  if (!target) return
  if (!ready) { showToast('cooldown'); return }
  audio.unlock()
  if (!view.model.drop(selected, target, camera)) { showToast('launchBusy'); return }
  readyAt[selected] = now + tools[selected].seconds * 1000
  updateTools(now)
  renderMetrics()
}

function selectTool(tool: Tool) {
  if (view?.kind !== 'sandbox') return
  selected = tool
  audio.play('select')
  updateTools(performance.now())
}

function resetTools() {
  for (const tool of toolOrder) readyAt[tool] = 0
  selected = 'canister'
  updateTools(performance.now())
}

function dolly(factor: number) {
  if (!controls || !view) return
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
  if (event.pointerType === 'mouse') hover = { x: event.clientX, y: event.clientY }
  if (press && Math.hypot(event.clientX - press.x, event.clientY - press.y) > 6) press = undefined
})
canvas.addEventListener('pointerup', (event) => {
  activePointers.delete(event.pointerId)
  if (press?.id === event.pointerId && Math.hypot(event.clientX - press.x, event.clientY - press.y) <= 6) tap(event.clientX, event.clientY)
  press = undefined
})
canvas.addEventListener('pointercancel', (event) => { activePointers.delete(event.pointerId); press = undefined })
canvas.addEventListener('pointerleave', () => {
  hover = undefined
  if (view?.kind === 'sandbox') view.model.aim(undefined, selected, false)
})
canvas.addEventListener('contextmenu', (event) => event.preventDefault())
canvas.addEventListener('webglcontextlost', (event) => { event.preventDefault(); contextLost = true; showStatus('contextLost', true) })

for (const name of ['campus', 'sandbox'] as const) {
  element(`${name}-tab`).addEventListener('click', () => {
    if (mode === name) return
    location.hash = name
    void switchMode(name)
  })
}
window.addEventListener('hashchange', () => { void switchMode(modeFromUrl()) })

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
  if (!view) return
  if (view.kind === 'campus') landmarks.choose()
  moveCamera(view.model.home)
  audio.play('click')
})
element('overview').addEventListener('click', () => {
  if (view?.kind !== 'campus') return
  landmarks.choose()
  moveCamera(view.model.overview)
  audio.play('click')
})
element('rebuild').addEventListener('click', () => {
  if (view?.kind !== 'sandbox' || contextLost) return
  view.model.rebuild()
  audio.clear()
  audio.play('rebuild')
  resetTools()
  renderMetrics()
  if (renderer) renderer.shadowMap.needsUpdate = true
  showToast('rebuilt')
})
element('retry').addEventListener('click', () => {
  if (!renderer || contextLost) location.reload()
  else void switchMode(mode, true)
})
for (const { tool, button } of toolButtons) button.addEventListener('click', () => selectTool(tool))
window.addEventListener('keydown', (event) => {
  if (event.repeat || event.altKey || event.ctrlKey || event.metaKey || event.target instanceof HTMLSelectElement) return
  const tool = toolOrder[Number(event.key) - 1]
  if (tool) selectTool(tool)
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
  const sandbox = view?.kind === 'sandbox' ? view.model : undefined
  const shake = sandbox?.update(dt, pointScale) ?? 0
  if (view?.kind === 'campus') {
    view.model.update(dt, controls.target)
    landmarks.project(camera, controls.getDistance() < 55, compact.matches)
  }
  if (sandbox && hover && !activePointers.size && now - lastHover > 48) {
    lastHover = now
    sandbox.aim(sceneRay(hover.x, hover.y), selected, readyAt[selected] <= now)
  }
  if (now - lastUi > 76) {
    lastUi = now
    element('needle').style.transform = `rotate(${-Math.round(T.MathUtils.radToDeg(controls.getAzimuthalAngle()))}deg)`
    if (sandbox) { updateTools(now); renderMetrics() }
  }
  if (sandbox?.shadowsMoving() && renderer.shadowMap.enabled && now - lastShadow > 54) {
    lastShadow = now
    renderer.shadowMap.needsUpdate = true
  }
  const amount = reducedMotion.matches ? 0 : shake
  temporary.set(Math.sin(now * .058) * amount, Math.cos(now * .078) * amount * .53, Math.sin(now * .039) * amount * .4)
  camera.position.add(temporary)
  renderer.render(scene, camera)
  camera.position.sub(temporary)
  camera.updateMatrixWorld()

  if (view && wallTime < 1 && !document.hidden) {
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
bindMode()
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
  void switchMode(mode)
} catch (error) {
  console.error('WebGL initialization failed', error)
  showStatus('graphicsError', true)
}

window.addEventListener('pagehide', (event) => {
  if (event.persisted) return
  disposed = true
  cancelAnimationFrame(frameId)
  disposeView()
  controls?.dispose()
  renderer?.dispose()
  audio.dispose()
})

// Browser acceptance tests read state while driving the regular player controls.
if (new URLSearchParams(location.search).has('qa')) {
  Object.assign(window, { readSandboxState: () => {
    const rect = canvas.getBoundingClientRect()
    const projected = (at?: T.Vector3) => {
      const p = at?.clone().project(camera)
      return p ? [rect.left + (p.x + 1) * rect.width / 2, rect.top + (1 - p.y) * rect.height / 2] : undefined
    }
    const sandbox = view?.kind === 'sandbox' ? view.model : undefined
    const campus = view?.kind === 'campus' ? view.model : undefined
    const game = sandbox?.inspect()
    return {
      ready: !!view, mode: view?.kind, selected: sandbox ? selected : undefined, language, quality, sound,
      buildings: campus?.buildings, elevationRange: campus?.elevationRange, stats: sandbox?.stats(), readyAt: sandbox ? { ...readyAt } : undefined,
      camera: camera.position.toArray(), target: controls?.target.toArray(),
      structureScreen: projected(game?.structureTarget), edgeScreen: projected(game?.edgeTarget), terrainScreen: projected(game?.terrainTarget),
      structureStages: game?.structureStages, roofDrop: game?.roofDrop,
      drops: game?.drops, tilt: game?.tilt, offset: game?.offset, groundOffset: game?.groundOffset, lastImpact: game?.lastImpact,
      openParachutes: game?.openParachutes, landingsClear: game?.landingsClear,
      memory: { ...renderer?.info.memory }, calls: renderer?.info.render.calls,
    }
  } })
}
