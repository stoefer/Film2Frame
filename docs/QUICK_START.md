# Film2Frame Cut — Quick Start

Short path from scan folder to PNG frames. Full guide: [USER_MANUAL.md](USER_MANUAL.md).

---

## 1. Start

```bash
npm install
npm start
```

---

## 2. Project

1. **Create new project**
2. Choose a **project folder** and enter a **project name**
3. Choose the **scan strip folder**
4. Set **frames per strip** (often **1**)
5. **Create project**

Or: **Open** / **Start** for an existing project.

---

## 3. Align the first scan

1. Open **RASTER SETUP** (right-hand / raster panel)
2. Fix orientation if needed (**Rotate 90°** / flip)
3. Place the grid on the frame:
   - manually (**Hand**, width/height), or
   - **Auto preset** → **Detect bounds**
4. Check with **Previous** / **Next**
5. **Save** the project

### Assist (short)

| Situation | Preset |
|-----------|--------|
| Clear black frame line | **Black line (R)** or **(L)** |
| White sprocket / triangle tips | **Sprocket white (L)** or **(R)** |
| Unsure | **Auto preset** |

Optional: enable **Detect on Next**.

---

## 4. Export

Pick an **output folder**, then:

- **Export current scan**, or
- **Batch: all scans**, or
- in RASTER SETUP press **Next** (exports first, then advances)

Files: `frame_000001.png`, `frame_000002.png`, …

If the same scan was exported before: dialog **Continue** / **Overwrite**.

---

## 5. Longer runs

| Option | Use |
|--------|-----|
| **Auto ▶** | Automatic export + next scan (+ detect when applicable) |
| **Macro** | Record actions → **Remaining scans** → play |
| **STOP** | Interrupt |

---

## 6. Tips

- **Save** often; large projects on slow/network drives are slower.
- Setting **Keep grid on Previous/Next**: on = carry current grid to the next scan.
- Shortcut **C** = Center grid (if configured).
- **STOP** cancels Auto ▶ and macros.
