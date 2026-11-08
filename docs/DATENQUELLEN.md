# Datenquellen für die 3D-Welt (Stand: 8. November 2026)

Ziel: die Landschaft aus **soliden, frei verfügbaren Messdaten** (amtliche Vermessung, Satelliten)
und **öffentlichen Planungsdaten** (Flächennutzungs- und Bebauungspläne) aufbauen – nicht aus
irgendwo zusammengeschriebenen 3D-Modellen. Die Quellen sind nach Verlässlichkeit sortiert.

## Lizenz-Kurzüberblick

| Lizenz | Was heißt das? | „lizenzfrei"? |
|---|---|---|
| **Datenlizenz Deutschland – Zero – 2.0** (dl-de/zero-2.0) | Beliebig nutzen, ändern, verkaufen. Kein Namensnennungszwang. | **Ja** |
| **CC0 / Public Domain** | wie oben | **Ja** |
| **Datenlizenz Deutschland – Namensnennung – 2.0** (dl-de/by-2.0) | Frei, aber Quelle nennen (z. B. im Abspann). | fast |
| **CC BY 4.0** | Frei, Quelle nennen. | fast |
| **Copernicus-Lizenz** (EU-Verordnung 1159/2013, DEM-Lizenz) | Frei, kommerziell erlaubt, Quelle nennen. | fast |
| **ODbL 1.0** (OpenStreetMap) | Frei, Quelle nennen **und** abgeleitete *Datenbanken* müssen wieder unter ODbL. Das Spiel selbst (ein „Produced Work“) muss nicht offen sein. | eingeschränkt |

Empfehlung: Wo möglich **amtliche Daten unter dl-de/zero-2.0** (z. B. NRW, Berlin) als Grundlage,
OSM/Overture nur ergänzend (Straßennamen, Nutzungsdetails), und eine Credits-Seite im Spiel.

## 1. Gelände (Höhenmodelle)

| Quelle | Auflösung | Abdeckung | Lizenz | Zugriff |
|---|---|---|---|---|
| **DGM1 NRW** (Geländemodell, Boden ohne Bewuchs) | 1 m | NRW | dl-de/zero-2.0 | opengeodata.nrw.de/produkte/geobasis/hm/ – Skript `scripts/fetch_nrw_amtlich.py` |
| **DOM1 NRW** (Oberflächenmodell inkl. Bäume/Gebäude) | 1 m | NRW | dl-de/zero-2.0 | ebenda |
| DGM1 andere Länder (Berlin, Hamburg, Thüringen, Sachsen, Brandenburg, Bayern …) | 1 m | je Land | meist dl-de/zero oder dl-de/by, CC BY 4.0 | Geoportal des Landes |
| DGM200 / DGM1000 (BKG) | 200 m | Deutschland | dl-de/by-2.0 | gdz.bkg.bund.de |
| **Copernicus DEM GLO-30** | 30 m | weltweit | Copernicus-DEM-Lizenz (frei, Namensnennung) | AWS Open Data `s3://copernicus-dem-30m` – **in diesem Repo verwendet** |
| EU-DEM / Copernicus EEA-10 | 25 m / 10 m | Europa | Copernicus | land.copernicus.eu |

## 2. Gebäude

| Quelle | Inhalt | Lizenz |
|---|---|---|
| **3D-Gebäudemodelle LoD2 NRW** (und viele andere Länder) | echte Dachformen aus Laserscan + Kataster, CityGML | NRW: dl-de/zero-2.0 |
| LoD1 Deutschland (BKG/AdV) | Klötzchen mit Höhe, bundesweit | teils kostenpflichtig, Länder unterschiedlich |
| ALKIS-Gebäudeumringe | exakte Grundrisse aus dem Liegenschaftskataster | NRW/Berlin u. a.: dl-de/zero-2.0 |
| **Overture Maps – buildings** | Grundrisse (OSM + ML-erkannte Gebäude), teils Höhe/Geschosse | ODbL / CDLA-Permissive-2.0 – **in diesem Repo verwendet** |

## 3. Landbedeckung (was ist *tatsächlich* da?)

| Quelle | Auflösung | Lizenz |
|---|---|---|
| **ESA WorldCover 2021** | 10 m, 11 Klassen | CC BY 4.0 – **in diesem Repo verwendet** |
| CORINE Land Cover / Urban Atlas (Copernicus) | 100 m / Stadtgebiete fein | Copernicus (frei) |
| Basis-DLM / ATKIS (Länder) | Vektor, amtliche Nutzungsarten | NRW: dl-de/zero-2.0 |
| ALKIS „Tatsächliche Nutzung“ | flurstücksgenau | NRW/Berlin: dl-de/zero-2.0 |
| **Digitale Orthophotos DOP10/DOP20** | 10–20 cm Luftbild (Texturen!) | NRW: dl-de/zero-2.0 |
| Sentinel-2 | 10 m Satellitenbild, alle 5 Tage | Copernicus (frei) |

## 4. Öffentliche Planungsdaten (Nutzungspläne)

| Ebene | Was steht drin? | Wo / Format |
|---|---|---|
| **Flächennutzungsplan (FNP)** | geplante Nutzung der ganzen Gemeinde: Wohnbau-, Gewerbe-, Grün-, Wald-, Landwirtschaftsflächen | Gemeinde-Geoportal, oft WMS/WFS |
| **Bebauungsplan (B-Plan)** | parzellengenau: Baugrenzen, max. Geschosszahl/Höhe, Dachform, GRZ/GFZ | für neue Pläne seit 2023 im Standard **XPlanung** (XPlanGML) vorgesehen |
| INSPIRE „Planned Land Use“ | europaweit harmonisierte Planungsdaten | INSPIRE-Geoportal (WFS) |
| Regionalpläne / Landesentwicklungspläne | grobe Raumordnung | Bezirksregierung / Land |

Besonders offen: **Berlin** (B-Pläne als WFS, dl-de/zero-2.0), **Hamburg** (XPlanGML im
Transparenzportal, dl-de/by-2.0), **NRW** (Bauleitpläne vieler Kommunen über GEOportal.NRW;
Lizenz je Kommune prüfen). Für Königswinter muss das beim Rhein-Sieg-Kreis bzw. der Stadt geprüft werden.

**Wofür im Spiel?** B-Pläne liefern Regeln, die Messdaten nicht haben: erlaubte Gebäudehöhe,
Dachform, Bauweise. Damit lassen sich fehlende/neue Gebäude glaubwürdig ergänzen und Flächen
(Gewerbe vs. Wohnen vs. Grün) im Stil einfärben.

## Was in diesem Repo gespeichert ist

Beispielregion **Königswinter / Drachenfels mit Bonn-Bad Godesberg** (Rhein, Altstadt, Siebengebirge),
BBox 7,165–7,225 °O / 50,655–50,690 °N.

| Datei | Quelle |
|---|---|
| `data/koenigswinter/raster/dem_copernicus_glo30.tif` | Copernicus DEM GLO-30 (Zuschnitt) |
| `data/koenigswinter/raster/landcover_esa_worldcover_10m.tif` | ESA WorldCover 2021 |
| `data/koenigswinter/overture/*.geojson` | Overture Maps Release 2026-10-21.0: Gebäude, Landnutzung, Land, Wasser, Straßen |
| `mockups/data/scene.json`, `landuse.png` | daraus abgeleitetes Szenenpaket (siehe `scripts/build_scene.py`) |

**Wichtige Einschränkung:** Die Cloud-Umgebung, in der das gebaut wurde, durfte nur AWS-Open-Data
erreichen. Die amtlichen Server (opengeodata.nrw.de, Geoportale, OSM-Overpass) waren gesperrt.
Deshalb sind DGM1, LoD2, Orthofotos und B-Pläne **noch nicht** im Repo, sondern nur per Skript
abrufbar. Nächster Schritt: `python scripts/fetch_nrw_amtlich.py 370 5613 374 5616 data/koenigswinter/nrw`
lokal ausführen (bzw. die Umgebung für diese Hosts freischalten).

## Pflicht-Namensnennung (für Credits)

- Höhe: © DLR e.V. 2010–2014 und © Airbus Defence and Space GmbH 2014–2018, bereitgestellt unter COPERNICUS durch die Europäische Union und ESA.
- Landbedeckung: © ESA WorldCover project 2021 / Contains modified Copernicus Sentinel data (2021), CC BY 4.0.
- Gebäude/Straßen/Landnutzung: © Overture Maps Foundation; enthält Daten © OpenStreetMap-Mitwirkende (ODbL 1.0).
- (später) Geobasisdaten NRW: dl-de/zero-2.0 – keine Nennung nötig, aber empfohlen: „© GeoBasis NRW“.
