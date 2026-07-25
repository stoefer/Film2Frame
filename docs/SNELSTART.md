# Film2Frame Cut — Snelstart

Korte route van scanmap naar PNG-frames. Uitgebreide uitleg: [HANDLEIDING.md](HANDLEIDING.md).

---

## 1. Starten

```bash
npm install
npm start
```

---

## 2. Project

1. **Nieuw project aanmaken**
2. Kies **projectmap** + vul **projectnaam** in
3. Kies de **map met scanlints**
4. Zet **frames per lint** (vaak **1**)
5. **Project aanmaken**

Of: **Open** / **Start** voor een bestaand project.

---

## 3. Eerste scan uitlijnen

1. Open **RASTER SETUP** (rechts / rastervenster)
2. Corrigeer zo nodig **Draai 90°** / spiegelen
3. Zet het raster op het beeld:
   - handmatig (**Hand**, breedte/hoogte), of
   - **Auto preset** → **Detecteer grenzen**
4. Controleer met **Vorige** / **Volgende**
5. **Bewaar** het project

### Assist (kort)

| Situatie | Preset |
|----------|--------|
| Duidelijke zwarte framelijn | **Zwarte lijn (R)** of **(L)** |
| Witte perforatie/driehoekjes | **Perforatie wit (L)** of **(R)** |
| Onzeker | **Auto preset** |

Optioneel: vink **Detecteer bij Volgende** aan.

---

## 4. Exporteren

**Doelmap** kiezen, daarna:

- **Huidige scan exporteren**, of
- **Batch: alle scans**, of
- in RASTER SETUP op **Volgende** (exporteert eerst, dan volgende scan)

Bestanden: `frame_000001.png`, `frame_000002.png`, …

Bij herhaling van dezelfde scan: dialoog **Ga verder** / **Overschrijven**.

---

## 5. Langere reeks

| Optie | Gebruik |
|-------|---------|
| **Auto ▶** | Automatisch export + volgende scan (+ detectie waar van toepassing) |
| **Macro** | Acties opnemen → **Resterende scans** → afspelen |
| **STOP** | Onderbreken |

---

## 6. Handige tips

- **Bewaar** regelmatig; grote projecten op trage schijven zijn traag.
- Instelling **Raster behouden bij Vorige/Volgende**: aan = zelfde raster meenemen.
- Sneltoets **C** = Center raster (indien zo ingesteld).
- **STOP** stopt Auto ▶ en macro’s.
