# 南科大 3D 沙盒

[English](README.md) · [校园探索](https://bruce666-ppp.github.io/SUSTech-3D-Sandbox/) · [数据来源和授权](DATA-SOURCES.md)

## 校园探索

首页是深圳南方科技大学的风格化三维校园。建筑和道路采用 OpenStreetMap 数据，山体采用 Copernicus GLO-30 高程。场景包含 113 个测绘建筑轮廓、道路、水体、运动场及 15 个双语地标。点选地标可移动镜头，查看介绍及已有公开资料。

![依据公开地理数据绘制的南科大全景](docs/screenshots/sustech-campus.png)

重点建筑绘制了琳恩图书馆的三角天窗和格栅、工学院的庭院、一丹图书馆的玻璃幕墙及人文社科学院的坡屋顶。部分外观和楼高采用美术近似，数据覆盖和地表处理见来源说明。 [琳恩图书馆近景](docs/screenshots/sustech-lynn-library.png) · [数据和建模说明](DATA-SOURCES.md)

## 操作

| 输入 | 功能 |
| --- | --- |
| 左键拖动或单指拖动 | 旋转 |
| 滚轮或双指捏合 | 缩放 |
| 右键拖动或双指拖动 | 平移 |
| 地标列表或地图标记 | 查看校园地点 |

顶部可切换语言、画质、音效和全屏。右下角提供重置镜头和俯瞰校园。偏好保存在浏览器。

## 运行与验证

使用 Node.js 22.12 或更新版本和支持 WebGL 2 的浏览器。Pages 工作流使用 Node.js 24。

```sh
npm ci
npm run dev
```

```sh
npm run build
npm run preview
```

验收脚本在 `/SUSTech-3D-Sandbox/` 子路径托管生产文件，验证地标、镜头、偏好设置和移动触控模拟。可设置 `SUSTECH_CHROME_PATH` 运行已安装的 Chrome，或设置 `SUSTECH_SOFTWARE_GL=1` 运行 Chromium SwiftShader 测试。

```sh
npx playwright install chromium webkit
npm run test:browser
npm run test:browser -- webkit
```

校园场景使用 Three.js 和 OrbitControls。GitHub Actions 从 `main` 构建并发布 `dist/`，Pages 使用相对资源路径。
