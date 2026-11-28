import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdir, readFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { extname, join, resolve, sep } from 'node:path'
import { chromium, devices, webkit } from 'playwright'

const root = resolve('dist')
const prefix = '/SUSTech-3D-Sandbox/'
const engine = process.argv[2] ?? process.env.SUSTECH_BROWSER ?? 'chromium'
const results = resolve(process.env.SUSTECH_SCREENSHOT_DIR ?? 'test-results')
const tools = [['canister', 1], ['crate', 5], ['core', 15]]
const previousFragments = { canister: 2, crate: 42, core: 83 }
const minimumRuins = { canister: 1, crate: 4, core: 10 }
const clockReset = { canister: 0, crate: 0, core: 0 }
const issues = []
assert.ok(['chromium', 'webkit'].includes(engine), 'Use chromium or webkit')
await mkdir(results, { recursive: true })

const formats = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' }
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
const read = (page) => page.evaluate(() => window.readSandboxState())
const distance = (a, b) => Math.hypot(...a.map((value, i) => value - b[i]))
const ready = (page, mode) => page.waitForFunction((name) => {
  const state = window.readSandboxState?.()
  return state?.mode === name && state.calls > 0 && state.memory.geometries > 0
    && document.querySelector('main').getAttribute('aria-busy') === 'false'
}, mode)
const toolButton = (page, tool) => page.locator(`#tool-${tool}`)
const cooling = (page, tool) => toolButton(page, tool).evaluate((button) => button.classList.contains('is-cooling'))

function track(page) {
  page.on('pageerror', (error) => issues.push(error.message))
  page.on('console', (message) => { if (message.type() === 'error') issues.push(message.text()) })
  page.on('response', (response) => { if (response.status() >= 400) issues.push(`${response.status()} ${response.url()}`) })
  page.on('requestfailed', (request) => issues.push(`${request.failure()?.errorText} ${request.url()}`))
}

async function shot(page, name) {
  const frame = await page.screenshot({ path: join(results, `${name}.png`), timeout: 30000 })
  assert.ok(frame.length > 30000, `Expected a detailed render in ${name}`)
  return createHash('sha256').update(frame).digest('hex')
}

async function clickTarget(page, field = 'structureScreen') {
  const point = (await read(page))[field]
  assert.ok(point.every(Number.isFinite))
  await page.mouse.click(...point)
}

async function waitForContact(page, tool) {
  await page.waitForFunction((name) => {
    const state = window.readSandboxState()
    return state.lastImpact === name && state.stats.fragments > 0
  }, tool)
  return (await read(page)).stats
}

async function frameSample(page, count) {
  return page.evaluate((frames) => new Promise((done) => {
    const times = []
    let last
    function frame(now) {
      if (last !== undefined) times.push(now - last)
      last = now
      if (times.length < frames) { requestAnimationFrame(frame); return }
      const sorted = times.toSorted((a, b) => a - b)
      const mean = times.reduce((sum, time) => sum + time, 0) / times.length
      done({ mean: +mean.toFixed(1), p95: +sorted[Math.floor(frames * .95)].toFixed(1) })
    }
    requestAnimationFrame(frame)
  }), count)
}

async function rapidDrops(page) {
  for (const [tool] of tools) {
    await toolButton(page, tool).click()
    await clickTarget(page, tool === 'crate' ? 'terrainScreen' : 'structureScreen')
  }
  const during = await read(page)
  assert.equal(during.stats.impacts + during.stats.pending, 3)
  for (const [tool] of tools) assert.ok(during.readyAt[tool] > 0)
  await page.waitForFunction(() => {
    const { stats } = window.readSandboxState()
    return stats.impacts === 3 && stats.scars === 3 && stats.pending === 0
  })
}

try {
  const args = process.env.SUSTECH_SOFTWARE_GL === '1' ? ['--enable-unsafe-swiftshader', '--use-angle=swiftshader'] : []
  browser = engine === 'webkit' ? await webkit.launch() : await chromium.launch({ executablePath: process.env.SUSTECH_CHROME_PATH, args })
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 })
  await context.addInitScript(() => {
    const audioClass = window.AudioContext ?? window.webkitAudioContext
    if (!audioClass) return
    const original = audioClass.prototype.createDynamicsCompressor
    audioClass.prototype.createDynamicsCompressor = function () {
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
  const assets = new Set()
  page.on('response', (response) => assets.add(new URL(response.url()).pathname))
  const navigation = await page.goto(url, { waitUntil: 'domcontentloaded' })
  assert.equal(navigation.status(), 200)
  await ready(page, 'campus')
  const campus = await read(page)
  assert.equal(campus.language, 'zh-CN')
  assert.equal(campus.buildings, 113)
  assert.equal(campus.elevationRange, 123)
  assert.equal(await page.locator('.landmark-item').count(), 15)
  assert.ok(await page.locator('.map-pin:visible').count() >= 3)
  assert.equal(await page.locator('.tool-dock, #rebuild').filter({ visible: true }).count(), 0)
  assert.ok([...assets].some((path) => path.includes('/campus-')))
  assert.ok([...assets].every((path) => !path.includes('/playground-')))
  await page.keyboard.press('3')
  await page.mouse.click(1105, 622)
  assert.equal((await read(page)).stats, undefined)
  assert.equal((await read(page)).selected, undefined)
  assert.equal((await read(page)).openParachutes, undefined)
  await page.click('#reset')
  await page.waitForFunction((pose) => window.readSandboxState().camera.every((coordinate, i) => Math.abs(coordinate - pose[i]) < .04), campus.camera)
  await shot(page, 'sustech-campus')
  report('The default campus uses 113 mapped footprints and retains data attribution and 15 landmarks. The effects module and launch controls are absent from this scene.')

  await page.mouse.move(1120, 620)
  await page.mouse.down()
  await page.mouse.move(1195, 570, { steps: 8 })
  await page.mouse.up()
  await page.waitForFunction((pose) => window.readSandboxState().camera.some((coordinate, i) => Math.abs(coordinate - pose[i]) > 1), campus.camera)
  const orbited = await read(page)
  await page.mouse.wheel(0, -350)
  await page.waitForFunction((pose) => window.readSandboxState().camera.some((coordinate, i) => Math.abs(coordinate - pose[i]) > 1), orbited.camera)
  const zoomed = await read(page)
  assert.ok(distance(zoomed.camera, zoomed.target) < distance(orbited.camera, orbited.target))
  await page.mouse.down({ button: 'right' })
  await page.mouse.move(1230, 603, { steps: 8 })
  await page.mouse.up({ button: 'right' })
  await page.waitForFunction((target) => window.readSandboxState().target.some((coordinate, i) => Math.abs(coordinate - target[i]) > .6), zoomed.target)
  assert.equal((await read(page)).stats, undefined)
  await page.click('#reset')
  await page.waitForFunction((pose) => window.readSandboxState().camera.every((coordinate, i) => Math.abs(coordinate - pose[i]) < .04), campus.camera)
  await page.click('#zoom-in')
  assert.ok(distance((await read(page)).camera, campus.target) < distance(campus.camera, campus.target))
  await page.click('#zoom-out')
  await page.click('#overview')
  await page.waitForFunction(() => window.readSandboxState().camera[1] > 350)
  await page.click('#reset')
  await page.waitForFunction((pose) => window.readSandboxState().camera.every((coordinate, i) => Math.abs(coordinate - pose[i]) < .04), campus.camera)
  await page.click('[data-landmark="engineering"]')
  await page.waitForFunction(() => {
    const { camera, target } = window.readSandboxState()
    return Math.hypot(...camera.map((value, i) => value - target[i])) < 43
  })
  assert.deepEqual(await page.locator('.landmark-specs strong').allTextContents(), ['9 层 · 42.3 米', '10 层 · 46.8 米'])
  assert.equal(await page.locator('.landmark-source').getAttribute('href'), 'https://aa.sustech.edu.cn/news/detail/27.html')
  await page.click('#language')
  assert.equal(await page.locator('#landmark-info h2').textContent(), 'College of Engineering')
  assert.deepEqual(await page.locator('.landmark-specs strong').allTextContents(), ['9 floors · 42.3 m', '10 floors · 46.8 m'])
  await page.click('#language')
  await page.click('[data-landmark="lynn"]')
  assert.equal(await page.locator('.landmark-specs strong').textContent(), '3 层')
  await page.waitForTimeout(660)
  await shot(page, 'sustech-lynn-library')
  await page.click('[data-landmark="humanities"]')
  assert.equal(await page.locator('#landmark-info h2').textContent(), '人文社会科学学院')
  report('Campus orbit, zoom, pan, overhead view, camera reset and close-ups work. Published dimensions and landmarks translate in place.')

  await page.click('#sandbox-tab')
  await ready(page, 'sandbox')
  const initial = await read(page)
  assert.equal(initial.selected, 'canister')
  assert.deepEqual(initial.stats, {
    intact: 12, damaged: 0, collapsing: 0, ruined: 0, total: 12, fragments: 0, moving: 0,
    collisions: 0, scars: 0, particles: 0, impacts: 0, pending: 0, parachuting: 0, landed: 0,
  })
  assert.equal(initial.openParachutes, 0)
  assert.equal(await page.locator('.tool-dock button:visible').count(), 3)
  assert.equal(await page.locator('#landmark-panel:visible, #overview:visible').count(), 0)
  assert.equal(initial.buildings, undefined)
  await shot(page, 'film-backlot')

  await page.click('#language')
  assert.equal(await page.locator('html').getAttribute('lang'), 'en-US')
  assert.equal(await page.locator('h1:visible').textContent(), 'Campus Backlot')
  assert.deepEqual(await page.locator('.tool-copy strong').allTextContents(), ['Flash Canister', 'Pyro Crate', 'Firecloud Core'])
  const canFullscreen = await page.evaluate(() => (document.fullscreenEnabled && !!document.documentElement.requestFullscreen) || !!document.documentElement.webkitRequestFullscreen)
  await page.click('#fullscreen')
  if (canFullscreen) {
    await page.waitForFunction(() => !!(document.fullscreenElement || document.webkitFullscreenElement))
    await page.click('#fullscreen')
    await page.waitForFunction(() => !(document.fullscreenElement || document.webkitFullscreenElement))
  } else {
    assert.equal(await page.locator('#toast').textContent(), 'Fullscreen is unavailable in this browser.')
  }
  for (const quality of ['low', 'medium', 'high']) {
    await page.selectOption('#quality', quality)
    assert.equal((await read(page)).quality, quality)
  }
  report(`English translation, three graphics presets and ${canFullscreen ? 'native fullscreen' : 'the fullscreen fallback'} work.`)

  if (await page.locator('#sound').isEnabled()) {
    await page.click('#rebuild')
    await page.waitForFunction(() => (window.soundMeter?.() ?? 0) > .003, undefined, { polling: 20, timeout: 5000 })
    await page.click('#sound')
    await page.waitForFunction(() => (window.soundMeter?.() ?? 1) < .0005)
    await page.click('#rebuild')
    await page.waitForTimeout(180)
    assert.ok(await page.evaluate(() => window.soundMeter() < .0005))
    report('The Web Audio output produces a measurable signal and the sound switch mutes playback.')
  } else {
    assert.equal(await page.locator('#sound').getAttribute('aria-label'), 'Sound is unavailable in this browser')
    report('The sound control indicates that this test browser lacks Web Audio.')
  }
  await page.click('#language')
  assert.equal(await page.locator('html').getAttribute('lang'), 'zh-CN')
  assert.deepEqual(await page.locator('.tool-copy strong').allTextContents(), ['闪焰筒', '烟火箱', '焰云核心'])
  await page.click('#zoom-in')

  const effects = []
  const ruins = []
  const frames = new Set()
  const motion = []
  for (const [tool, seconds] of tools) {
    await page.click('#rebuild')
    await page.keyboard.press(String(tools.findIndex(([name]) => name === tool) + 1))
    assert.equal(await toolButton(page, tool).getAttribute('aria-pressed'), 'true')
    const before = await page.evaluate(() => performance.now())
    await clickTarget(page)
    const airborne = await read(page)
    assert.equal(airborne.drops[0]?.tool, tool)
    assert.equal(airborne.drops[0]?.structure, 0)
    assert.ok(airborne.drops[0].height > 3)
    assert.equal(airborne.stats.impacts + airborne.stats.fragments + airborne.stats.scars, 0)
    assert.equal(airborne.stats.parachuting + airborne.stats.landed, 0)
    const cooldown = airborne.readyAt[tool] - before
    assert.ok(cooldown >= seconds * 1000 && cooldown < seconds * 1000 + 600, `Unexpected ${tool} cooldown: ${cooldown} ms`)
    for (const [other] of tools) {
      if (other !== tool) assert.equal(airborne.readyAt[other], 0)
    }
    assert.equal(await cooling(page, tool), true)
    const progress = await toolButton(page, tool).evaluate((button) => Number(button.style.getPropertyValue('--progress')))
    assert.ok(progress >= 0 && progress < 1)
    await clickTarget(page)
    assert.equal((await read(page)).readyAt[tool], airborne.readyAt[tool])
    assert.equal(await page.locator('#toast').textContent(), '冷却中')

    const frame = await page.waitForFunction((name) => {
      const state = window.readSandboxState()
      const drop = state.drops.find((item) => item.tool === name)
      return drop && drop.progress > .40 && { ratio: drop.height, impacts: state.stats.impacts }
    }, tool)
    const midair = await frame.jsonValue()
    assert.equal(midair.impacts, 0)
    motion.push(midair.ratio / airborne.drops[0].height)
    const damagedFrame = page.waitForFunction((name) => {
      const state = window.readSandboxState()
      return state.lastImpact === name && state.stats.damaged > 0 && state.stats.fragments === 0
    }, tool)
    frames.add(await shot(page, `${tool}-drop`))
    await damagedFrame
    await waitForContact(page, tool)
    await page.waitForFunction(() => {
      const state = window.readSandboxState()
      return state.stats.collisions > 0 && state.groundOffset < -.30
    })
    const moved = await read(page)
    assert.ok(moved.stats.intact < initial.stats.intact)
    assert.equal(moved.stats.impacts, 1)
    assert.equal(moved.stats.scars, 1)
    assert.ok(moved.stats.particles > 15)
    assert.equal(moved.structureStages[0], 'collapsing')
    if (tool === 'core') {
      await page.waitForFunction(() => {
        const state = window.readSandboxState()
        return state.stats.collapsing > 0 && state.stats.fragments >= 28 && state.offset > 1
      })
    }
    frames.add(await shot(page, `${tool}-impact`))
    await page.waitForFunction((count) => {
      const state = window.readSandboxState()
      return state.stats.ruined >= count && state.openParachutes >= count && state.stats.landed === 0
    }, tool === 'core' ? 3 : 1)
    await page.getByText('卡通角色正在伞降', { exact: true }).waitFor()
    if (tool === 'core') await shot(page, 'film-backlot-parachutes')
    await page.waitForFunction(() => {
      const { stats } = window.readSandboxState()
      return stats.parachuting === 0 && stats.landed === stats.ruined && stats.landed > 0
    })
    await page.waitForFunction(() => Number(document.querySelector('#landed').textContent) > 0)
    await page.waitForFunction(() => window.readSandboxState().stats.particles === 0)
    const aftermath = await read(page)
    assert.equal(aftermath.landingsClear, true)
    assert.equal(aftermath.structureStages[0], 'ruined')
    assert.ok(aftermath.stats.ruined >= minimumRuins[tool], `Expected at least ${minimumRuins[tool]} ruined sets for ${tool}`)
    assert.ok(aftermath.stats.fragments > previousFragments[tool])
    assert.ok(aftermath.stats.fragments >= moved.stats.fragments)
    assert.equal(aftermath.stats.scars, 1)
    assert.equal(aftermath.stats.impacts, 1)
    assert.ok(aftermath.groundOffset < -.4)
    assert.ok(aftermath.offset > .5 && aftermath.tilt > .1)
    effects.push(aftermath.stats.fragments)
    ruins.push(aftermath.stats.ruined)
    if (tool === 'canister') {
      assert.ok(aftermath.roofDrop > 2.4, `Expected the roof panels to settle below the former top floor, received ${aftermath.roofDrop}`)
      await shot(page, 'film-backlot-canister')
    }
    if (tool === 'core') await shot(page, 'film-backlot-ruins')
    report(`${tool}: ${aftermath.stats.ruined} ruined sets, ${aftermath.stats.fragments} released modules, ${aftermath.stats.landed} parachute landings.`)
  }
  assert.equal(frames.size, 6)
  assert.ok(effects[0] < effects[1] && effects[1] < effects[2])
  assert.ok(ruins[0] < ruins[1] && ruins[1] < ruins[2])
  assert.ok(motion[1] < motion[0] && motion[0] < motion[2], `Unexpected descent profiles: ${motion}`)
  report('The three flight shapes, impact frames, motion profiles and effect tiers differ.')
  await page.waitForFunction((names) => names.every((name) => !document.querySelector(`#tool-${name}`).classList.contains('is-cooling')), tools.map(([name]) => name))
  report('Independent 1, 5 and 15 second cooldowns prevent repeats and return to ready.')

  await page.click('#rebuild')
  const rebuilt = await read(page)
  assert.deepEqual(rebuilt.stats, initial.stats)
  assert.deepEqual(rebuilt.readyAt, clockReset)
  assert.equal(rebuilt.selected, 'canister')
  assert.equal(rebuilt.groundOffset, 0)
  assert.equal(rebuilt.openParachutes, 0)
  assert.deepEqual(rebuilt.drops, [])

  await clickTarget(page, 'edgeScreen')
  assert.equal((await read(page)).drops[0]?.structure, 7)
  await page.waitForFunction(() => window.readSandboxState().structureStages[7] === 'ruined')
  assert.equal((await read(page)).structureStages[0], 'intact')
  await page.click('#rebuild')
  assert.deepEqual((await read(page)).stats, initial.stats)
  report('A canister hit on a pitched roof at the edge of the backlot collapses the selected building.')

  await toolButton(page, 'core').click()
  await clickTarget(page, 'terrainScreen')
  await page.waitForFunction(() => window.readSandboxState().groundOffset < -1)
  await page.waitForFunction(() => window.readSandboxState().openParachutes > 0)
  await page.waitForFunction(() => window.readSandboxState().stats.particles < 40)
  await shot(page, 'film-backlot-terrain')
  assert.equal((await read(page)).stats.scars, 1)
  await page.click('#rebuild')
  assert.deepEqual((await read(page)).stats, initial.stats)
  assert.equal(await page.locator('#landing-count').isHidden(), true)
  await toolButton(page, 'core').click()
  await clickTarget(page, 'terrainScreen')
  assert.ok((await read(page)).stats.pending > 0)
  await page.click('#rebuild')
  await page.waitForTimeout(1800)
  assert.deepEqual((await read(page)).stats, initial.stats)
  assert.deepEqual((await read(page)).readyAt, clockReset)
  report('A ground drop leaves a persistent scar and animated depression. Rebuild restores the scene and cancels an unfinished drop.')

  await toolButton(page, 'core').click()
  await clickTarget(page)
  await page.click('#campus-tab')
  await ready(page, 'campus')
  assert.equal((await read(page)).stats, undefined)
  assert.deepEqual((await read(page)).memory, campus.memory)
  await page.click('#sandbox-tab')
  await ready(page, 'sandbox')
  assert.deepEqual((await read(page)).stats, initial.stats)
  assert.deepEqual((await read(page)).readyAt, clockReset)
  report('Leaving mid-drop disposes the set. Returning to campus restores its render resources and returning to the backlot starts a fresh world.')

  const baseline = await frameSample(page, 48)
  const stressed = frameSample(page, 155)
  await rapidDrops(page)
  const active = await stressed
  const warmed = (await read(page)).memory
  await page.click('#rebuild')
  await rapidDrops(page)
  assert.deepEqual((await read(page)).memory, warmed)
  await page.click('#rebuild')
  assert.deepEqual((await read(page)).stats, initial.stats)
  report(`Two rounds of overlapping drops keep resources stable at ${warmed.geometries} geometries and ${warmed.textures} textures. Frame time baseline ${baseline.mean}/${baseline.p95} ms, during overlapping effects ${active.mean}/${active.p95} ms (mean/p95).`)

  await page.click('#language')
  await page.selectOption('#quality', 'medium')
  await page.reload({ waitUntil: 'domcontentloaded' })
  await ready(page, 'sandbox')
  const preferences = await read(page)
  assert.equal(preferences.language, 'en-US')
  assert.equal(preferences.quality, 'medium')
  assert.equal(preferences.sound, false)
  report('Language, graphics and sound settings persist after reload.')
  await context.close()

  const direct = await browser.newPage()
  track(direct)
  const directAssets = new Set()
  direct.on('response', (response) => directAssets.add(new URL(response.url()).pathname))
  await direct.goto(`${url}#sandbox`, { waitUntil: 'domcontentloaded' })
  await ready(direct, 'sandbox')
  assert.ok([...directAssets].some((path) => path.includes('/playground-')))
  assert.ok([...directAssets].every((path) => !path.includes('/campus-')))
  await direct.close()
  report('The backlot deep link loads without the campus data chunk.')

  const mobileOptions = engine === 'webkit' ? { ...devices['iPhone 15'], deviceScaleFactor: 1 }
    : { viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true }
  const mobileContext = await browser.newContext(mobileOptions)
  const mobile = await mobileContext.newPage()
  track(mobile)
  await mobile.goto(url, { waitUntil: 'domcontentloaded' })
  await ready(mobile, 'campus')
  await shot(mobile, 'sustech-campus-mobile')
  await mobile.tap('#landmark-toggle')
  await mobile.tap('[data-landmark="lynn"]')
  assert.equal(await mobile.locator('#landmark-info h2').textContent(), '琳恩图书馆')
  await mobile.tap('#sandbox-tab')
  await ready(mobile, 'sandbox')
  await shot(mobile, 'film-backlot-mobile')
  await mobile.tap('#tool-crate')
  assert.equal((await read(mobile)).selected, 'crate')
  const target = (await read(mobile)).structureScreen
  await mobile.touchscreen.tap(...target)
  assert.equal((await read(mobile)).drops[0]?.tool, 'crate')
  await waitForContact(mobile, 'crate')
  const { width, height } = mobileOptions.viewport
  assert.equal(await mobile.evaluate(() => document.documentElement.scrollWidth), width)
  await mobile.setViewportSize({ width: height, height: width })
  await mobile.waitForFunction(() => {
    const dock = document.querySelector('.tool-dock').getBoundingClientRect()
    const controls = document.querySelector('.camera-actions').getBoundingClientRect()
    return dock.width > 0 && dock.left >= 0 && dock.right <= innerWidth && dock.bottom <= innerHeight
      && controls.right <= innerWidth && controls.bottom <= innerHeight
  })
  await mobile.tap('#rebuild')
  assert.deepEqual((await read(mobile)).stats, initial.stats)
  await mobileContext.close()
  report(`${engine} at ${width} px supports touch drops, landscape controls and rebuild.`)
  assert.deepEqual(issues, [])
  report('No page exceptions, console errors or failed asset requests.')
} finally {
  await browser?.close()
  server.close()
}
