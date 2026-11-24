import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { createServer } from 'node:http'
import { mkdir, readFile } from 'node:fs/promises'
import { extname, join, resolve, sep } from 'node:path'
import { chromium } from 'playwright'

const root = resolve('dist')
const base = '/SUSTech-3D-Sandbox/'
const results = resolve(process.env.SUSTECH_SCREENSHOT_DIR ?? 'test-results')
await mkdir(results, { recursive: true })

const formats = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.txt': 'text/plain; charset=utf-8', '.png': 'image/png' }
const server = createServer(async (request, response) => {
  const pathname = new URL(request.url, 'http://127.0.0.1').pathname
  if (!pathname.startsWith(base)) { response.writeHead(404).end(); return }
  const file = resolve(root, pathname.slice(base.length) || 'index.html')
  if (!file.startsWith(`${root}${sep}`)) { response.writeHead(404).end(); return }
  try {
    const content = await readFile(file)
    response.writeHead(200, { 'Content-Type': formats[extname(file)] ?? 'application/octet-stream' }).end(content)
  } catch {
    response.writeHead(404).end()
  }
})
await new Promise((done, reject) => server.once('error', reject).listen(0, '127.0.0.1', done))
let browser
const issues = []
const url = `http://127.0.0.1:${server.address().port}${base}?qa=1`

function track(page) {
  page.on('pageerror', (error) => issues.push(error.message))
  page.on('console', (message) => { if (message.type() === 'error') issues.push(message.text()) })
  page.on('response', (response) => { if (response.status() >= 400) issues.push(`${response.status()} ${response.url()}`) })
}

const report = (message) => console.log(`PASS ${message}`)
const read = (page) => page.evaluate(() => window.readSandboxState())
const ready = (page, mode) => page.waitForFunction((name) => window.readSandboxState?.().mode === name && document.querySelector('main').getAttribute('aria-busy') === 'false', mode)
const dist = (a, b) => Math.hypot(...a.map((x, i) => x - b[i]))

async function shot(page, filename) {
  const frame = await page.screenshot({ path: join(results, filename), timeout: 30000, animations: 'disabled' })
  assert.ok(frame.length > 30000, `Expected a detailed render in ${filename}`)
  return createHash('sha256').update(frame).digest('hex')
}

async function waitPhysics(page, fragments) {
  await page.waitForFunction((minimum) => window.readSandboxState().physics.fragments >= minimum, fragments)
  return (await read(page)).physics
}

async function clickTarget(page) {
  const position = (await read(page)).targetScreen
  assert.ok(position.every(Number.isFinite))
  await page.mouse.click(...position)
}

async function frameSample(page) {
  return page.evaluate(() => new Promise((done) => {
    let elapsed = 0
    let last = performance.now()
    let count = 0
    function frame(now) {
      elapsed += now - last
      last = now
      if (++count === 18) done(Math.round(elapsed / count * 10) / 10)
      else requestAnimationFrame(frame)
    }
    requestAnimationFrame(frame)
  }))
}

try {
  const args = process.env.SUSTECH_SOFTWARE_GL === '1' ? ['--enable-unsafe-swiftshader', '--use-angle=swiftshader'] : []
  browser = await chromium.launch({ executablePath: process.env.SUSTECH_CHROME_PATH, args })
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 })
  await context.addInitScript(() => {
    const original = AudioContext.prototype.createDynamicsCompressor
    AudioContext.prototype.createDynamicsCompressor = function () {
      const compressor = original.call(this)
      const meter = this.createAnalyser()
      meter.fftSize = 1024
      compressor.connect(meter)
      window.soundMeter = () => {
        const samples = new Float32Array(meter.fftSize)
        meter.getFloatTimeDomainData(samples)
        return Math.max(...samples.map(Math.abs))
      }
      return compressor
    }
  })
  const page = await context.newPage()
  page.setDefaultTimeout(30000)
  track(page)

  const navigation = await page.goto(url, { waitUntil: 'domcontentloaded' })
  assert.equal(navigation.status(), 200)
  await ready(page, 'campus')
  await page.waitForFunction(() => window.readSandboxState().calls > 0)
  const campus = await read(page)
  assert.equal(campus.language, 'zh-CN')
  assert.equal(campus.buildings, 113)
  assert.equal(campus.elevationRange, 123)
  assert.equal(await page.locator('.landmark-item').count(), 14)
  assert.ok(await page.locator('.map-pin:visible').count() >= 3)
  const campusHash = await shot(page, 'campus.png')
  report('Production assets load from the GitHub Pages project path, with terrain, buildings and landmark labels.')

  await page.mouse.move(1139, 625)
  await page.mouse.down()
  await page.mouse.move(1225, 585, { steps: 8 })
  await page.mouse.up()
  await page.waitForFunction((pose) => window.readSandboxState().camera.some((coordinate, i) => Math.abs(coordinate - pose[i]) > 1), campus.camera)
  const orbited = await read(page)
  await page.mouse.wheel(0, -350)
  await page.waitForFunction((pose) => window.readSandboxState().camera.some((coordinate, i) => Math.abs(coordinate - pose[i]) > 1), orbited.camera)
  const zoomed = await read(page)
  assert.ok(dist(zoomed.camera, zoomed.target) < dist(orbited.camera, orbited.target))
  await page.mouse.down({ button: 'right' })
  await page.mouse.move(1278, 614, { steps: 8 })
  await page.mouse.up({ button: 'right' })
  await page.waitForFunction((target) => window.readSandboxState().target.some((coordinate, i) => Math.abs(coordinate - target[i]) > .6), zoomed.target)
  await page.click('#overview')
  await page.waitForFunction(() => window.readSandboxState().camera[1] > 350)
  await page.click('#reset')
  await page.waitForFunction((pose) => window.readSandboxState().camera.every((coordinate, i) => Math.abs(coordinate - pose[i]) < .6), campus.camera)
  await page.click('[data-landmark="engineering"]')
  await page.waitForFunction(() => Math.hypot(...window.readSandboxState().camera.map((v, i) => v - window.readSandboxState().target[i])) < 43)
  assert.equal(await page.locator('#landmark-info h2').textContent(), '工学院')
  assert.notEqual(await shot(page, 'campus-detail.png'), campusHash)
  report('Orbit, wheel zoom, right-button pan, top-down view, reset, and landmark close-up work.')

  await page.click('#language')
  assert.equal(await page.locator('#landmark-info h2').textContent(), 'College of Engineering')
  assert.equal(await page.locator('html').getAttribute('lang'), 'en-US')
  await page.click('#fullscreen')
  await page.waitForFunction(() => !!document.fullscreenElement)
  await page.click('#fullscreen')
  await page.waitForFunction(() => !document.fullscreenElement)
  for (const quality of ['low', 'medium', 'high']) {
    await page.selectOption('#quality', quality)
    assert.equal((await read(page)).quality, quality)
  }
  report('Immediate English translation, all quality levels, and entering and exiting fullscreen work.')

  await page.click('#sandbox-tab')
  await ready(page, 'sandbox')
  await page.waitForFunction(() => window.readSandboxState().calls > 0)
  const initial = await read(page)
  assert.deepEqual(initial.physics, { intact: 12, total: 12, fragments: 0, collisions: 0, effects: 0 })
  await shot(page, 'sandbox.png')
  report('The separate sandbox opens with 12 intact fictional structures.')

  await page.click('#rebuild')
  await page.waitForFunction(() => (window.soundMeter?.() ?? 0) > .003, undefined, { polling: 20, timeout: 5000 })
  await page.click('#sound')
  await page.waitForFunction(() => (window.soundMeter?.() ?? 1) < .0005)
  await page.click('#rebuild')
  await page.waitForTimeout(180)
  assert.ok(await page.evaluate(() => window.soundMeter() < .0005))
  report('The Web Audio graph produces a signal and remains silent while muted.')

  await page.keyboard.press('1')
  assert.equal(await page.locator('#tool-grenade').getAttribute('aria-pressed'), 'true')
  await clickTarget(page)
  const small = await waitPhysics(page, 1)
  const smallClock = (await read(page)).readyAt
  assert.ok(smallClock.grenade > 0 && smallClock.missile === 0 && smallClock.nuke === 0)
  const grenadeHash = await shot(page, 'grenade.png')
  await page.waitForFunction(() => !document.querySelector('#tool-grenade').classList.contains('is-cooling'))
  await page.click('#rebuild')
  assert.equal((await read(page)).physics.fragments, 0)

  await page.keyboard.press('2')
  assert.equal(await page.locator('#tool-missile').getAttribute('aria-pressed'), 'true')
  await clickTarget(page)
  const medium = await waitPhysics(page, small.fragments + 1)
  const mediumClock = (await read(page)).readyAt
  assert.ok(mediumClock.missile > 0 && mediumClock.nuke === 0)
  const missileHash = await shot(page, 'missile.png')
  assert.notEqual(missileHash, grenadeHash)
  await page.click('#rebuild')

  await page.keyboard.press('3')
  assert.equal(await page.locator('#tool-nuke').getAttribute('aria-pressed'), 'true')
  await clickTarget(page)
  const large = await waitPhysics(page, medium.fragments + 1)
  const largeClock = (await read(page)).readyAt
  assert.ok(largeClock.nuke > 0 && largeClock.missile === mediumClock.missile)
  await clickTarget(page)
  assert.equal((await read(page)).readyAt.nuke, largeClock.nuke)
  assert.equal(await page.locator('#toast').textContent(), 'Cooling down')
  await page.waitForFunction(() => window.readSandboxState().physics.collisions > 15)
  await page.waitForFunction(() => document.querySelector('#toast').hidden)
  const nukeHash = await shot(page, 'sandbox-burst.png')
  assert.ok(nukeHash !== grenadeHash && nukeHash !== missileHash)
  assert.ok((await read(page)).physics.effects > 40)
  await page.waitForTimeout(3200)
  await shot(page, 'sandbox-cloud.png')
  report(`Tools 1–3 give distinct effects and ${small.fragments}/${medium.fragments}/${large.fragments} fragments at the test target. Cooldowns are independent and a cooling tool cannot fire again.`)

  for (let i = 0; i < 4; i++) await page.click('#rebuild')
  const rebuilt = await read(page)
  assert.deepEqual(rebuilt.physics, initial.physics)
  assert.equal(rebuilt.readyAt.nuke, largeClock.nuke)
  const firstSample = await frameSample(page)
  const memory = []
  for (let i = 0; i < 3; i++) {
    await page.click('#campus-tab')
    await ready(page, 'campus')
    await page.click('#sandbox-tab')
    await ready(page, 'sandbox')
    await page.waitForFunction(() => window.readSandboxState().calls > 40)
    assert.deepEqual((await read(page)).physics, initial.physics)
    memory.push((await read(page)).memory)
  }
  assert.deepEqual(memory[0], memory[2])
  const lastSample = await frameSample(page)
  report(`Repeated rebuilds clear all physics and effects, and scene switches keep resource counts stable at ${memory[2].geometries} geometries and ${memory[2].textures} textures. Mean frame time ${firstSample} ms before and ${lastSample} ms after three round trips in this browser.`)
  await page.waitForFunction(() => ['grenade', 'missile', 'nuke'].every((tool) => !document.querySelector(`#tool-${tool}`).classList.contains('is-cooling')))
  report('All cooldowns return to ready automatically.')

  await page.selectOption('#quality', 'medium')
  await page.reload({ waitUntil: 'domcontentloaded' })
  await ready(page, 'campus')
  const preferences = await read(page)
  assert.equal(preferences.language, 'en-US')
  assert.equal(preferences.quality, 'medium')
  assert.equal(preferences.sound, false)
  report('Language, graphics and sound settings persist after reload.')
  await context.close()

  const mobileContext = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true })
  const mobile = await mobileContext.newPage()
  track(mobile)
  await mobile.goto(url, { waitUntil: 'domcontentloaded' })
  await ready(mobile, 'campus')
  await mobile.tap('#landmark-toggle')
  await mobile.tap('[data-landmark="lynn"]')
  assert.equal(await mobile.locator('#landmark-info h2').textContent(), '琳恩图书馆')
  await mobile.tap('#reset')
  await mobile.tap('#landmark-toggle')
  await shot(mobile, 'campus-mobile.png')
  await mobile.tap('#sandbox-tab')
  await ready(mobile, 'sandbox')
  const target = (await read(mobile)).targetScreen
  await mobile.touchscreen.tap(...target)
  await waitPhysics(mobile, 1)
  assert.equal(await mobile.evaluate(() => document.documentElement.scrollWidth), 390)
  await shot(mobile, 'sandbox-mobile.png')
  await mobileContext.close()
  report('A 390 px touch viewport can explore landmarks, switch modes, and trigger physics without horizontal overflow.')
  assert.deepEqual(issues, [])
  report('No page exceptions, console errors, or failed asset requests.')
} finally {
  await browser?.close()
  server.close()
}
