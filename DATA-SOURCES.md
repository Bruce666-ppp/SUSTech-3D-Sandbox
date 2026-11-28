# 校园数据、建模与授权 · Campus data, modeling and licenses

## 数据来源 · Sources

| 数据或资料 · Source | 用途 · Use |
| --- | --- |
| [OpenStreetMap contributors](https://www.openstreetmap.org/copyright) | 建筑轮廓、道路、步道、水体、运动场与地标。衍生向量 `src/data/osm-campus.json` 沿用 [ODbL 1.0](https://opendatacommons.org/licenses/odbl/1-0/)。 Building outlines, roads, paths, water, sports grounds and places. |
| [Copernicus GLO-30](https://dataspace.copernicus.eu/explore-data/data-collections/copernicus-contributing-missions/collections-description/COP-DEM) | 公开 30 米数字表面模型。`src/data/elevation.json` 为本地采样，沿用 [GLO-30 数据许可](https://documentation.dataspace.copernicus.eu/APIs/SentinelHub/Data/DEM/resources/license/License-COPDEM-30.pdf)。 Public 30-metre surface elevation, sampled into a local grid. |
| [南科大校方校园地图 · Official campus map](https://www.sustech.edu.cn/uploads/files/2024/05/27151839_42755.pdf) | 校园空间关系、地标及功能分区参照。 Reference for campus layout, public landmarks and building uses. |
| [南科大工学院大楼启用资料 · Engineering buildings](https://aa.sustech.edu.cn/news/detail/27.html) | 南楼和北楼的庭院布局、楼层及公开高度。 Courtyard layouts, storeys and published heights for the two Engineering buildings. |
| [南科大图书馆资料 · Library spaces](https://lib.sustech.edu.cn/_upload/article/files/92/4e/491216e745daacdf9126b03f1390/ef2b6781-d204-4018-b72d-0fc8d6fdd50c.pdf) · [一丹图书馆启用资料 · Yidan Library opening](https://www.sustech.edu.cn/10th/news/39486.html) · [馆藏平台 · Lynn Library](https://media.lib.sustech.edu.cn/index.php?Language=341&a=lists&c=index&catid=36&header_id=1&keyword=&m=content&res_type=&res_type_new=470&years=) | 图书馆外观参考与公开楼层信息。 Reference imagery and storey counts for the libraries. |

## 模型范围 · Model coverage

校园场景使用 113 个映射建筑轮廓和 76 × 84 高程采样点。显示地形对纵向比例进行了 1.32 倍增强，并对水岸和运动场进行局部平整。工学院两栋楼使用公开高度。部分建筑的屋顶、立面、楼高及植被采用艺术化简化。医学院片区使用已测绘轮廓。场景用于观察校园布局和建筑外观。

The campus scene uses 113 mapped outlines and a 76 × 84 elevation grid. Vertical relief is scaled by 1.32, with visual grading around water and sports surfaces. Engineering uses published heights. Some roofs, façades, building heights and vegetation are stylized. The medical precinct uses mapped footprints. The scene represents the external campus layout.

影视试验场使用独立创作的虚构校园布局、影视道具和卡通角色。布景分块、特效强度和伞降轨迹采用游戏内预设。公开地理和高程数据只在校园探索入口加载。

The film backlot uses an original fictional campus layout, cinematic props and cartoon characters. Its modules, effect tiers and parachute animations use game presets. Public geographic and elevation data are loaded by the Campus Explorer entry point.

项目原创内容采用 [MIT 许可证](LICENSE)。运行时许可证与数据授权见 [Three.js](public/licenses/three.txt)、[Rapier](public/licenses/rapier.txt) 和 [数据版权说明](public/data-notices.txt)。 Original assets and code use the MIT license. Runtime and data notices are included with the project.

## 再生成数据 · Regenerate the data

使用同区域 OSM 导出和两块 Copernicus GeoTIFF 运行脚本。 Run the extractor with the matching OSM region and both Copernicus tiles.

- [OSM XML bounding-box export](https://api.openstreetmap.org/api/0.6/map?bbox=113.980,22.591,114.010,22.617)
- [Copernicus E113 COG](https://copernicus-dem-30m.s3.amazonaws.com/Copernicus_DSM_COG_10_N22_00_E113_00_DEM/Copernicus_DSM_COG_10_N22_00_E113_00_DEM.tif)
- [Copernicus E114 COG](https://copernicus-dem-30m.s3.amazonaws.com/Copernicus_DSM_COG_10_N22_00_E114_00_DEM/Copernicus_DSM_COG_10_N22_00_E114_00_DEM.tif)

```sh
npm run data:campus -- path/to/campus.osm path/to/E113.tif path/to/E114.tif
```
