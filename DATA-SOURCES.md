# Campus data and permissions

The scene covers the campus and its immediate terrain in Shenzhen, from 113.9882° E to 114.0072° E and 22.5934° N to 22.61345° N.

| Source | Use and permission |
| --- | --- |
| [OpenStreetMap contributors](https://www.openstreetmap.org/copyright) | Campus outline, mapped building footprints and levels, named places, roads, trails, waterways, parks and sports surfaces. `src/data/osm-campus.json` is an adapted database under the [Open Database License 1.0](https://opendatacommons.org/licenses/odbl/1-0/). The scene displays attribution. The extract omits mapper account metadata and unrelated tags. |
| [Copernicus GLO-30](https://dataspace.copernicus.eu/explore-data/data-collections/copernicus-contributing-missions/collections-description/COP-DEM) | Elevation surface from the public 30 m COG tiles hosted in the [AWS Open Data Registry](https://registry.opendata.aws/copernicus-dem/), tile IDs `N22_00_E113_00` and `N22_00_E114_00`. The adapted grid in `src/data/elevation.json` remains subject to the [GLO-30 free and open license](https://documentation.dataspace.copernicus.eu/APIs/SentinelHub/Data/DEM/resources/license/License-COPDEM-30.pdf). See the [attribution notice](public/data-notices.txt). |
| [SUSTech campus map](https://www.sustech.edu.cn/uploads/files/2024/05/27151839_42755.pdf), [General Affairs Office](https://gao.sustech.edu.cn/campus.html?lang=zh-cn), [University Library](https://lib.sustech.edu.cn/) | Reference for names, building functions, landscape and campus districts. The campus diagram, university photos, logo and text are outside the distributed assets. |
| [Architecturestudio Phase II project description](https://www.gooood.cn/en/south-university-of-science-and-technology-campus-phase-ii-project-architecturestudio.htm) | Visual reference for courtyard organization, roof profiles and the rhythm of the façades. The architecture photographs and drawings are outside the distributed assets. |

## How the scene was built

The extraction script projects the vector features into local east–south display coordinates. It samples the DEM on a 76 × 84 grid, spanning 22.6–145.5 m over the display area. Rendering interpolates that surface and applies a 1.32× vertical scale. The DEM is a digital **surface** model, so it can include canopy and roof elevations. Water and sports surfaces receive local visual grading. The basemap and elevation grid are bundled, which keeps runtime exploration independent of map services.

The scene includes 113 mapped building outlines. Where available, OSM height or level tags inform volume. The other heights, the three School of Medicine volumes, façades, rooftop details, planting and sporting structures are architectural approximations. Large complex footprints and water multipolygons are simplified. The view is intended for campus orientation and demonstration, with location and dimensions appropriate to that use. It omits building interiors, survey-grade coordinates and live construction updates.

The fictional arena has an original layout and its own terrain, structures, materials and effects. Web Audio synthesizes every sound. The MIT license applies to original code and assets. Third-party packages and geographic data retain their respective licenses.

## Regenerate the local data

The checked-in JSON files are ready to use. To update them, download the same region and tiles, then run the extraction script with those three files.

- OSM extract. [XML bounding-box export](https://api.openstreetmap.org/api/0.6/map?bbox=113.980,22.591,114.010,22.617)
- Copernicus western tile. [E113 COG](https://copernicus-dem-30m.s3.amazonaws.com/Copernicus_DSM_COG_10_N22_00_E113_00_DEM/Copernicus_DSM_COG_10_N22_00_E113_00_DEM.tif)
- Copernicus eastern tile. [E114 COG](https://copernicus-dem-30m.s3.amazonaws.com/Copernicus_DSM_COG_10_N22_00_E114_00_DEM/Copernicus_DSM_COG_10_N22_00_E114_00_DEM.tif)

```sh
npm run data:campus -- path/to/campus.osm path/to/E113.tif path/to/E114.tif
```
