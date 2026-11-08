"""Lädt AMTLICHE Geobasisdaten NRW (Lizenz: Datenlizenz Deutschland – Zero – 2.0, also lizenzfrei,
nicht einmal Namensnennung nötig) für eine BBox in EPSG:25832 (UTM32):

  * DGM1   – Digitales Geländemodell, 1 m Raster (GeoTIFF)
  * DOM1   – Digitales Oberflächenmodell, 1 m (inkl. Bäume/Gebäude)
  * LoD2   – 3D-Gebäudemodelle mit Dachformen (CityGML)
  * DOP10  – Digitale Orthophotos, 10 cm (JPEG2000) – optional, groß!

Kachelraster: 1 km × 1 km, Kachelname enthält Ost/Nord in km.
Quelle: https://www.opengeodata.nrw.de/produkte/geobasis/

HINWEIS: In der Cloud-Umgebung dieses Projekts war opengeodata.nrw.de per Netzwerkrichtlinie
gesperrt – das Skript ist für den lokalen Rechner gedacht (python3 + requests).

Aufruf: python scripts/fetch_nrw_amtlich.py 370 5613 374 5616 data/koenigswinter/nrw [--dop]
        (Ost-/Nord-Kilometer der linken unteren und rechten oberen Kachel)
"""
import sys, os, re, requests

BASE = "https://www.opengeodata.nrw.de/produkte/geobasis"
PRODUCTS = {
    "dgm1": f"{BASE}/hm/dgm1_tiff/dgm1_tiff/",
    "dom1": f"{BASE}/hm/dom1_tiff/dom1_tiff/",
    "lod2": f"{BASE}/3dg/lod2_gml/lod2_gml/",
    "dop10": f"{BASE}/lusat/akt/dop/dop_jp2_f10/",
}

def listing(url):
    """Liest die Dateinamen aus dem Verzeichnis (index.json, sonst HTML-Listing)."""
    r = requests.get(url + "index.json", timeout=60)
    if r.ok:
        try:
            j = r.json()
            names = []
            def walk(o):
                if isinstance(o, dict):
                    if "name" in o and isinstance(o["name"], str): names.append(o["name"])
                    for v in o.values(): walk(v)
                elif isinstance(o, list):
                    for v in o: walk(v)
            walk(j); return names
        except ValueError:
            pass
    r = requests.get(url, timeout=60); r.raise_for_status()
    return re.findall(r'href="([^"?/]+\.(?:tif|gml|jp2|xml|zip))"', r.text)

def main(e0, n0, e1, n1, out, dop=False):
    for prod, url in PRODUCTS.items():
        if prod == "dop10" and not dop: continue
        names = listing(url)
        od = os.path.join(out, prod); os.makedirs(od, exist_ok=True)
        for e in range(e0, e1 + 1):
            for n in range(n0, n1 + 1):
                pat = re.compile(rf"_32_?{e}_{n}_", re.I)
                for fn in [x for x in names if pat.search(x)]:
                    dst = os.path.join(od, fn)
                    if os.path.exists(dst): continue
                    print("lade", fn, flush=True)
                    with requests.get(url + fn, stream=True, timeout=300) as r:
                        r.raise_for_status()
                        with open(dst, "wb") as f:
                            for c in r.iter_content(1 << 20): f.write(c)

if __name__ == "__main__":
    a = sys.argv[1:]
    main(*map(int, a[:4]), a[4], dop="--dop" in a)
