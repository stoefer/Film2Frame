# Film2Frame

Zelfstandige app om filmstroken (scanlinten) van **16mm, Super 16, 8mm, Super 8, 9,5mm en 35mm** uit te snijden naar losse frames. Ondersteunt **1–99 frames** per scanlint. Werkt met **projecten**: alle aanpassingen worden per project bewaard. Horizontale scans worden bij inladen automatisch 90° gedraaid (met handmatige override).

## Projecten

- **Laatst project**: bij start wordt automatisch het laatst geopende project geladen (indien beschikbaar).
- **Nieuw project**: kies projectmap, naam, map met scanlints, aantal frames per lint (1–99), filmsoort. Standaard 30 frames per lint, 4800 DPI.
- **Open**: kies een map met `project.json`. Opgeslagen instellingen en per-lint aanpassingen (raster, rotatie) worden geladen.
- **Bewaren**: slaat alle aanpassingen op (per-lint state, filmformaat, uitvoermap, enz.). Bij **wisselen van scanlint** wordt `project.json` automatisch bijgewerkt (raster per lint + `currentLintPath`). Bij **openen** van een project wordt de **eerste scanlint zonder opgeslagen state** gekozen (nog niet eerder geladen in dat project); als alles een keer is geopend, wordt de **laatst gebruikte** scan geladen.
- **Ga naar**: laad een scanlint op nummer (1–N).

Projectmap bevat `project.json` met o.a. naam, locatie, frames per lint, filmformaat, uitvoermap, DPI en `lintStates` (aanpassingen per geladen lint).

## Locatie

```
d:\CURSOR AI\film2frame-app
```

## Functies

- **Filmformaten**: 16mm (dubbel/enkel perf), Super 16, 8mm, Super 8, 9,5mm, 35mm. Positief/negatief.
- **Overlay-raster**: groen met rood kader rond actief frame, nummering 1–99. Hand (pijltjes), breedte (L/R), hoogte (T/B). **Samendruk ▼** in scanlint-preview: Y-onder blijft zoals ingesteld; alle frames gelijke hoogte met maximale verticale samendrukking vanaf boven (tot minimum celhoogte). Kantelpunten voor fijne draaiing (±1°), Numpad +/- voor 0,01° / 0,1°.
- **Export**: frames 000001–999999, geen overschrijven; nummering loopt door vanaf laatste in uitvoermap. PNG of JPG. **Resolutie**: *Raster (native pixels)* = exacte uitsnede (volle strip-export); of vaste kaders 1024×768 t/m **UHD 4K** (past binnen kader, zwarte balken; mag ook **opschalen** als de uitsnede kleiner is). Instellingen en Frame generator delen dezelfde keuze.
- **Preview-vensters**: scanlint-preview (apart venster, vergroot/verklein/sluit), **uitlijning** (apart venster, één frame sterk vergroot i.h.k.v. raster), output-preview (laatste weggeschreven frame). **Sneltoetsen scanlint** zijn instelbaar onder *Programma-instellingen* (Hand, zoom passend, springen naar boven/midden/onder, vorige/volgende scanlint, raster reset, 90° draaien).
- **Raster-presets** (naam bewaren/laden): via het venster **Scanlint – raster afstellen**; opgeslagen in app-gegevens (`userData`). Het hoofdvenster heeft wel **snelle offset-knoppen** per filmtype (%) en **raster uit mm**.
- **Tijdcode**: speelduur bij 12–60 fps (standaard 24).

## Modulaire opbouw

- **main/** – Electron main process
  - `index.js` – entry, app lifecycle
  - `windows.js` – hoofdvenster, strip-preview, output-preview
  - `ipc.js` – IPC (projecten, frames, presets, previews)
  - `project.js` – project.json, getNextFrameNumber, scan-infos
  - `presets.js` – preset opslaan/laden
  - `prefs.js` – laatste mappen, laatst project
- **renderer/** – state, grid, strip-loader, preview, ui, project
  - **windows/** – strip-preview.html, align-preview.html, output-preview.html
- **preloads/** – strip.js, output.js
- **styles/** – main.css (incl. knop-feedback, info-paneel)

## Starten

```bash
cd "d:\CURSOR AI\film2frame-app"
npm install
npm start
```

## Scripts

- `npm start` – start Electron
- `npm run pack` – build (dir)
- `npm run build` – build installer
