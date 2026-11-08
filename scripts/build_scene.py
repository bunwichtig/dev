"""Baut aus den Rohdaten (data/<region>/raster + overture) ein kompaktes Szenenpaket für die Mockups:
   mockups/data/scene.json  (Höhengitter, Gebäude, Straßen, Bäume)
   mockups/data/landuse.png (Kategorie-Raster, 8 bit, ein Wert pro Kategorie, siehe CATEGORIES)
Koordinaten: lokale Meter (UTM32, Ursprung = BBox-Mitte), x = Ost, y = Nord.
Aufruf: python scripts/build_scene.py <rohdaten> <ausgabe> <region.json>
  region.json: {"name": "...", "center": [lon, lat], "half_m": 1800,
                "marker": {"lonlat": [lon, lat], "label": "..."}, "views": {...optional}}
"""
import sys, os, json, math, numpy as np, rasterio
from rasterio.warp import reproject, Resampling
from rasterio.transform import from_origin
from rasterio.features import rasterize
from pyproj import Transformer
from shapely.geometry import shape, mapping, box
import warnings; warnings.filterwarnings("ignore")
from shapely.ops import transform as stransform
from PIL import Image

src, out, cfgf = sys.argv[1], sys.argv[2], sys.argv[3]
cfg = json.load(open(cfgf))
os.makedirs(out, exist_ok=True)
tr = Transformer.from_crs(4326, 25832, always_xy=True)
cx, cy = map(round, tr.transform(*cfg["center"]))
HALF = cfg.get("half_m", 1800)
minx, miny, maxx, maxy = cx - HALF, cy - HALF, cx + HALF, cy + HALF

# Kategorien (Index im PNG)
CATEGORIES = ["unbekannt", "wasser", "wald", "gebuesch", "wiese", "acker", "obst_garten", "park_sport",
              "wohnen", "gewerbe", "industrie", "fels", "bahn", "oeffentlich"]
C = {n: i for i, n in enumerate(CATEGORIES)}

def utm_rect(res):
    n = int(2 * HALF / res)
    return n, from_origin(minx, maxy, res, res)

# --- Höhe: Copernicus 30 m -> 10 m bilinear (UTM32)
N, T = utm_rect(10)
dem = np.zeros((N + 1, N + 1), np.float32)
with rasterio.open(f"{src}/raster/dem_copernicus_glo30.tif") as s:
    reproject(rasterio.band(s, 1), dem, dst_transform=from_origin(minx - 5, maxy + 5, 10, 10),
              dst_crs="EPSG:25832", resampling=Resampling.cubic)
from scipy.ndimage import gaussian_filter
dem = gaussian_filter(dem, 0.8)

# --- Landbedeckung 5 m: Basis ESA WorldCover, darüber Overture/OSM-Polygone
M, T5 = utm_rect(5)
wc = np.zeros((M, M), np.uint8)
with rasterio.open(f"{src}/raster/landcover_esa_worldcover_10m.tif") as s:
    reproject(rasterio.band(s, 1), wc, dst_transform=T5, dst_crs="EPSG:25832", resampling=Resampling.nearest)
WCMAP = {10: "wald", 20: "gebuesch", 30: "wiese", 40: "acker", 50: "wohnen", 60: "fels", 80: "wasser", 90: "wiese"}
cat = np.zeros((M, M), np.uint8)
for k, v in WCMAP.items(): cat[wc == k] = C[v]

def load(name):
    return json.load(open(f"{src}/overture/{name}.geojson"))["features"]

proj = lambda g: stransform(lambda x, y, z=None: tr.transform(x, y), g)
LU = {"residential": "wohnen", "commercial": "gewerbe", "retail": "gewerbe", "industrial": "industrie",
      "grass": "wiese", "meadow": "wiese", "farmland": "acker", "orchard": "obst_garten", "vineyard": "obst_garten",
      "allotments": "obst_garten", "garden": "park_sport", "park": "park_sport", "pitch": "park_sport",
      "playground": "park_sport", "cemetery": "park_sport", "school": "oeffentlich", "university": "oeffentlich",
      "hospital": "oeffentlich", "religious": "oeffentlich", "railway": "bahn", "forest": "wald",
      "recreation_ground": "park_sport", "sports_centre": "park_sport", "golf_course": "park_sport"}
LAND = {"forest": "wald", "wood": "wald", "scrub": "gebuesch", "grassland": "wiese", "grass": "wiese",
        "rock": "fels", "scree": "fels", "cliff": "fels", "bare_rock": "fels", "sand": "fels"}
shapes = []
for f in load("land_use"):
    k = LU.get(f["properties"].get("class")) or LU.get(f["properties"].get("subtype"))
    if k and f["geometry"]["type"] in ("Polygon", "MultiPolygon"): shapes.append((proj(shape(f["geometry"])), k, 1))
for f in load("land"):
    k = LAND.get(f["properties"].get("class"))
    if k and f["geometry"]["type"] in ("Polygon", "MultiPolygon"): shapes.append((proj(shape(f["geometry"])), k, 2))
for f in load("water"):
    if f["geometry"]["type"] in ("Polygon", "MultiPolygon"): shapes.append((proj(shape(f["geometry"])), "wasser", 3))
# große Flächen zuerst, damit kleine darüber liegen; Wasser zuletzt
shapes.sort(key=lambda s: (s[2] == 3, -s[0].area))
for g, k, _ in shapes:
    m = rasterize([(mapping(g), 1)], out_shape=(M, M), transform=T5, fill=0, dtype=np.uint8)
    cat[m == 1] = C[k]
Image.fromarray(cat, "L").save(f"{out}/landuse.png", optimize=True)

# --- Wasserspiegel je zusammenhängender Wasserfläche (Seen liegen auf unterschiedlicher Höhe)
from scipy.ndimage import label as cc_label, binary_opening
dem5 = np.zeros((M, M), np.float32)
with rasterio.open(f"{src}/raster/dem_copernicus_glo30.tif") as s_:
    reproject(rasterio.band(s_, 1), dem5, dst_transform=T5, dst_crs="EPSG:25832", resampling=Resampling.bilinear)
lab, nlab = cc_label(cat == C["wasser"])
sizes = np.bincount(lab.ravel())
order = [i for i in np.argsort(-sizes) if i != 0 and sizes[i] >= 4][:254]
wid = np.zeros((M, M), np.uint8); levels = [0.0]
for k, comp in enumerate(order, start=1):
    m = lab == comp
    wid[m] = k
    levels.append(round(float(np.percentile(dem5[m], 15)), 2))
Image.fromarray(wid, "L").save(f"{out}/water.png", optimize=True)

loc = lambda g: stransform(lambda x, y, z=None: (round(x - cx, 1), round(y - cy, 1)), proj(g))
clip = box(-HALF, -HALF, HALF, HALF)

def ground(x, y):
    c = (x + HALF) / 10 + 0.5; r = (HALF - y) / 10 + 0.5
    c = min(max(c, 0), N - 1e-3); r = min(max(r, 0), N - 1e-3)
    i, j = int(r), int(c); fy, fx = r - i, c - j
    return float(dem[i, j] * (1 - fx) * (1 - fy) + dem[i, j + 1] * fx * (1 - fy) + dem[i + 1, j] * (1 - fx) * fy + dem[i + 1, j + 1] * fx * fy)

# --- Gebäude
blds = []
for f in load("building"):
    g = loc(shape(f["geometry"]))
    if not g.intersects(clip): continue
    g = g.simplify(0.4)
    p = f["properties"]
    polys = [g] if g.geom_type == "Polygon" else list(getattr(g, "geoms", []))
    for pg in polys:
        if pg.geom_type != "Polygon" or pg.area < 6: continue
        h = p.get("height") or (p["num_floors"] * 3.0 + 1.5 if p.get("num_floors") else None)
        cls = p.get("class") or ""
        if not h:
            h = 3.0 if "garage" in cls or cls in ("shed", "roof", "carport") else (12.0 if cls in ("apartments", "school", "church") else 7.5)
        ring = list(pg.exterior.coords)[:-1]
        if not pg.exterior.is_ccw: ring = ring[::-1]
        base = min(ground(x, y) for x, y in ring)
        b = {"r": [v for xy in ring for v in xy], "h": round(h, 1), "b": round(base, 1), "c": cls}
        # Kandidat für Satteldach: nahezu rechteckig, kleines/mittleres Wohn-/Nebengebäude
        mrr = pg.minimum_rotated_rectangle
        roof = p.get("roof_shape")
        if (roof in (None, "gabled", "hipped") and pg.area < 450 and pg.area / mrr.area > 0.85
                and h < 14 and "garage" not in cls and roof != "flat"):
            q = list(mrr.exterior.coords)[:4]
            e1 = (q[1][0] - q[0][0], q[1][1] - q[0][1]); e2 = (q[2][0] - q[1][0], q[2][1] - q[1][1])
            l1, l2 = math.hypot(*e1), math.hypot(*e2)
            L, W, e = (l1, l2, e1) if l1 >= l2 else (l2, l1, e2)
            mx = sum(x for x, _ in q) / 4; my = sum(y for _, y in q) / 4
            b["g"] = [round(mx, 1), round(my, 1), round(L, 1), round(W, 1), round(math.atan2(e[1], e[0]), 3)]
        blds.append(b)

# --- Straßen & Bahn
ROADW = {"motorway": 12, "trunk": 10, "primary": 8, "secondary": 7, "tertiary": 6, "residential": 5,
         "living_street": 4, "unclassified": 4.5, "service": 3.5, "pedestrian": 4, "track": 2.5,
         "footway": 1.5, "path": 1.2, "cycleway": 2, "steps": 1.5, "standard_gauge": 4}
roads = []
for f in load("segment"):
    g = loc(shape(f["geometry"])).intersection(clip)
    if g.is_empty: continue
    p = f["properties"]; k = p.get("class", "")
    for ln in ([g] if g.geom_type == "LineString" else list(getattr(g, "geoms", []))):
        if ln.geom_type != "LineString": continue
        ln = ln.simplify(0.5).segmentize(10)
        roads.append({"p": [round(v, 1) for xy in ln.coords for v in xy[:2]], "c": k,
                      "s": p.get("subtype"), "w": ROADW.get(k, 3)})

# --- Einzelbäume aus OSM
trees = []
for f in load("land"):
    if f["properties"].get("class") == "tree" and f["geometry"]["type"] == "Point":
        g = loc(shape(f["geometry"]))
        if clip.contains(g): trees += [g.x, g.y]

scene = {
    "region": cfg["name"], "crs": "EPSG:25832", "origin_utm": [cx, cy],
    "size_m": 2 * HALF,
    "height": {"res": 10, "n": N + 1, "min": float(dem.min()), "max": float(dem.max()),
               "data": [round(float(v), 1) for v in dem.ravel()]},
    "landuse": {"res": 5, "n": M, "file": "landuse.png", "categories": CATEGORIES},
    "water": {"file": "water.png", "levels": levels},
    "marker": {"label": cfg["marker"]["label"],
               "xy": [round(a - b, 1) for a, b in zip(tr.transform(*cfg["marker"]["lonlat"]), (cx, cy))]},
    "views": cfg.get("views", {}),
    "buildings": blds, "roads": roads, "trees": trees,
    "attribution": "Höhe: Copernicus DEM GLO-30 © DLR e.V./Airbus, bereitgestellt unter COPERNICUS durch EU & ESA · "
                   "Landbedeckung: ESA WorldCover 2021 (CC BY 4.0) · Gebäude/Straßen/Landnutzung: Overture Maps "
                   "Foundation, enthält Daten © OpenStreetMap-Mitwirkende (ODbL)",
}
json.dump(scene, open(f"{out}/scene.json", "w"), separators=(",", ":"))
print(len(blds), "Gebäude,", len(roads), "Straßen,", len(trees) // 2, "Bäume; Höhe", dem.min(), dem.max())
