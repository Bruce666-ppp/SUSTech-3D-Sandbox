import * as T from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { AudioEngine } from './audio'
import { icon } from './icons'
import { type TranslationKey, qualityOrder, readPreference, savePreference, toolOrder, tools, translated, translations } from './i18n'
import { shell } from './ui'
import type { CameraPose, CampusWorld, Landmark, Language, Mode, Quality, SandboxWorld, Tool, World } from './world'
import './style.css'

const element = <E extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id)! as E
element('app').innerHTML = shell
const canvas = element<HTMLCanvasElement>('scene')
const viewport = element('viewport')
const status = element('scene-status')
const landmarkList = element('landmark-list')
const landmarkInfo = element('landmark-info')
const labels = element('map-labels')
const qualitySelect = element<HTMLSelectElement>('quality')
const coarsePointer = matchMedia('(pointer: coarse)')
const compact = matchMedia('(max-width: 790px)')
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)')
const savedQuality = readPreference('quality') as Quality | null
let quality: Quality = savedQuality && qualityOrder.includes(savedQuality) ? savedQuality : coarsePointer.matches ? 'medium' : 'high'
let language: Language = readPreference('language') === 'en-US' ? 'en-US' : 'zh-CN'
let sound = AudioEngine.supported && readPreference('sound') !== 'off'
const audio = new AudioEngine(sound)
let mode: Mode = 'campus'
let activeMode: Mode | undefined
let tool: Tool = 'grenade'
let activeLandmark: string | undefined
let world: World | undefined
let transitionId = 0
let walking = false
let loadingKey: TranslationKey | undefined = 'loadingCampus'
let toastKey: TranslationKey | undefined
let toastHandle = 0
let pixelRatioScale = 1
let lastTick = 0
let lastUi = 0
let frameSum = 0
let frameCount = 0
let lowWindows = 0
let contextLost = false
let lastHover = 0
let lastShadow = 0
let hover: { x: number, y: number } | undefined
let animation: { position: T.Vector3, target: T.Vector3, endPosition: T.Vector3, endTarget: T.Vector3, start: number } | undefined
const readyAt: Record<Tool, number> = { grenade: 0, missile: 0, nuke: 0 }
const pins = new Map<string, HTMLButtonElement>()
const ray = new T.Raycaster()
const projection = new T.Vector3()
const temporary = new T.Vector3()
const ndc = new T.Vector2()
const scene = new T.Scene()
const camera = new T.PerspectiveCamera(38, 1, .24, 800)
const hemisphere = new T.HemisphereLight('#e3fcf1', '#73674c', 2.15)
const sun = new T.DirectionalLight('#fff0d8', 2.8)
sun.position.set(-89, 140, 77)
sun.shadow.camera.near = 1
sun.shadow.camera.far = 405
sun.shadow.camera.left = sun.shadow.camera.bottom = -147
sun.shadow.camera.right = sun.shadow.camera.top = 147
sun.shadow.bias = -.00035
sun.shadow.normalBias = .048
sun.shadow.radius = 2
scene.add(hemisphere, sun)

let renderer: T.WebGLRenderer | undefined
let controls: OrbitControls | undefined
const t = (key: TranslationKey) => translations[language][key]
const campus = () => activeMode === 'campus' ? world as CampusWorld : undefined
const sandbox = () => activeMode === 'sandbox' ? world as SandboxWorld : undefined

const fullscreenDocument = document as Document & {
  webkitFullscreenElement?: Element
  webkitExitFullscreen?: () => Promise<void> | void
}
const fullscreenRoot = document.documentElement as HTMLElement & { webkitRequestFullscreen?: () => Promise<void> | void }
const fullscreenActive = () => Boolean(document.fullscreenElement || fullscreenDocument.webkitFullscreenElement)

function accessible(button: HTMLElement, label: string) {
  button.title = label
  button.setAttribute('aria-label', label)
}

function showToast(key: TranslationKey) {
  toastKey = key
  const toast = element('toast')
  toast.textContent = t(key)
  toast.hidden = false
  window.clearTimeout(toastHandle)
  toastHandle = window.setTimeout(() => { toast.hidden = true; toastKey = undefined }, 1600)
}

function showStatus(key?: TranslationKey, error = false) {
  loadingKey = key
  element('status-message').textContent = key ? t(key) : ''
  status.hidden = !key
  element('retry').hidden = !error
  viewport.setAttribute('aria-busy', key && !error ? 'true' : 'false')
}

function updateActions() {
  const audioButton = element<HTMLButtonElement>('sound')
  audioButton.innerHTML = icon(sound ? 'volume' : 'mute', 17)
  audioButton.setAttribute('aria-pressed', `${sound}`)
  audioButton.disabled = !AudioEngine.supported
  accessible(audioButton, t(!AudioEngine.supported ? 'soundUnavailable' : sound ? 'soundOn' : 'soundOff'))
  const fullButton = element('fullscreen')
  fullButton.innerHTML = icon(fullscreenActive() ? 'minimize' : 'fullscreen', 18)
  accessible(fullButton, t(fullscreenActive() ? 'exitFullscreen' : 'fullscreen'))
  accessible(element('language'), t('language'))
  element('language-short').textContent = language === 'zh-CN' ? 'EN' : '简体'
}

function renderMetrics() {
  const currentCampus = campus()
  const currentSandbox = sandbox()
  if (currentCampus) {
    element('buildings').textContent = currentCampus.buildings.toLocaleString(language)
    element('elevation').replaceChildren(document.createTextNode(`${currentCampus.elevationRange}`), Object.assign(document.createElement('small'), { textContent: t('meters') }))
  }
  if (currentSandbox) {
    const stats = currentSandbox.stats()
    element('structures').textContent = `${stats.intact} / ${stats.total}`
    element('fragments').textContent = `${stats.fragments}`
  }
}

function buildLandmarks() {
  const current = campus()
  labels.replaceChildren()
  landmarkList.replaceChildren()
  pins.clear()
  if (!current) return
  for (const landmark of current.landmarks) {
    const item = document.createElement('button')
    item.type = 'button'
    item.className = 'landmark-item'
    item.dataset.landmark = landmark.id
    item.innerHTML = `${icon(landmark.icon, 16)}<span></span>`
    item.querySelector('span')!.textContent = translated(landmark.name, language)
    item.addEventListener('click', () => selectLandmark(landmark))
    landmarkList.append(item)

    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'map-pin'
    button.dataset.pin = landmark.id
    button.textContent = translated(landmark.name, language)
    button.title = button.textContent
    button.hidden = true
    button.addEventListener('click', () => selectLandmark(landmark))
    pins.set(landmark.id, button)
    labels.append(button)
  }
}

function updateLandmark() {
  const picked = campus()?.landmarks.find(({ id }) => id === activeLandmark)
  for (const button of landmarkList.querySelectorAll('button')) button.setAttribute('aria-pressed', `${button.dataset.landmark === activeLandmark}`)
  for (const [id, button] of pins) button.setAttribute('aria-pressed', `${id === activeLandmark}`)
  landmarkInfo.hidden = !picked
  if (!picked) return
  landmarkInfo.setAttribute('aria-label', t('details'))
  landmarkInfo.innerHTML = `<button type="button" class="detail-close" id="close-details">${icon('close', 14)}</button><h2></h2><span class="category"></span><p></p>`
  landmarkInfo.querySelector('h2')!.textContent = translated(picked.name, language)
  landmarkInfo.querySelector('.category')!.textContent = translated(picked.category, language)
  landmarkInfo.querySelector('p')!.textContent = translated(picked.description, language)
  if (picked.dimensions) {
    const specs = document.createElement('ul')
    specs.className = 'landmark-specs'
    specs.setAttribute('aria-label', t('dimensions'))
    for (const building of picked.dimensions.buildings) {
      const row = document.createElement('li')
      if (building.label) {
        const label = document.createElement('span')
        label.textContent = translated(building.label, language)
        row.append(label)
      }
      const value = document.createElement('strong')
      const height = building.heightMeters?.toLocaleString(language, { maximumFractionDigits: 1 })
      const floors = `${building.floors.toLocaleString(language)} ${t('floorUnit')}`
      value.textContent = height ? `${floors} · ${height} ${t('meters')}` : floors
      row.append(value)
      specs.append(row)
    }
    const source = document.createElement('a')
    source.className = 'landmark-source'
    source.href = picked.dimensions.source
    source.textContent = t('dimensionSource')
    source.target = '_blank'
    source.rel = 'noopener noreferrer'
    landmarkInfo.append(specs, source)
  }
  const close = element('close-details')
  accessible(close, t('close'))
  close.addEventListener('click', () => clearLandmark())
}

function applyLanguage() {
  document.documentElement.lang = language
  document.title = t('title')
  for (const node of document.querySelectorAll<HTMLElement>('[data-text]')) node.textContent = t(node.dataset.text as TranslationKey)
  for (const node of document.querySelectorAll<HTMLElement>('[data-title]')) node.title = t(node.dataset.title as TranslationKey)
  for (const node of document.querySelectorAll<HTMLElement>('[data-label]')) node.setAttribute('aria-label', t(node.dataset.label as TranslationKey))
  element('dem-credit').title = t('terrain')
  if (loadingKey) element('status-message').textContent = t(loadingKey)
  if (toastKey) element('toast').textContent = t(toastKey)
  updateActions()
  if (campus()) buildLandmarks()
  updateLandmark()
  renderMetrics()
  updateCooldowns(performance.now())
}

function updatePins() {
  const current = campus()
  if (!current || !controls || !pins.size) return
  const width = viewport.clientWidth
  const height = viewport.clientHeight
  const near = controls.getDistance() < 55
  const drawn: { x: number, y: number, right: number }[] = []
  const ordered = current.landmarks.slice().sort((a, b) => Number(b.id === activeLandmark) - Number(a.id === activeLandmark))
  for (const landmark of ordered) {
    const button = pins.get(landmark.id)!
    const selected = landmark.id === activeLandmark
    projection.copy(landmark.anchor).project(camera)
    const w = Math.min(164, (button.textContent?.length ?? 10) * (language === 'zh-CN' ? 11 : 5.9) + 23)
    const x = Math.round((projection.x + 1) * width / 2) - w / 2
    const y = Math.round((1 - projection.y) * height / 2) - 27
    const inView = x >= (compact.matches ? 6 : 305) && x + w < width - 12 && y > (compact.matches ? 142 : 13) && y < height - 54 && projection.z < 1
    const obstructed = drawn.some((label) => Math.abs(y - label.y) < 24 && x <= label.right + 6 && x + w >= label.x - 6)
    const visible = inView && (selected || (landmark.pin && !near && !obstructed))
    button.hidden = !visible
    if (visible) {
      button.style.transform = `translate3d(${x}px, ${y}px, 0)`
      drawn.push({ x, y, right: x + w })
    }
  }
}

function updateCooldowns(now: number) {
  const formatSeconds = (value: number) => `${value}${language === 'zh-CN' ? ' ' : ''}${language === 'zh-CN' ? '秒' : ' s'}`
  for (const key of toolOrder) {
    const button = element(`tool-${key}`)
    const remaining = Math.max(0, readyAt[key] - now)
    const cooling = remaining > 0
    const text = cooling ? formatSeconds(Math.ceil(remaining / 100) / 10) : `${t('ready')} · ${formatSeconds(tools[key].seconds)}`
    const timeLabel = button.querySelector('.tool-time')!
    if (timeLabel.textContent !== text) timeLabel.textContent = text
    button.classList.toggle('is-cooling', cooling)
    button.setAttribute('aria-pressed', `${tool === key}`)
    button.style.setProperty('--progress', `${1 - remaining / (tools[key].seconds * 1000)}`)
    button.setAttribute('aria-label', `${t(key)} · ${'★'.repeat(tools[key].stars)} · ${cooling ? `${t('cooldown')} ${text}` : text}`)
  }
}

function resize() {
  if (!renderer) return
  const width = viewport.clientWidth
  const height = viewport.clientHeight
  if (!width || !height) return
  const maximum = quality === 'low' ? .90 : quality === 'medium' ? 1.23 : 1.62
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, maximum) * pixelRatioScale)
  renderer.setSize(width, height, false)
  camera.aspect = width / height
  camera.zoom = Math.min(1, camera.aspect / 1.12)
  if (compact.matches) camera.clearViewOffset()
  else camera.setViewOffset(width, height, -Math.min(width * .08, 108), Math.round(height * .027), width, height)
  camera.updateProjectionMatrix()
}

function applyQuality(resetResolution = false) {
  if (resetResolution) pixelRatioScale = 1
  frameSum = frameCount = lowWindows = 0
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
  world?.setQuality(quality)
  resize()
}

function cameraPose(pose: CameraPose, snap = false) {
  if (!controls) return
  const endPosition = new T.Vector3(...pose.position)
  const endTarget = new T.Vector3(...pose.target)
  if (snap || reducedMotion.matches) {
    animation = undefined
    controls.target.copy(endTarget)
    camera.position.copy(endPosition)
    controls.update()
  } else {
    animation = { position: camera.position.clone(), target: controls.target.clone(), endPosition, endTarget, start: performance.now() }
  }
}

function clearLandmark() {
  activeLandmark = undefined
  campus()?.select()
  updateLandmark()
}

function selectLandmark(landmark: Landmark) {
  if (!campus() || walking) return
  audio.play('select')
  activeLandmark = landmark.id
  campus()?.select(landmark.id)
  updateLandmark()
  const focus = landmark.focus
  cameraPose(focus)
}

function setTool(key: Tool) {
  if (mode !== 'sandbox') return
  tool = key
  audio.play('select')
  updateCooldowns(performance.now())
}

async function switchMode(next: Mode, force = false) {
  if (!renderer || contextLost || (!force && next === mode && (walking || world))) return
  const revision = ++transitionId
  walking = true
  hover = undefined
  mode = next
  activeLandmark = undefined
  document.body.dataset.mode = mode
  element('campus-tab').setAttribute('aria-pressed', `${mode === 'campus'}`)
  element('sandbox-tab').setAttribute('aria-pressed', `${mode === 'sandbox'}`)
  showStatus(next === 'campus' ? 'loadingCampus' : 'loadingSandbox')
  try {
    const nextWorld = next === 'campus'
      ? (await import('./campus')).createCampus()
      : await (await import('./sandbox')).createSandbox(audio)
    if (revision !== transitionId) { nextWorld.dispose(); return }
    if (world) {
      scene.remove(world.root)
      world.dispose()
      renderer.renderLists.dispose()
    }
    world = nextWorld
    activeMode = next
    nextWorld.root.updateMatrixWorld(true)
    scene.add(nextWorld.root)
    controls!.minDistance = nextWorld.minDistance
    controls!.maxDistance = nextWorld.maxDistance
    cameraPose(nextWorld.home, true)
    applyQuality()
    buildLandmarks()
    updateLandmark()
    renderMetrics()
    showStatus()
  } catch (error) {
    if (revision === transitionId) {
      console.error('Scene initialization failed', error)
      showStatus('sceneError', true)
    }
  } finally {
    if (revision === transitionId) walking = false
  }
}

function rayAt(x: number, y: number) {
  const rect = canvas.getBoundingClientRect()
  ndc.set((x - rect.left) / rect.width * 2 - 1, -(y - rect.top) / rect.height * 2 + 1)
  ray.setFromCamera(ndc, camera)
  return ray
}

function tap(x: number, y: number) {
  if (walking || activeMode !== mode || contextLost) return
  const pick = rayAt(x, y)
  const current = sandbox()
  if (current) {
    const position = current.aim(pick, tool)
    if (!position) return
    const now = performance.now()
    if (readyAt[tool] > now) { showToast('cooldown'); return }
    audio.unlock()
    readyAt[tool] = now + tools[tool].seconds * 1000
    current.activate(tool, position)
    updateCooldowns(now)
    return
  }
  const landmark = campus()?.pick(pick)
  if (landmark) selectLandmark(landmark)
}

function dolly(factor: number) {
  if (!controls) return
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
canvas.addEventListener('pointerleave', () => { hover = undefined; sandbox()?.aim() })
canvas.addEventListener('contextmenu', (event) => event.preventDefault())
canvas.addEventListener('webglcontextlost', (event) => { event.preventDefault(); contextLost = true; showStatus('contextLost', true) })

element('campus-tab').addEventListener('click', () => { audio.play('click'); void switchMode('campus') })
element('sandbox-tab').addEventListener('click', () => { audio.play('click'); void switchMode('sandbox') })
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
  applyQuality(true)
  audio.play('click')
})
element('fullscreen').addEventListener('click', async () => {
  audio.play('click')
  try {
    if (document.fullscreenElement) await document.exitFullscreen()
    else if (fullscreenDocument.webkitFullscreenElement) await fullscreenDocument.webkitExitFullscreen?.()
    else if (typeof fullscreenRoot.requestFullscreen === 'function' && document.fullscreenEnabled) await fullscreenRoot.requestFullscreen()
    else if (fullscreenRoot.webkitRequestFullscreen) await fullscreenRoot.webkitRequestFullscreen()
    else showToast('fullscreenError')
  } catch { showToast('fullscreenError') }
})
function handleFullscreenChange() { updateActions(); resize() }
document.addEventListener('fullscreenchange', handleFullscreenChange)
document.addEventListener('webkitfullscreenchange', handleFullscreenChange)
element('landmark-toggle').addEventListener('click', () => {
  if (!compact.matches) return
  const expanded = element('landmark-panel').classList.toggle('is-open')
  element('landmark-toggle').setAttribute('aria-expanded', `${expanded}`)
  audio.play('click')
})
element('zoom-in').addEventListener('click', () => dolly(.78))
element('zoom-out').addEventListener('click', () => dolly(1.28))
element('reset').addEventListener('click', () => { if (world) { clearLandmark(); cameraPose(world.home); audio.play('click') } })
element('overview').addEventListener('click', () => { if (world) { clearLandmark(); cameraPose(world.overview); audio.play('click') } })
element('rebuild').addEventListener('click', () => {
  const current = sandbox()
  if (!current || walking) return
  current.rebuild()
  audio.play('rebuild')
  renderMetrics()
  if (renderer) renderer.shadowMap.needsUpdate = true
  showToast('rebuilt')
})
element('retry').addEventListener('click', () => {
  if (!renderer || contextLost) location.reload()
  else void switchMode(mode, true)
})
for (const key of toolOrder) element(`tool-${key}`).addEventListener('click', () => setTool(key))
window.addEventListener('keydown', (event) => {
  if (event.repeat || event.altKey || event.ctrlKey || event.metaKey || event.target instanceof HTMLSelectElement || event.target instanceof HTMLInputElement) return
  const key = toolOrder[Number(event.key) - 1]
  if (key && mode === 'sandbox') setTool(key)
  if (event.key === 'Escape' && activeLandmark) clearLandmark()
})
window.addEventListener('pointerdown', () => audio.unlock(), { capture: true, passive: true })
window.addEventListener('keydown', () => audio.unlock(), { capture: true, passive: true })

function frame(now: number) {
  requestAnimationFrame(frame)
  if (!renderer || !controls || contextLost) return
  const wallTime = lastTick ? (now - lastTick) / 1000 : 1 / 60
  const dt = Math.min(.066, wallTime)
  lastTick = now
  if (animation) {
    const progress = Math.min(1, (now - animation.start) / 575)
    const eased = progress * progress * (3 - 2 * progress)
    camera.position.lerpVectors(animation.position, animation.endPosition, eased)
    controls.target.lerpVectors(animation.target, animation.endTarget, eased)
    if (progress === 1) animation = undefined
  }
  controls.update()
  camera.updateMatrixWorld()
  const current = sandbox()
  const shake = world?.update(dt, controls.target) ?? 0
  if (current && now > lastHover + 40 && !walking) {
    lastHover = now
    if (hover && !activePointers.size) current.aim(rayAt(hover.x, hover.y), tool)
  }
  if (now > lastUi + 83) {
    lastUi = now
    element('needle').style.transform = `rotate(${-Math.round(T.MathUtils.radToDeg(controls.getAzimuthalAngle()))}deg)`
    updatePins()
    updateCooldowns(now)
    if (current) renderMetrics()
  }
  if (current?.moving() && renderer.shadowMap.enabled && now - lastShadow > 49) {
    lastShadow = now
    renderer.shadowMap.needsUpdate = true
  }
  const amount = reducedMotion.matches ? 0 : shake
  temporary.set(Math.sin(now * .062) * amount, Math.cos(now * .081) * amount * .65, Math.sin(now * .052) * amount * .38)
  camera.position.add(temporary)
  renderer.render(scene, camera)
  camera.position.sub(temporary)
  camera.updateMatrixWorld()

  if (!walking && wallTime < 1 && !document.hidden) {
    frameSum += wallTime
    frameCount++
    if (frameSum > 2.25) {
      lowWindows = frameCount / frameSum < 33 ? lowWindows + 1 : 0
      frameSum = frameCount = 0
      if (lowWindows >= 2 && pixelRatioScale > .62) {
        pixelRatioScale = Math.max(.62, pixelRatioScale - .12)
        lowWindows = 0
        resize()
      }
    }
  }
}

document.body.dataset.mode = mode
qualitySelect.value = quality
applyLanguage()
showStatus('loadingCampus')

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
  requestAnimationFrame(frame)
  void switchMode('campus', true)
} catch (error) {
  console.error('WebGL initialization failed', error)
  showStatus('graphicsError', true)
}

window.addEventListener('pagehide', (event) => {
  if (event.persisted) return
  transitionId++
  world?.dispose()
  controls?.dispose()
  renderer?.dispose()
  audio.dispose()
})

// Browser acceptance tests read state while driving the same UI as a visitor.
if (new URLSearchParams(location.search).has('qa')) {
  Object.assign(window, { readSandboxState: () => {
    const current = sandbox()
    const rect = canvas.getBoundingClientRect()
    const sample = current?.targetPoint.clone().project(camera)
    return {
      mode: activeMode, quality, sound, language,
      camera: camera.position.toArray(), target: controls?.target.toArray(),
      targetScreen: sample ? [rect.left + (sample.x + 1) * rect.width / 2, rect.top + (1 - sample.y) * rect.height / 2] : undefined,
      buildings: campus()?.buildings, elevationRange: campus()?.elevationRange,
      physics: current?.stats(), readyAt: { ...readyAt },
      memory: { ...renderer?.info.memory }, calls: renderer?.info.render.calls,
    }
  } })
}
