# 南科大 3D 沙盒

[English](README.md) · [GitHub Pages 演示](https://bruce666-ppp.github.io/SUSTech-3D-Sandbox/) · [数据来源和授权](DATA-SOURCES.md)

从山地校园模型探索南方科技大学，也可切换到虚构的岚谷试验场体验三维物理效果。两个场景都可以直接在浏览器中使用。

![校园全景、山地地形与建筑地标](docs/screenshots/campus.png)

## 功能

- **校园探索。** 旋转查看校园全景，切换垂直俯瞰，或点选 14 个双语地标并飞近观察。模型以 113 个 OpenStreetMap 建筑轮廓和 Copernicus GLO-30 高程数据为基础，展示教学科研、学生生活、体育设施、水体和山坡绿化。
- **物理沙盒。** 使用工具栏或 `1`、`2`、`3` 选择手榴弹、导弹或核弹，点击虚构场景触发对应游戏特效。三种道具独立冷却，分别为 1、5、15 秒。建筑预分块后交给刚体引擎模拟碎片、重力和碰撞。重建场景会恢复建筑并清除物理及特效状态，正在运行的道具冷却时间继续计时。
- **显示和偏好。** 即时切换简体中文和 English，提供低、中、高三档画质、音效开关和全屏。语言、画质及音效偏好保存在本地。

![岚谷试验场内的光波、烟云和建筑碎片](docs/screenshots/sandbox-burst.png)

| 操作 | 功能 |
| --- | --- |
| 左键拖动或单指拖动 | 围绕场景旋转 |
| 滚轮或双指捏合 | 缩放 |
| 右键拖动或双指拖动 | 平移 |
| 点击校园标记或地标列表 | 查看资料并移动镜头 |
| 点击或触摸物理场景 | 使用已选道具 |
| `1`、`2`、`3` | 切换道具 |

## 本地运行

使用 Node.js 22.12 或更新版本，以及支持 WebGL 2 的浏览器。GitHub Actions 使用 Node.js 24。

```sh
npm ci
npm run dev
```

构建并预览生产版。

```sh
npm run build
npm run preview
```

浏览器验收脚本会在 `/SUSTech-3D-Sandbox/` 子路径托管生产文件，检查桌面操作与移动触控。可设置 `SUSTECH_CHROME_PATH` 使用已安装的 Chrome，或设置 `SUSTECH_SOFTWARE_GL=1` 使用 Chromium 的 SwiftShader 测试配置。

```sh
npx playwright install chromium
npm run test:browser
```

## 技术架构与部署

Vite 构建静态 TypeScript 应用。Three.js 在两个按需加载的场景间共享渲染器和镜头控制器。`src/campus.ts` 生成地形、道路、建筑和地标。`src/sandbox.ts` 管理 Rapier 固定步长刚体模拟。`src/effects.ts` 复用粒子缓冲区，`src/audio.ts` 使用 Web Audio 合成音效，`src/i18n.ts` 管理双语字典和偏好。切换时释放上一场景的资源。画质档位控制分辨率、阴影和粒子密度，持续低帧率会触发渲染分辨率下调。

GitHub Actions 工作流在 `main` 分支上构建并部署 `dist/`。仓库 **Settings → Pages** 的发布方式为 **GitHub Actions**。Vite 使用相对资源路径，兼容仓库子路径和静态服务器根路径。演示地址在首次成功部署后生效。

[校园建筑近景](docs/screenshots/campus-detail.png) · [岚谷试验场全景](docs/screenshots/sandbox.png)

建筑立面、屋顶、部分高度、绿化及医学院体量采用近似表达。[数据来源和授权](DATA-SOURCES.md)记录了原始数据、处理方法和覆盖限制。原创代码采用 MIT 许可证，地图和高程数据沿用各自的数据许可。
