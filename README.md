# 3D-Spiel auf einer Kopie der realen Welt

Erster Schritt: freie Datenbasis für die Landschaft + drei Grafik-Mockups.

- **Datenquellen & Lizenzen:** [docs/DATENQUELLEN.md](docs/DATENQUELLEN.md)
- **Gespeicherte Beispieldaten:** `data/koenigswinter/` (Königswinter/Drachenfels, NRW)
- **Mockups:** `mockups/index.html` (Galerie mit Screenshots), interaktiv: `a-architekturmodell.html`, `b-lowpoly.html`, `c-semirealistisch.html`

## Mockups lokal ansehen

```bash
cd mockups && python3 -m http.server 8000
# dann http://localhost:8000 öffnen
```

## Daten neu abrufen / andere Region

```bash
pip install pyarrow shapely rasterio pyproj scipy pillow requests
BBOX="7.165 50.655 7.225 50.690"
python scripts/fetch_raster.py   $BBOX data/koenigswinter/raster     # Copernicus DEM + ESA WorldCover
python scripts/fetch_overture.py $BBOX data/koenigswinter/overture   # Gebäude, Landnutzung, Wasser, Straßen
python scripts/fetch_nrw_amtlich.py 370 5613 374 5616 data/koenigswinter/nrw   # amtl. DGM1/DOM1/LoD2 NRW (lokal ausführen)
python scripts/build_scene.py data/koenigswinter mockups/data       # Szenenpaket für die Mockups
node scripts/screenshot.mjs                                        # Screenshots (Playwright)
```

Hinweis: `build_scene.py` hat die BBox derzeit fest eingetragen (oben im Skript).
