# SUSTech 3D Sandbox

[简体中文](README.zh-CN.md) · [Campus Explorer](https://bruce666-ppp.github.io/SUSTech-3D-Sandbox/) · [Data and licenses](DATA-SOURCES.md)

## Campus Explorer

The opening scene is a stylized model of Southern University of Science and Technology in Shenzhen. OpenStreetMap provides the site plan, and Copernicus GLO-30 provides the underlying terrain. It includes 113 mapped building outlines, the road and path network, water, sports grounds and 15 bilingual landmarks. Select a landmark to move the camera closer and view its name, description and available published dimensions.

![The SUSTech campus with mapped water, buildings, roads, terrain and landmarks](docs/screenshots/sustech-campus.png)

Selected buildings have recognizable exterior details, including Lynn Library’s triangular skylights and lattice, the Engineering buildings’ courtyards, Yidan Library’s glass frontage and the Humanities precinct’s pitched roofs. Exterior details and many heights are visual approximations. The source notes document the data coverage and terrain grading. [Lynn Library close-up](docs/screenshots/sustech-lynn-library.png) · [Data and model notes](DATA-SOURCES.md)

## Controls

| Input | Action |
| --- | --- |
| Left drag or one finger | Orbit |
| Mouse wheel or pinch | Zoom |
| Right drag or two-finger drag | Pan |
| Landmark button or map pin | Inspect a campus landmark |

The top bar switches language and graphics quality, toggles sound and opens fullscreen where available. The lower-right controls reset the camera and open an overhead view. Preferences are saved locally.

## Run and verify

Use Node.js 22.12 or newer and a WebGL 2 browser. The Pages workflow uses Node.js 24.

```sh
npm ci
npm run dev
```

```sh
npm run build
npm run preview
```

The browser tests serve the production build under `/SUSTech-3D-Sandbox/`. They exercise landmarks, camera controls, preferences and simulated mobile touch. Set `SUSTECH_CHROME_PATH` to run an installed Chrome binary. Set `SUSTECH_SOFTWARE_GL=1` to run the Chromium test with SwiftShader.

```sh
npx playwright install chromium webkit
npm run test:browser
npm run test:browser -- webkit
```

The campus uses Three.js and OrbitControls. The GitHub Actions workflow builds and deploys `dist/` from `main`, with relative URLs for Pages.
