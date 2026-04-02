# Optical Sound Decoder

Zelfstandige desktop-app (Electron) om het **optische variabele-dichtheidsspoor** van gescande **16mm**-filmstrips te decoderen naar een **mono-WAV** (IEEE 32-bit float), bedoeld om later te **synchroniseren** met een gedigitaliseerde filmkopie.

## Kenmerken

- **1–40 filmframes per strip** (instelbaar; standaard 31 met ruimte tot 40).
- Decode op **volledige scanresolutie** (geen downscale vóór analyse).
- **Lineaire luminantie** (sRGB → lineair, BT.709 luma).
- **Band tekenen**: sleep een rechthoek over spoor (X) en filmbereik (Y). **Langere scanlint** dan het beeld: stel met schuifregelaars *Film start / einde* het verticale stuk in dat bij uw frame-aantal hoort; gebied erboven/onder wordt gedimd en niet meegedecodeerd. Bereik wordt **per bestand** onthouden (net als rotatie).
- **Rotatie** 0° / 90° / 180° / 270° **per bestand** (in de lijst staat `bestandsnaam · 90°`). Eerste openen: automatisch 90° als de scan breder dan hoog is. Nieuwe map/bestanden = rotatiegeheugen gewist.
- **Decodemodus**: **variabele dichtheid** (gemiddelde lineaire luma per rij) of **variabele oppervlakte** (per rij: breedte van het donkere gebied t.o.v. de band, drempel = midden tussen min/max luma op die rij).
- **Negatief**: luma omkeren.
- **Hoogdoorlaat** (Hz) om DC en zeer lage ruis te verminderen.
- **Export** naar 44,1 / 48 / 96 kHz (lineair opgesampeld vanuit de natuurlijke “rij-frequentie” van de strip).
- Bij **alle strips samen**: audio achter elkaar, **één normalisatie** over het hele bestand (geen piekverschil per strip).
- Naast elke WAV een klein **`…-sync.json`** met fps, frames per strip, samplefrequentie en duur voor je NLE of scripts.

## Lange strips / vervorming aan het einde

Zeer lange scans (veel pixels op één as) kunnen in Chromium na **één** grote `drawImage` na rotatie **strepen of herhaalde randen** tonen. De app tekent de bron daarom in **tegels** (2048 px), hetzelfde principe als in Film2Frame.

Daarnaast geldt een **harde limiet op de werk-canvas**: als de geroteerde strip breder of hoger is dan `MAX_ROTATED_CANVAS_SIDE` (standaard **8192 px** in `renderer/decode.js`), wordt **uniform** verkleind zodat beide zijden ≤ die waarde. Zonder die limiet blijft het canvas op veel GPU’s **inhoudelijk afgekapt** (vaak een effen of gestreept blok aan het einde). De statusbalk meldt “uniform geschaald …”. Decode gebruikt deze (eventueel) verkleinde bitmap; voor maximale detaildichtheid op extreem lange scans kunt u de bron in stukken splitsen of `MAX_ROTATED_CANVAS_SIDE` voorzichtig verhogen (bijv. 12288) als uw systeem dat aankan.

De **preview-schaal** naar het venster gebeurt eveneens in **verticale tegels** als de werk-canvas groter is dan 2048 px, om opnieuw strepen bij downscale te vermijden.

## Sessie & templates

- **Automatisch bewaren**: lijst met paden, huidige index, uitvoermap, alle globale instellingen en **per scanlint** rotatie, bereik (X/Y) en decodemodus worden opgeslagen in de app-gegevensmap (`session.json`). Na een herstart worden ontbrekende bestanden uit de lijst geschrapt.
- **Ga naar #**: spring naar het n-de bestand in de lijst (1-based).
- **Zoom**: dropdown *Volle breedte* / *Volle hoogte* of 25%–1000%; 100% = passend op de breedte van het voorbeeldvenster. **Vorige/Volgende** of **pijl ←/→** tussen scanlinten. **BEGIN / MIDDEN / EINDE**: scrollpositie op het getoonde lint. **Overzicht**: aantal linten, frames per lint, speeltijd per lint (s + ms), totale speeltijd (min + s), huidige lint met resolutie en modus.
- **Templates**: sla huidige globale instellingen (frames, fps, modus, exportformaat, enz.) onder een naam op en laad ze later voor een nieuw project.
- **Uitvoermap**: kies een map; **Export: alle strips → uitvoermap** schrijft `optical-merged-<timestamp>.wav` of `.mp3` plus `…-sync.json`.
- **MP3**: kies exportformaat MP3; vereist dependency `ffmpeg-static` (`npm install`). Zonder ffmpeg blijft WAV werken.

## Bouwversie

Elke `npm start`, `npm run pack` en `npm run build` voert `scripts/bump-version.js` uit. Het versienummer is **`OSD` + `YYYYMMDD` + 3 cijfers** (bijv. `OSD20260330001`): na het voorvoegsel volgen 8 cijfers voor de **datum** (lokale tijd); de laatste drie lopen **per dag** op (`000`, `001`, …). Bij een **nieuwe kalenderdag** begint de teller weer op `000`.

Het nummer staat in `version.json`, in de venstertitel en in de kop van de app.

## Starten

```bash
cd optical-sound-decoder
npm install
npm start
```

## Builden voor Windows

```bash
cd optical-sound-decoder
npm install
npm run build
```

De build gebruikt `electron-builder` en maakt voor Windows een echte `Setup.exe` (NSIS) in de map `dist/`.

## Synchronisatie met beeld

De **filmduur** van één strip wordt gemodelleerd als `frames_on_strip / fps`. De decode gebruikt de **hoogte van de strip in pixels** als tijdas: één monster per rij in de gekozen band. De effectieve bandbreedte is daarmee begrensd door DPI en optische kwaliteit; export naar 48 kHz maakt het bestand geschikt voor tijdlijnen zonder extra resampling in je DAW.

Zorg dat **fps** en **aantal frames op het lint** overeenkomen met je digitale beeldversie (bijv. 24 fps, 31 frames per scanlint).

## Map

Staat onder `film2frame-app/optical-sound-decoder/` en is **los** van Film2Frame: eigen `package.json` en eigen `npm start`.
