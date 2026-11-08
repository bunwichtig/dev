"""Schneidet Höhenmodell (Copernicus DEM GLO-30) und Landbedeckung (ESA WorldCover 10 m) auf eine BBox zu.

Beide Quellen liegen als Cloud-Optimized GeoTIFF in AWS Open Data, frei & anonym abrufbar.
Aufruf: python scripts/fetch_raster.py <minlon> <minlat> <maxlon> <maxlat> <outdir>
"""
import sys, os, math, rasterio
from rasterio.windows import from_bounds

def cop_dem_url(lat, lon):
    ns = f"N{abs(lat):02d}" if lat >= 0 else f"S{abs(lat):02d}"
    ew = f"E{abs(lon):03d}" if lon >= 0 else f"W{abs(lon):03d}"
    n = f"Copernicus_DSM_COG_10_{ns}_00_{ew}_00_DEM"
    return f"https://copernicus-dem-30m.s3.amazonaws.com/{n}/{n}.tif"

def worldcover_url(lat, lon):
    la, lo = 3 * math.floor(lat / 3), 3 * math.floor(lon / 3)
    ns = f"N{abs(la):02d}" if la >= 0 else f"S{abs(la):02d}"
    ew = f"E{abs(lo):03d}" if lo >= 0 else f"W{abs(lo):03d}"
    return f"https://esa-worldcover.s3.eu-central-1.amazonaws.com/v200/2021/map/ESA_WorldCover_10m_2021_v200_{ns}{ew}_Map.tif"

def clip(url, b, out):
    with rasterio.Env(GDAL_DISABLE_READDIR_ON_OPEN="EMPTY_DIR", CURL_CA_BUNDLE=os.environ.get("CURL_CA_BUNDLE", "/root/.ccr/ca-bundle.crt")):
        with rasterio.open("/vsicurl/" + url) as src:
            w = from_bounds(*b, transform=src.transform).round_offsets().round_lengths()
            a = src.read(1, window=w)
            prof = src.profile.copy()
            prof.update(width=a.shape[1], height=a.shape[0], transform=src.window_transform(w),
                        compress="deflate", tiled=False)
            prof.pop("blockxsize", None); prof.pop("blockysize", None)
            with rasterio.open(out, "w", **prof) as dst:
                dst.write(a, 1)
    print(out, a.shape, a.min(), a.max())

if __name__ == "__main__":
    minx, miny, maxx, maxy = map(float, sys.argv[1:5]); od = sys.argv[5]
    os.makedirs(od, exist_ok=True)
    b = (minx, miny, maxx, maxy)
    clip(cop_dem_url(math.floor(miny), math.floor(minx)), b, os.path.join(od, "dem_copernicus_glo30.tif"))
    clip(worldcover_url(miny, minx), b, os.path.join(od, "landcover_esa_worldcover_10m.tif"))
