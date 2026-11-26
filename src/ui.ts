import { icon } from './icons'
import { toolOrder, tools } from './world'

export const shell = `
  <header class="bar">
    <div class="brand">
      <div class="brand-mark">${icon('logo', 25)}</div>
      <div class="brand-copy"><strong data-text="title"></strong><span data-text="subtitle"></span></div>
    </div>
    <nav class="modes" data-label="modes">
      <button class="mode" id="campus-tab" type="button" aria-pressed="true">${icon('map', 17)}<span data-text="campus"></span></button>
      <button class="mode" id="sandbox-tab" type="button" aria-pressed="false">${icon('spark', 17)}<span data-text="sandbox"></span></button>
    </nav>
    <div class="bar-actions">
      <button id="language" class="top-button language" type="button">${icon('globe', 17)}<span id="language-short">EN</span></button>
      <button id="sound" class="top-button icon-only" type="button"></button>
      <label class="quality" for="quality" data-title="quality">
        ${icon('sliders', 17)}<select id="quality" data-label="quality">
          <option value="low" data-text="low"></option><option value="medium" data-text="medium"></option><option value="high" data-text="high"></option>
        </select>${icon('chevron', 12)}
      </label>
      <button id="fullscreen" class="top-button icon-only" type="button"></button>
    </div>
  </header>
  <main id="viewport" aria-busy="true">
    <div class="map-grid" aria-hidden="true"></div>
    <canvas id="scene" data-label="scene" tabindex="0"></canvas>
    <div id="map-labels" class="map-labels" data-campus></div>
    <aside class="side" data-campus>
      <section class="location-panel panel">
        <div class="world-label">${icon('map', 15)}<span data-text="campusLabel"></span></div>
        <h1 data-text="campusTitle"></h1>
        <p class="location">${icon('pin', 15)}<span data-text="location"></span></p>
        <dl class="metrics">
          <div><dt data-text="footprints"></dt><dd id="buildings">–</dd></div>
          <div><dt data-text="elevation"></dt><dd id="elevation">–</dd></div>
        </dl>
      </section>
      <section class="landmarks panel" id="landmark-panel">
        <button class="landmark-heading" id="landmark-toggle" type="button" aria-controls="landmark-list" aria-expanded="false">
          ${icon('pin', 16)}<span data-text="landmarks"></span><span class="landmark-chevron">${icon('chevron', 15)}</span>
        </button>
        <div class="landmark-list" id="landmark-list"></div>
        <div class="landmark-info" id="landmark-info" hidden></div>
      </section>
    </aside>
    <aside class="side" data-sandbox>
      <section class="location-panel panel">
        <div class="world-label">${icon('cube', 15)}<span data-text="sandboxLabel"></span></div>
        <h1 data-text="sandboxTitle"></h1>
        <p class="drop-hint" id="drop-hint" data-text="dropHint"></p>
        <dl class="metrics">
          <div><dt data-text="structures"></dt><dd id="structures">–</dd></div>
          <div><dt data-text="fragments"></dt><dd id="fragments">0</dd></div>
        </dl>
        <div class="set-states" id="set-states" hidden>
          <span><i></i><span data-text="damaged"></span> <strong id="damaged">0</strong></span>
          <span><i></i><span data-text="collapsing"></span> <strong id="collapsing">0</strong></span>
          <span><i></i><span data-text="ruined"></span> <strong id="ruined">0</strong></span>
        </div>
      </section>
    </aside>
    <div class="camera-rail">
      <div class="compass panel" aria-hidden="true">
        <span class="north" data-text="north"></span><span class="south" data-text="south"></span>
        <span class="west" data-text="west"></span><span class="east" data-text="east"></span>
        <div id="needle" class="needle"><i></i><i></i></div>
      </div>
      <div class="zoom panel">
        <button id="zoom-in" data-title="zoomIn" data-label="zoomIn" type="button">${icon('plus', 17)}</button>
        <button id="zoom-out" data-title="zoomOut" data-label="zoomOut" type="button">${icon('minus', 17)}</button>
      </div>
    </div>
    <div class="tool-dock panel" data-sandbox data-label="tools" role="group">
      ${toolOrder.map((tool, index) => `
        <button class="tool" type="button" id="tool-${tool}" style="--tool-rgb: ${tools[tool].rgb}" aria-pressed="${index === 0}">
          <span class="tool-emblem">${icon(tools[tool].icon, 22)}</span>
          <span class="tool-copy"><strong data-text="${tool}"></strong><span class="tool-stars" aria-hidden="true">${'★'.repeat(tools[tool].stars)}</span><span class="tool-time"></span></span>
          <kbd>${index + 1}</kbd><span class="cooldown-bar" aria-hidden="true"></span>
        </button>`).join('')}
    </div>
    <div class="camera-actions">
      <button class="panel action" type="button" id="rebuild" data-sandbox>${icon('rebuild', 18)}<span data-text="rebuild"></span></button>
      <button class="panel action" type="button" id="overview" data-campus>${icon('top', 17)}<span data-text="overview"></span></button>
      <button class="panel action" type="button" id="reset">${icon('reset', 16)}<span data-text="reset"></span></button>
    </div>
    <div class="map-footer">
      <div class="controls panel">
        <div class="mouse-controls">${icon('mouse', 15)}<span data-text="drag"></span><i></i><span data-text="wheel"></span><i></i><span data-text="pan"></span></div>
        <div class="touch-controls">${icon('touch', 15)}<span data-text="touch"></span></div>
      </div>
      <div class="credits" data-campus>
        <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">© OpenStreetMap contributors</a>
        <span>·</span><a href="${import.meta.env.BASE_URL}data-notices.txt" target="_blank" rel="noopener" data-title="terrain">Copernicus GLO-30</a>
      </div>
    </div>
    <div id="toast" role="status" class="toast panel" hidden></div>
    <div id="scene-status" class="scene-status" role="status">
      <div class="load-graphic">${icon('logo', 31)}</div><p id="status-message"></p>
      <button class="action panel" id="retry" type="button" data-text="retry" hidden></button>
    </div>
  </main>
`
