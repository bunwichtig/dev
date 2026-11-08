"""Lädt Overture-Maps-Daten (Gebäude, Landnutzung, Wasser, Straßen) für eine BBox als GeoJSON.

Quelle: Overture Maps Foundation, AWS Open Data (s3://overturemaps-us-west-2), anonym, kein Account.
Lizenz: ODbL 1.0 (OSM-abgeleitete Anteile) bzw. CDLA-Permissive-2.0 – siehe docs/DATENQUELLEN.md
Aufruf: python scripts/fetch_overture.py <minlon> <minlat> <maxlon> <maxlat> <outdir>
"""
import sys, json, os, pyarrow.dataset as ds, pyarrow.compute as pc, pyarrow.fs as pfs
from shapely import wkb
from shapely.geometry import mapping

RELEASE = os.environ.get("OVERTURE_RELEASE", "2026-10-21.0")
LAYERS = {  # theme/type -> Spalten
    "buildings/building": ["id", "height", "num_floors", "class", "subtype", "roof_shape"],
    "base/land_use": ["id", "class", "subtype"],
    "base/land": ["id", "class", "subtype"],
    "base/water": ["id", "class", "subtype"],
    "transportation/segment": ["id", "class", "subtype"],
}

def main(minx, miny, maxx, maxy, out):
    os.makedirs(out, exist_ok=True)
    proxy = os.environ.get("HTTPS_PROXY")
    kw = {}
    if proxy:
        h = proxy.split("://")[-1].rstrip("/"); host, port = h.rsplit(":", 1)
        kw["proxy_options"] = {"scheme": "http", "host": host, "port": int(port)}
    fs = pfs.S3FileSystem(anonymous=True, region="us-west-2", **kw)
    for key, cols in LAYERS.items():
        theme, typ = key.split("/")
        path = f"overturemaps-us-west-2/release/{RELEASE}/theme={theme}/type={typ}/"
        d = ds.dataset(path, filesystem=fs, format="parquet")
        names = d.schema.names
        cols = [c for c in cols if c in names]
        f = ((pc.field("bbox", "xmin") < maxx) & (pc.field("bbox", "xmax") > minx) &
             (pc.field("bbox", "ymin") < maxy) & (pc.field("bbox", "ymax") > miny))
        t = d.to_table(columns=cols + ["geometry"], filter=f)
        feats = []
        for row in t.to_pylist():
            g = wkb.loads(row.pop("geometry"))
            feats.append({"type": "Feature", "geometry": mapping(g),
                          "properties": {k: v for k, v in row.items() if v is not None}})
        fn = os.path.join(out, f"{typ}.geojson")
        json.dump({"type": "FeatureCollection", "features": feats}, open(fn, "w"))
        print(f"{key}: {len(feats)} Features -> {fn}", flush=True)

if __name__ == "__main__":
    a = sys.argv[1:]
    main(*map(float, a[:4]), a[4])
