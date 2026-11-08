# 3D-Spiel auf einer Kopie der realen Welt

Erster Schritt: freie Datenbasis für die Landschaft + drei Grafik-Mockups.

- **Datenquellen & Lizenzen:** [docs/DATENQUELLEN.md](docs/DATENQUELLEN.md)
- **Gespeicherte Daten:** `data/pinnow/` (Pinnow bei Schwerin, Marker Dorfstraße 2) und `data/koenigswinter/` (Drachenfels)
- **Startansicht:** `index.html` → `mockups/index.html`: Region wählen, einen der drei Stile starten
  (A Architekturmodell, B Low-Poly, C Semi-realistisch). In jedem Stil: Übersicht, Marker nah, Draufsicht
  und **„Zu Fuß ab Marker“** (W A S D / Pfeile, Shift rennt, Q/E runter/hoch, Maus ziehen, Esc beendet; Taste F schaltet um).
- **Regionen:** `regions/*.json` (Mittelpunkt, Marker, Kameraansichten)

## Mockups lokal ansehen

```bash
python3 -m http.server 8000
# dann http://localhost:8000 öffnen (WebGL-fähiger Browser nötig)
```

## Daten neu abrufen / andere Region

```bash
pip install pyarrow shapely rasterio pyproj scipy pillow requests
R=pinnow; BBOX="11.515 53.584 11.580 53.622"     # bbox aus regions/$R.json
python scripts/fetch_raster.py   $BBOX data/$R/raster     # Copernicus DEM + ESA WorldCover
python scripts/fetch_overture.py $BBOX data/$R/overture   # Gebäude, Landnutzung, Wasser, Straßen
python scripts/build_scene.py data/$R mockups/data/$R regions/$R.json   # Szenenpaket
node scripts/screenshot.mjs                               # Screenshots für die Startseite (Playwright)
# nur NRW: amtliches DGM1/DOM1/LoD2 (lokal ausführen, in der Cloud gesperrt)
python scripts/fetch_nrw_amtlich.py 370 5613 374 5616 data/koenigswinter/nrw
```

Neue Region: `regions/<name>.json` anlegen, oben ausführen, Namen in `REGIONS` in `mockups/common.js`
und in `MARK` in `mockups/index.html` ergänzen.
