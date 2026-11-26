import { Vector3, type Camera } from 'three'
import { icon } from './icons'
import { translated, translations } from './i18n'
import type { CameraPose, CampusWorld, Landmark, Language } from './world'

export function createLandmarkControls(viewport: HTMLElement, focus: (pose: CameraPose) => void) {
  const panel = viewport.querySelector<HTMLElement>('#landmark-panel')!
  const toggle = viewport.querySelector<HTMLButtonElement>('#landmark-toggle')!
  const list = viewport.querySelector<HTMLElement>('#landmark-list')!
  const details = viewport.querySelector<HTMLElement>('#landmark-info')!
  const labels = viewport.querySelector<HTMLElement>('#map-labels')!
  const entries = new Map<string, { item: HTMLButtonElement, pin: HTMLButtonElement, landmark: Landmark }>()
  const projection = new Vector3()
  let world: CampusWorld | undefined
  let selected: Landmark | undefined
  let language: Language = 'zh-CN'

  function renderSelection() {
    const text = translations[language]
    for (const { item, pin, landmark } of entries.values()) {
      const pressed = `${landmark.id === selected?.id}`
      item.setAttribute('aria-pressed', pressed)
      pin.setAttribute('aria-pressed', pressed)
    }
    details.hidden = !selected
    details.replaceChildren()
    if (!selected) return

    details.setAttribute('aria-label', text.details)
    details.innerHTML = `<button type="button" class="detail-close">${icon('close', 14)}</button><h2></h2><span class="category"></span><p></p>`
    const close = details.querySelector<HTMLButtonElement>('button')!
    close.setAttribute('aria-label', text.close)
    close.addEventListener('click', () => choose())
    details.querySelector('h2')!.textContent = translated(selected.name, language)
    details.querySelector('.category')!.textContent = translated(selected.category, language)
    details.querySelector('p')!.textContent = translated(selected.description, language)
    if (!selected.dimensions) return

    const specs = document.createElement('ul')
    specs.className = 'landmark-specs'
    specs.setAttribute('aria-label', text.dimensions)
    for (const building of selected.dimensions.buildings) {
      const row = document.createElement('li')
      if (building.label) {
        const label = document.createElement('span')
        label.textContent = translated(building.label, language)
        row.append(label)
      }
      const value = document.createElement('strong')
      const height = building.heightMeters?.toLocaleString(language, { maximumFractionDigits: 1 })
      const floors = `${building.floors} ${text.floorUnit}`
      value.textContent = height ? `${floors} · ${height} ${text.meters}` : floors
      row.append(value)
      specs.append(row)
    }
    const source = document.createElement('a')
    source.className = 'landmark-source'
    source.href = selected.dimensions.source
    source.textContent = text.dimensionSource
    source.target = '_blank'
    source.rel = 'noopener noreferrer'
    details.append(specs, source)
  }

  function choose(landmark?: Landmark) {
    selected = landmark
    world?.select(landmark?.id)
    renderSelection()
    if (landmark) focus(landmark.focus)
  }

  function setLanguage(value: Language) {
    language = value
    for (const { item, pin, landmark } of entries.values()) {
      const name = translated(landmark.name, language)
      item.querySelector('span')!.textContent = pin.textContent = pin.title = name
    }
    renderSelection()
  }

  function setOpen(open: boolean) {
    panel.classList.toggle('is-open', open)
    toggle.setAttribute('aria-expanded', `${open}`)
  }

  toggle.addEventListener('click', () => setOpen(!panel.classList.contains('is-open')))

  return {
    attach(campus?: CampusWorld) {
      world = campus
      selected = undefined
      entries.clear()
      list.replaceChildren()
      labels.replaceChildren()
      setOpen(!matchMedia('(max-width: 790px)').matches)
      for (const landmark of world?.landmarks ?? []) {
        const item = document.createElement('button')
        item.type = 'button'
        item.className = 'landmark-item'
        item.dataset.landmark = landmark.id
        item.innerHTML = `${icon(landmark.icon, 16)}<span></span>`
        item.addEventListener('click', () => choose(landmark))
        list.append(item)

        const pin = document.createElement('button')
        pin.type = 'button'
        pin.className = 'map-pin'
        pin.dataset.pin = landmark.id
        pin.hidden = true
        pin.addEventListener('click', () => choose(landmark))
        labels.append(pin)
        entries.set(landmark.id, { item, pin, landmark })
      }
      setLanguage(language)
    },
    choose,
    setLanguage,
    project(camera: Camera, near: boolean, compact: boolean) {
      if (!world) return
      const { clientWidth: width, clientHeight: height } = viewport
      const leftInset = compact ? 6 : panel.offsetLeft + panel.offsetWidth + 12
      const drawn: { x: number, y: number, right: number }[] = []
      const ordered = Array.from(entries.values()).sort((a, b) => Number(b.landmark === selected) - Number(a.landmark === selected))
      for (const { pin, landmark } of ordered) {
        projection.copy(landmark.anchor).project(camera)
        const labelWidth = Math.min(165, (pin.textContent?.length ?? 10) * (language === 'zh-CN' ? 11 : 5.9) + 23)
        const x = Math.round((projection.x + 1) * width * .5 - labelWidth * .5)
        const y = Math.round((1 - projection.y) * height * .5 - 26)
        const visible = x >= leftInset
          && x + labelWidth < width - 13 && y > (compact ? 137 : 12) && y < height - 53
          && projection.z > -1 && projection.z < 1
        const crowded = drawn.some((label) => Math.abs(y - label.y) < 25 && x <= label.right + 6 && x + labelWidth >= label.x - 6)
        pin.hidden = !(visible && (landmark === selected || (landmark.pin && !near && !crowded)))
        if (!pin.hidden) {
          pin.style.transform = `translate3d(${x}px, ${y}px, 0)`
          drawn.push({ x, y, right: x + labelWidth })
        }
      }
    },
  }
}
