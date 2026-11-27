import assert from 'node:assert/strict'
import { mkdir, readFile, readdir } from 'node:fs/promises'
import { createServer } from 'node:http'
import { extname, join, resolve, sep } from 'node:path'
import { chromium, devices, webkit } from 'playwright'

const root = resolve('dist')
const prefix = '/SUSTech-3D-Sandbox/'
const engine = process.argv[2] ?? process.env.SUSTECH_BROWSER ?? 'chromium'
const results = resolve(process.env.SUSTECH_SCREENSHOT_DIR ?? 'test-results')
const removedControls = '.modes, .tool-dock, [data-sandbox], #rebuild'
const issues = []
assert.ok(['chromium', 'webkit'].includes(engine), 'Use chromium or webkit')
assert.ok((await readdir(join(root, 'assets'))).every((asset) => !/playground|rapier|\.wasm$/i.test(asset)))
await mkdir(results, { recursive: true })

const formats = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.txt': 'text/plain; charset=utf-8' }
const server = createServer(async (request, response) => {
  const pathname = new URL(request.url, 'http://127.0.0.1').pathname
  if (!pathname.startsWith(prefix)) { response.writeHead(404).end(); return }
  const file = resolve(root, pathname.slice(prefix.length) || 'index.html')
  if (!file.startsWith(`${root}${sep}`)) { response.writeHead(404).end(); return }
  try {
    const content = await readFile(file)
    response.writeHead(200, { 'Content-Type': formats[extname(file)] ?? 'application/octet-stream' }).end(content)
  } catch {
    response.writeHead(404).end()
  }
})
await new Promise((done, reject) => server.once('error', reject).listen(0, '127.0.0.1', done))
const url = `http://127.0.0.1:${server.address().port}${prefix}?qa=1`
let browser

const report = (message) => console.log(`PASS ${message}`)
const read = (page) => page.evaluate(() => window.readCampusState())
const distance = (a, b) => Math.hypot(...a.map((value, i) => value - b[i]))
const ready = (page) => page.waitForFunction(() => window.readCampusState?.().ready && window.readCampusState().calls > 0
  && document.querySelector('main').getAttribute('aria-busy') === 'false')
const home = (page, pose) => page.waitForFunction((position) => window.readCampusState().camera.every((value, i) => Math.abs(value - position[i]) < .04), pose)

function track(page) {
  const assets = new Set()
  page.on('pageerror', (error) => issues.push(error.message))
  page.on('console', (message) => { if (message.type() === 'error') issues.push(message.text()) })
  page.on('response', (response) => {
    assets.add(new URL(response.url()).pathname)
    if (response.status() >= 400) issues.push(`${response.status()} ${response.url()}`)
  })
  page.on('requestfailed', (request) => issues.push(`${request.failure()?.errorText} ${request.url()}`))
  return assets
}

async function shot(page, name) {
  const frame = await page.screenshot({ path: join(results, `${name}.png`), timeout: 30000 })
  assert.ok(frame.length > 30000, `Expected a detailed render in ${name}`)
}

try {
  const args = process.env.SUSTECH_SOFTWARE_GL === '1' ? ['--enable-unsafe-swiftshader', '--use-angle=swiftshader'] : []
  browser = engine === 'webkit' ? await webkit.launch() : await chromium.launch({ executablePath: process.env.SUSTECH_CHROME_PATH, args })
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 })
  await context.addInitScript(() => {
    const audioClass = window.AudioContext ?? window.webkitAudioContext
    if (!audioClass) return
    const original = audioClass.prototype.createGain
    audioClass.prototype.createGain = function () {
      const gain = original.call(this)
      if (!window.soundMeter) {
        const meter = this.createAnalyser()
        meter.fftSize = 1024
        gain.connect(meter)
        window.soundMeter = () => {
          const samples = new Float32Array(meter.fftSize)
          meter.getFloatTimeDomainData(samples)
          return Math.max(...samples.map(Math.abs))
        }
      }
      return gain
    }
  })
  const page = await context.newPage()
  const assets = track(page)
  const response = await page.goto(url, { waitUntil: 'domcontentloaded' })
  assert.equal(response.status(), 200)
  await ready(page)
  const campus = await read(page)
  assert.equal(campus.language, 'zh-CN')
  assert.equal(campus.buildings, 113)
  assert.equal(campus.elevationRange, 123)
  assert.equal(await page.locator('h1').textContent(), '南方科技大学')
  assert.equal(await page.locator('.landmark-item').count(), 15)
  assert.ok(await page.locator('.map-pin:visible').count() >= 3)
  assert.equal(await page.locator(removedControls).count(), 0)
  assert.ok([...assets].some((path) => path.includes('/campus-')))
  assert.ok([...assets].every((path) => !/playground|rapier|\.wasm$/i.test(path)))
  const notice = await page.request.get(new URL('data-notices.txt', url).href)
  assert.equal(notice.status(), 200)
  assert.match(await notice.text(), /OpenStreetMap contributors/)
  await shot(page, 'sustech-campus')
  report('The production build opens the campus with its landmarks and attribution. The former scene controls and bundle are removed.')

  await page.mouse.move(1120, 620)
  await page.mouse.down()
  await page.mouse.move(1195, 570, { steps: 8 })
  await page.mouse.up()
  await page.waitForFunction((pose) => window.readCampusState().camera.some((value, i) => Math.abs(value - pose[i]) > 1), campus.camera)
  const orbited = await read(page)
  await page.mouse.wheel(0, -350)
  await page.waitForFunction((pose) => window.readCampusState().camera.some((value, i) => Math.abs(value - pose[i]) > 1), orbited.camera)
  const zoomed = await read(page)
  assert.ok(distance(zoomed.camera, zoomed.target) < distance(orbited.camera, orbited.target))
  await page.mouse.down({ button: 'right' })
  await page.mouse.move(1230, 603, { steps: 8 })
  await page.mouse.up({ button: 'right' })
  await page.waitForFunction((target) => window.readCampusState().target.some((value, i) => Math.abs(value - target[i]) > .6), zoomed.target)
  await page.click('#reset')
  await home(page, campus.camera)
  await page.click('#zoom-in')
  assert.ok(distance((await read(page)).camera, campus.target) < distance(campus.camera, campus.target))
  await page.click('#zoom-out')
  await page.click('#overview')
  await page.waitForFunction(() => window.readCampusState().camera[1] > 350)
  await page.click('#reset')
  await home(page, campus.camera)
  report('Orbit, mouse-wheel zoom, pan, overhead view and camera reset work.')

  await page.click('[data-landmark="engineering"]')
  await page.waitForFunction(() => {
    const { camera, target } = window.readCampusState()
    return Math.hypot(...camera.map((value, i) => value - target[i])) < 43
  })
  assert.deepEqual(await page.locator('.landmark-specs strong').allTextContents(), ['9 层 · 42.3 米', '10 层 · 46.8 米'])
  await page.click('#language')
  assert.equal(await page.locator('html').getAttribute('lang'), 'en-US')
  assert.equal(await page.locator('#landmark-info h2').textContent(), 'College of Engineering')
  assert.deepEqual(await page.locator('.landmark-specs strong').allTextContents(), ['9 floors · 42.3 m', '10 floors · 46.8 m'])
  await page.click('#language')
  await page.click('[data-landmark="lynn"]')
  await page.waitForFunction(() => {
    const { camera, target } = window.readCampusState()
    return Math.hypot(...camera.map((value, i) => value - target[i])) < 28
  })
  assert.equal(await page.locator('.landmark-specs strong').textContent(), '3 层')
  await shot(page, 'sustech-lynn-library')
  await page.locator('.detail-close').click()
  assert.equal(await page.locator('#landmark-info').isHidden(), true)
  report('Landmark details, published dimensions and both languages work.')

  await page.click('#language')
  if (await page.locator('#sound').isEnabled()) {
    const signal = page.waitForFunction(() => (window.soundMeter?.() ?? 0) > .002, undefined, { polling: 12, timeout: 5000 })
    await page.click('#reset')
    await signal
    await page.click('#sound')
    await page.waitForFunction(() => (window.soundMeter?.() ?? 1) < .0005)
    await page.click('#overview')
    assert.ok(await page.evaluate(() => window.soundMeter() < .0005))
    report('Interface audio plays and the mute control works.')
  } else {
    assert.equal(await page.locator('#sound').getAttribute('aria-label'), 'Sound is unavailable in this browser')
    report('The sound control uses its compatibility state.')
  }
  const canFullscreen = await page.evaluate(() => (document.fullscreenEnabled && !!document.documentElement.requestFullscreen) || !!document.documentElement.webkitRequestFullscreen)
  await page.click('#fullscreen')
  if (canFullscreen) {
    await page.waitForFunction(() => !!(document.fullscreenElement || document.webkitFullscreenElement))
    await page.click('#fullscreen')
    await page.waitForFunction(() => !(document.fullscreenElement || document.webkitFullscreenElement))
  } else {
    assert.equal(await page.locator('#toast').textContent(), 'Fullscreen is unavailable in this browser.')
  }
  for (const quality of ['low', 'high', 'medium']) {
    await page.selectOption('#quality', quality)
    assert.equal((await read(page)).quality, quality)
  }
  await page.reload({ waitUntil: 'domcontentloaded' })
  await ready(page)
  const preferences = await read(page)
  assert.equal(preferences.language, 'en-US')
  assert.equal(preferences.quality, 'medium')
  assert.equal(preferences.sound, false)
  report('Display and sound settings persist after reload.')

  await page.goto(`${url}#sandbox`, { waitUntil: 'domcontentloaded' })
  await ready(page)
  assert.equal((await read(page)).buildings, 113)
  assert.equal(await page.locator(removedControls).count(), 0)
  report('The former link also opens the campus explorer.')
  await context.close()

  const mobileOptions = engine === 'webkit' ? { ...devices['iPhone 15'], deviceScaleFactor: 1 }
    : { viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true }
  const mobileContext = await browser.newContext(mobileOptions)
  const mobile = await mobileContext.newPage()
  track(mobile)
  await mobile.goto(url, { waitUntil: 'domcontentloaded' })
  await ready(mobile)
  assert.equal(await mobile.locator(removedControls).count(), 0)
  await shot(mobile, 'sustech-campus-mobile')
  await mobile.tap('#landmark-toggle')
  await mobile.tap('[data-landmark="lynn"]')
  assert.equal(await mobile.locator('#landmark-info h2').textContent(), '琳恩图书馆')
  await mobile.tap('#reset')
  const { width, height } = mobileOptions.viewport
  assert.equal(await mobile.evaluate(() => document.documentElement.scrollWidth), width)
  await mobile.setViewportSize({ width: height, height: width })
  await mobile.waitForFunction(() => {
    const buttons = document.querySelector('.camera-actions').getBoundingClientRect()
    const settings = document.querySelector('.bar-actions').getBoundingClientRect()
    return buttons.left >= 0 && buttons.right <= innerWidth && buttons.bottom <= innerHeight && settings.right <= innerWidth
  })
  await mobileContext.close()
  report(`${engine} at ${width} px supports mobile landmarks and landscape controls.`)
  assert.deepEqual(issues, [])
  report('No page exceptions, console errors or failed asset requests.')
} finally {
  await browser?.close()
  server.close()
}
