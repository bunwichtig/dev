"""Lädt ein wolkenarmes Sentinel-2-Echtfarbbild (L2A, 10 m, TCI) für eine Region und schneidet es
auf das Szenenquadrat zu. Ergebnis: <ausgabe>/satellite.jpg (Nord oben, deckungsgleich mit landuse.png).

Quelle: Copernicus Sentinel-2 via AWS Open Data (s3://sentinel-cogs), frei nutzbar mit Quellenangabe
„Contains modified Copernicus Sentinel data <Jahr>“.
Aufruf: python scripts/fetch_sentinel2.py regions/pinnow.json mockups/data/pinnow [JJJJ]
"""
import sys, json, os, requests, concurrent.futures as cf, numpy as np, rasterio, mgrs
from rasterio.warp import reproject, Resampling
from rasterio.transform import from_origin
from pyproj import Transformer
from PIL import Image, ImageEnhance

B = "https://sentinel-cogs.s3.us-west-2.amazonaws.com/"
cfg = json.load(open(sys.argv[1])); out = sys.argv[2]; year = int(sys.argv[3]) if len(sys.argv) > 3 else 2025
lon, lat = cfg["center"]; HALF = cfg.get("half_m", 1800)
tile = mgrs.MGRS().toMGRS(lat, lon, MGRSPrecision=0)  # z. B. 32UPE
zone, band, sq = tile[:2], tile[2], tile[3:]

def listing(prefix):
    r = requests.get(B, params={"list-type": "2", "prefix": prefix, "delimiter": "/"}, timeout=60)
    import re; return re.findall(r"<Prefix>([^<]+)</Prefix>", r.text)[1:]

items = [p for m in range(5, 10) for p in listing(f"sentinel-s2-l2a-cogs/{zone}/{band}/{sq}/{year}/{m}/")]
def meta(p):
    iid = p.rstrip("/").split("/")[-1]
    try:
        pr = requests.get(B + p + iid + ".json", timeout=30).json()["properties"]
        return (pr.get("eo:cloud_cover", 100) + pr.get("s2:nodata_pixel_percentage", 0), iid, p)
    except Exception:
        return (999, iid, p)
with cf.ThreadPoolExecutor(12) as ex:
    best = sorted(ex.map(meta, items))
print("Kandidaten:", [b[:2] for b in best[:3]])
score, iid, p = best[int(os.environ.get("S2_PICK", 0))]

tr = Transformer.from_crs(4326, 25832, always_xy=True)
cx, cy = map(round, tr.transform(lon, lat))
RES = 2.5; N = int(2 * HALF / RES)
dst = np.zeros((3, N, N), np.uint8)
with rasterio.Env(GDAL_DISABLE_READDIR_ON_OPEN="EMPTY_DIR"):
    with rasterio.open("/vsicurl/" + B + p + "TCI.tif") as src:
        for b in range(3):
            reproject(rasterio.band(src, b + 1), dst[b], dst_transform=from_origin(cx - HALF, cy + HALF, RES, RES),
                      dst_crs="EPSG:25832", resampling=Resampling.cubic)
img = Image.fromarray(np.moveaxis(dst, 0, -1), "RGB")
img = ImageEnhance.Color(ImageEnhance.Brightness(img).enhance(1.12)).enhance(1.1)
os.makedirs(out, exist_ok=True)
img.save(f"{out}/satellite.jpg", quality=88)
json.dump({"scene": iid, "cloud_and_nodata_pct": round(score, 2), "res_m": 10,
           "attribution": f"Contains modified Copernicus Sentinel data {year} ({iid})"},
          open(f"{out}/satellite.json", "w"), ensure_ascii=False)
print("gespeichert:", iid, f"{out}/satellite.jpg", img.size)
