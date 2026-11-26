# SUSTech 3D Sandbox

[简体中文](README.zh-CN.md) · [Play on GitHub Pages](https://bruce666-ppp.github.io/SUSTech-3D-Sandbox/) · [Scene assets and licenses](DATA-SOURCES.md)

Explore Mistridge Campus, a fictional mountain-campus miniature with lakeside paths, a running track, wooded ridges and 16 modular buildings. Pick a tool in the bottom dock and click or tap the scene. The tool appears in the air and follows a short animation to the marked spot before the impact begins.

![Mistridge Campus with the three drop tools in the bottom dock](docs/screenshots/mistridge-campus.png)

| Key | Tool | Cooldown | Effect |
| --- | --- | --- | --- |
| `1` | Impact Orb ★ | 1 s | Tumbling amber sphere, sparks and a short dust ring |
| `2` | Energy Pod ★★★ | 5 s | Braking cyan capsule, a vertical flare and hexagonal waves |
| `3` | Mega Core ★★★★★ | 15 s | Purple core with rotating bands, layered waves and a longer dust plume |

Buildings separate into colliding sections that retain their windows and roof details. Rubble and terrain marks persist after particles fade. **Rebuild** restores the buildings, terrain and cooldowns, and cancels active drops. **Reset camera** returns to the opening view.

| Input | Action |
| --- | --- |
| Left drag or one finger | Orbit |
| Mouse wheel or pinch | Zoom |
| Right drag or two-finger drag | Pan |
| Click or tap the scene | Drop the selected tool |

The top bar switches between Simplified Chinese and English, toggles sound, sets render quality and opens fullscreen where supported. Language, quality and sound settings are saved locally.

[Airborne Mega Core](docs/screenshots/mistridge-drop.png) · [Buildings in motion](docs/screenshots/mistridge-collapse.png) · [Persistent terrain mark](docs/screenshots/mistridge-terrain.png)

## Run locally

Use Node.js 22.12 or newer and a WebGL 2 browser. GitHub Actions uses Node.js 24.

```sh
npm ci
npm run dev
```

```sh
npm run build
npm run preview
```

The browser tests serve the production files under `/SUSTech-3D-Sandbox/` and exercise desktop input and simulated mobile touch. Set `SUSTECH_CHROME_PATH` to use an installed Chrome binary. Set `SUSTECH_SOFTWARE_GL=1` to use Chromium SwiftShader.

```sh
npx playwright install chromium webkit
npm run test:browser
npm run test:browser -- webkit
```

## Architecture and deployment

Vite builds a static TypeScript app. Three.js renders the locally modeled terrain and instanced buildings. Rapier runs the fixed-step rigid-body simulation in `src/playground.ts`. `src/descent.ts`, `src/effects.ts` and `src/audio.ts` coordinate the drop sequence, reusable visual effects and synthesized audio. `src/landscape.ts` creates terrain marks from preset shapes. Quality presets control resolution, shadows and effect density.

The existing Pages workflow builds and deploys `dist/` from `main`. Under **Settings → Pages**, the publishing source is **GitHub Actions**. Vite uses relative asset paths for both the repository subpath and a static server root.
