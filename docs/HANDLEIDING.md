# Film2Frame Cut — Handleiding

Film2Frame Cut is een desktop-app (Electron) om **ingescande filmstroken** (scanlints) manueel of halfautomatisch uit te lijnen en daarna als **losse PNG-frames** te exporteren.

Deze handleiding beschrijft de huidige Cut-variant: focus op rasterafstelling en PNG-export. Video (Avidemux), pixel-editor en extra previewvensters horen hier **niet** bij.

Snelstart: [SNELSTART.md](SNELSTART.md) · English: [USER_MANUAL.md](USER_MANUAL.md) / [QUICK_START.md](QUICK_START.md)

---

## 1. Wat doet de app?

1. Je opent of maakt een **project** gekoppeld aan een map met scans.
2. Je stelt een **raster** (rode/groene kaders) af op één of meer frames per scanlint.
3. Je controleert de uitlijning met **Vorige / Volgende / Ga naar**.
4. Je exporteert frames als `frame_000001.png`, `frame_000002.png`, …

Bestanden worden bewaard in `project.json` in de projectmap (scanlijst, huidige scan, raster per scan).

---

## 2. Starten

```bash
cd "D:\CURSOR AI\film2frame-cut"
npm install
npm start
```

Installer-build:

```bash
npm run build
```

**Tip:** werk bij voorkeur op een snelle schijf. Grote projecten op netwerkschijven (bijv. `I:`) kunnen trager opslaan.

---

## 3. Schermen

| Scherm | Rol |
|--------|-----|
| **1 — Film2Frame** | Project, scaninfo, overlay-grid, PNG-export |
| **2 — RASTER SETUP** | Ingebouwd paneel: manuele positie, Assist, macro, navigatie |
| **5 — Instellingen** | DPI, preview, sneltoetsen, raster behouden bij navigatie |

Taal (NL/EN) en **Over** (buildversie) staan in de werkbalk.

---

## 4. Project beheren

### Nieuw project

1. Klik **Nieuw project aanmaken** (of **Nieuw**).
2. Kies een **projectmap** (of **Standaardmap** onder Documenten).
3. Vul een **projectnaam** in.
4. Kies de **map met scanlints**. De app analyseert bestanden (oriëntatie V/H); dit kan lang duren bij duizenden scans.
5. Stel **aantal frames per lint** in (vaak **1** voor één beeld per bestand).
6. Controleer de telling en klik **Project aanmaken**.

Bij analyse: **V** = verticaal, **H** = horizontaal (wordt bij laden vaak 90° gedraaid).

### Openen / opslaan / sluiten

| Knop | Functie |
|------|---------|
| **Start** | Laatst gebruikte project |
| **Open** | Map met `project.json` |
| **JSON** | Direct `project.json` kiezen |
| **Bewaar** | Project opslaan |
| **Scanlijst** | Scans opnieuw tellen |
| **Sluit** | Project sluiten |
| **Wis** | Projectmap definitief verwijderen |

Onopgeslagen wijzigingen tonen **(niet opgeslagen)**. Er is ook autosave.

---

## 5. Scanlint laden en oriëntatie

- **Scanlint laden…** — één bestand laden.
- In RASTER SETUP: **Scanmap…** / **Vernieuwen**.
- **Draai 90°**, **Spiegel H**, **Spiegel V** — oriëntatie corrigeren.
- **Fijne draaiing** (±1°) met kantelpunt en schuif/knoppen — voor scheve scans.
- **Aantal frames** / **Eén frame per scan** — hoeveel cellen op het lint.

**Zoom** (o.a. Scanlint hoogte / breedte / Volledig frame) bepaalt alleen de weergave, niet de exportpixels.

---

## 6. Raster handmatig afstellen (Manuele positie)

In **RASTER SETUP → Manuele positie**:

| Bediening | Functie |
|-----------|---------|
| **Breedte** L+/L−, R−/R+ | Linker- of rechterrand |
| **Hoogte** T+/T−, B−/B+ | Boven- of onderrand |
| **Fix** | AAN: vooral verplaatsen; UIT: ook schalen |
| **Duw** Omhoog ▲ / Omlaag ▼ | Verticale verdeling (afhankelijk van referentielijn) |
| **Hand** ◀ ▶ ▲ ▼ | Heel raster verschuiven |
| **Stap** 1 / 10 | Stapgrootte in pixels |
| **BOVEN / MIDDEN / ONDER** | Actief frame in beeld scrollen |
| **Lijn #** + Omhoog/Omlaag | Referentielijn (0 = boven … n = onder) |
| **Koppel aan referentielijn** | Hand/Duw volgen de lijn (rode rand = actief) |

In het hoofdvenster kun je ook **X/Y**, **Reset raster** en het **Overlay grid** (breedte/hoogte/frames in px) gebruiken.

### Raster afmetingen bewaren

Onder **Raster export**:

- **Hoogte px / Breedte px / Y-onder** — exportcel
- **Bewaar Raster** / **Laad Raster** — per filmformaat
- **PAS TOE** — waarden op het raster zetten

---

## 7. Assist en Detecteer grenzen

Assist helpt het raster automatisch op randen of perforatie te klemmen.

### Assist-modus

| Assist | Gedrag |
|--------|--------|
| **Uit** | Geen snap (perforatie-presets detecteren bij navigatie nog wel) |
| **Zacht** | Subtiele correctie |
| **Versterkt** | Sterkere correctie |

### Presets (keuze)

| Preset | Wanneer |
|--------|---------|
| **Subtiel / Normaal / Sterk / Basis / Moeilijke rand (L+R)** | Algemene linker- + rechterrand |
| **Zwarte lijn (R)** / **(L)** | Duidelijke horizontale aperture-lijn; X blijft stabiel |
| **Perforatie wit (L)** / **(R)** | Witte sprocket-/driehoekankers |
| **Linker / Rechter witte rand** | Witte verticale strook buiten het beeld houden |

### Handige knoppen

| Knop / optie | Functie |
|--------------|---------|
| **Auto preset** | Analyseert het huidige frame en kiest een passende preset (**geen** detectie) |
| **Detecteer grenzen** | Past het raster toe volgens preset + Assist |
| **Center raster** | Centreert X/Y (sneltoets **C**) |
| **Center eerst** | Eerst centreren, dan detecteren |
| **Detecteer bij Volgende** | Na Vorige/Volgende/Ga naar ook Detecteer grenzen (perforatie doet dit altijd) |

### Fine-tune (vooral Zwarte lijn)

| Veld | Functie |
|------|---------|
| **X-/Y-offset**, **Extra L/R/T/B** | Extra verschuiving / trim na detectie |
| **Bias links zwart** | Extra duw t.o.v. zwarte strook |
| **Schaal versterkt** | Vermenigvuldigt bias bij Assist = Versterkt |
| **Auto schaal** | Kiest die schaal per scan automatisch |
| **Bias onder zwart** | Kleine Y-correctie |
| **Lijndikte** | 1 = dunne aperture-lijn … 10 = dikke strook |
| **Zoekbereik (px)** | Hoe ver rond de huidige rand gezocht wordt |
| **Driehoek %** | Wit-gevoeligheid bij perforatie |
| **Reset / Offset 0 / L+2 / L+4 / Kader +2/+1** | Snelle trim-presets |

**? Help** in Assist opent een versleepbaar uitlegvenster.

### Aanbevolen volgorde

1. Eerste scan goed manueel of met Assist uitlijnen.
2. **Auto preset** (optioneel) → **Detecteer grenzen**.
3. Controleer enkele scans met **Volgende**.
4. Zet **Detecteer bij Volgende** aan als elke scan opnieuw geklemd mag worden.
5. Of gebruik **Auto ▶** / een **macro** voor langere reeksen.

---

## 8. Navigatie en export vanuit RASTER SETUP

Onderaan **Manuele positie**:

| Control | Functie |
|---------|---------|
| **Nr.** + **Ga naar** | Spring naar scan (bij vooruit: eerst exporteren) |
| **Huidig Frame** | Huidig scannummer |
| **Vorige** | Vorige scan (**geen** export) |
| **Volgende** | Exporteert huidige scan, daarna volgende |
| **Auto ▶** | Na laden (+ detectie waar van toepassing) automatisch Volgende tot de laatste scan |
| **STOP** | Stopt Auto ▶ en/of macro |

### Overschrijven

Als deze scan al eerder is geëxporteerd, verschijnt bij Volgende een dialoog:

- **Ga verder** — geen export, wel naar de volgende scan
- **Overschrijven** — dezelfde framenummers opnieuw schrijven

Bij **Auto ▶** wordt die dialoog overgeslagen (overschrijven).

---

## 9. Macro recorder

Neem een vaste reeks acties op (bijv. Detecteer → Volgende) en speel die af over veel scans.

| Control | Functie |
|---------|---------|
| **Opname** / **Stop opname** | Opnemen |
| **Afspelen** / **Stop** | Afspelen |
| **Opslaan** / **Laden** | Macro als JSON |
| **Wis** | Opname legen |
| **Lussen** | Aantal herhalingen |
| **Resterende scans** | Negeert Lussen; speelt tot einde project |
| **Snelheid** / **Pauze (ms)** | Tempo |
| **Safe / Normal / Fast / Veilig profiel** | Snelheidspresets |

**STOP** of Escape onderbreekt.

---

## 10. PNG-export (hoofdvenster)

Onder **Frame generator**:

1. Kies **Doelmap (PNG)**.
2. Stel **bestandsnaam** in (prefix, bijv. `frame` → `frame_000001.png`).
3. **Huidige scan exporteren** of **Batch: alle scans**.

In Cut: altijd **PNG**, **native rasterpixels** (geen JPG/resolutie-schaal in deze variant).

Nummering loopt door over exports heen (`getNextFrameNumber`), tenzij je bij overschrijven de eerdere reeks hergebruikt.

---

## 11. Instellingen (belangrijk)

| Instelling | Functie |
|------------|---------|
| **Scan-DPI** | Voor berekeningen / weergave |
| **Standaard frames per lint** | Default nieuw project |
| **Preview-resolutie scanlint** | Scherpte/snelheid van de preview |
| **Profiel Full HD / 4K** | Snelle preview-presets |
| **Raster behouden bij Vorige/Volgende** | **Aan:** huidig raster meenemen naar volgende scan. **Uit:** opgeslagen state per scan laden |
| **Pijltjesstap** / **met Shift** | Hand-stap in RASTER SETUP |
| **RASTER SETUP — sneltoetsen** | Aanpasbaar (o.a. Hand, Lijn #, Center = **C**) |

**Bewaar** instellingen na wijzigingen.

---

## 12. Typische workflow

1. **Nieuw project** + scanmap + frames per lint.
2. Eerste scan laden; oriëntatie controleren.
3. Raster op één goed frame zetten (handmatig of Assist).
4. **Bewaar Raster** (optioneel) en **Bewaar** project.
5. Enkele scans met **Volgende** controleren; Assist/detectie bijstellen.
6. **Detecteer bij Volgende** en/of **Auto ▶**, of een **macro**.
7. Of: alles in één keer via **Batch: alle scans** (raster moet dan al kloppen / behouden blijven).

---

## 13. Tips

- **Zwarte lijn** past bij tekenfilm/16mm met duidelijke horizontale framelijnen.
- **Perforatie wit** past bij zichtbare witte sprocket-/driehoekjes; niet “Center raster” als eerste stap bij die presets.
- **Auto preset** is een voorstel: controleer altijd met **Detecteer grenzen**.
- Als het raster “naar de bodem springt”: kijk of **ONDER** actief is (viewport) en of de juiste Assist-preset staat.
- Grote `project.json`-bestanden: wacht niet op elke save bij navigatie; autosave schrijft op de achtergrond.
- Statusbalk **Belasting** / **Bewerking** toont of de app bezig is (laden, export, Auto ▶).

---

## 14. Wat deze Cut niet heeft

- Video maken (Avidemux)
- Pixel-editor
- Extra previewvensters (align/output)
- JPG-export en geschaalde uitvoerresoluties
- Aparte FILMFORMAAT-keuzepagina (filmsoort staat in project/scaninfo)

Zie ook `README.md` en `END_USER_AGREEMENT.md`.

---

## 15. Korte begrippenlijst

| Term | Betekenis |
|------|-----------|
| **Scan / scanlint** | Eén beeldbestand (vaak één of meer frames onder elkaar) |
| **Raster** | Uitsnijkaders op het lint |
| **Assist** | Automatische rand-/perforatie-hulp |
| **Detecteer grenzen** | Eén keer uitlijnen volgens Assist |
| **Auto ▶** | Automatisch exporteren + volgende scan |
| **Lintstate** | Opgeslagen raster/assist per scan in `project.json` |

---

*Buildversie staat in de app onder **Over** / de werkbalk (zie `version.json`).*
