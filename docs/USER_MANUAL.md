# Film2Frame Cut — User Manual

Film2Frame Cut is a desktop app (Electron) to **align scanned film strips** (scan lints) manually or semi-automatically, then export them as **individual PNG frames**.

This manual covers the current Cut build: grid alignment and PNG export. Video (Avidemux), pixel editor, and extra preview windows are **not** included.

Dutch version: [HANDLEIDING.md](HANDLEIDING.md) · Quick start: [QUICK_START.md](QUICK_START.md)

---

## 1. What the app does

1. You open or create a **project** linked to a folder of scans.
2. You align a **grid** (crop rectangles) on one or more frames per strip.
3. You verify alignment with **Previous / Next / Go to**.
4. You export frames as `frame_000001.png`, `frame_000002.png`, …

State is stored in `project.json` in the project folder (scan list, current scan, per-scan grid).

---

## 2. Starting

```bash
cd "D:\CURSOR AI\film2frame-cut"
npm install
npm start
```

Installer build:

```bash
npm run build
```

**Tip:** prefer a fast local disk. Large projects on network drives (e.g. `I:`) can save more slowly.

---

## 3. Screens

| Screen | Role |
|--------|------|
| **1 — Film2Frame** | Project, scan info, overlay grid, PNG export |
| **2 — RASTER SETUP** | Embedded panel: manual position, Assist, macro, navigation |
| **5 — Settings** | DPI, preview, shortcuts, keep grid on navigation |

Language (NL/EN) and **About** (build version) are in the toolbar.

---

## 4. Managing projects

### New project

1. Click **Create new project** (or **New**).
2. Choose a **project folder** (or **Default folder** under Documents).
3. Enter a **project name**.
4. Choose the **scan strip folder**. The app analyzes files (orientation V/H); this can take a long time for thousands of scans.
5. Set **frames per strip** (often **1** for one image per file).
6. Check the count and click **Create project**.

During analysis: **V** = vertical, **H** = horizontal (often rotated 90° on load).

### Open / save / close

| Button | Action |
|--------|--------|
| **Start** | Last used project |
| **Open** | Folder containing `project.json` |
| **JSON** | Pick `project.json` directly |
| **Save** | Save project |
| **Scan list** | Re-count scans |
| **Close** | Close project |
| **Delete** | Permanently delete project folder |

Unsaved changes show **(unsaved)**. Autosave is also active.

---

## 5. Loading strips and orientation

- **Load strip…** — load a single file.
- In RASTER SETUP: **Scan folder…** / **Refresh**.
- **Rotate 90°**, **Flip H**, **Flip V** — correct orientation.
- **Fine rotation** (±1°) with pivot and slider/buttons — for skewed scans.
- **Frame count** / **One frame per scan** — how many cells on the strip.

**Zoom** (strip height / width / full frame, etc.) affects display only, not export pixels.

---

## 6. Manual grid alignment (Manual position)

In **RASTER SETUP → Manual position**:

| Control | Action |
|---------|--------|
| **Width** L+/L−, R−/R+ | Left or right edge |
| **Height** T+/T−, B−/B+ | Top or bottom edge |
| **Fix** | ON: mostly move; OFF: also scale |
| **Push** Up ▲ / Down ▼ | Vertical distribution (depends on reference line) |
| **Hand** ◀ ▶ ▲ ▼ | Move entire grid |
| **Step** 1 / 10 | Step size in pixels |
| **TOP / MIDDLE / BOTTOM** | Scroll active frame into view |
| **Line #** + Up/Down | Reference line (0 = top … n = bottom) |
| **Link to reference line** | Hand/Push follow the line (red border = active) |

In the main window you can also use **X/Y**, **Reset grid**, and the **Overlay grid** (width/height/frames in px).

### Saving grid size

Under **Raster export**:

- **Height px / Width px / Y-bottom** — export cell
- **Save Raster** / **Load Raster** — per film format
- **APPLY** — apply values to the grid

---

## 7. Assist and Detect bounds

Assist helps snap the grid to edges or sprocket features.

### Assist mode

| Assist | Behaviour |
|--------|-----------|
| **Off** | No snap (sprocket presets still detect on navigation) |
| **Soft** | Subtle correction |
| **Strong** | Stronger correction |

### Presets

| Preset | When |
|--------|------|
| **Subtle / Normal / Strong / Base / Difficult edge (L+R)** | General left + right edge |
| **Black line (R)** / **(L)** | Clear horizontal aperture line; X stays stable |
| **Sprocket white (L)** / **(R)** | White sprocket / triangle anchors |
| **Left / Right white edge** | Keep a white vertical strip outside the frame |

### Useful controls

| Control | Action |
|---------|--------|
| **Auto preset** | Analyzes the current frame and picks a preset (**does not** run detect) |
| **Detect bounds** | Aligns the grid using preset + Assist |
| **Center grid** | Centers X/Y (shortcut **C**) |
| **Center first** | Center before detecting |
| **Detect on Next** | Also run Detect bounds after Previous/Next/Go to (sprocket always does this) |

### Fine-tune (especially Black line)

| Field | Action |
|-------|--------|
| **X-/Y-offset**, **Extra L/R/T/B** | Extra shift / trim after detect |
| **Left black bias** | Extra push relative to black strip |
| **Strong scale** | Multiplies bias when Assist = Strong |
| **Auto scale** | Chooses that scale per scan automatically |
| **Bottom black bias** | Small Y correction |
| **Line thickness** | 1 = thin aperture line … 10 = thick bar |
| **Search range (px)** | How far to search around the current edge |
| **Triangle %** | White sensitivity for sprocket |
| **Reset / Offset 0 / L+2 / L+4 / Frame +2/+1** | Quick trim presets |

**? Help** in Assist opens a draggable help panel.

### Recommended order

1. Align the first scan well (manual or Assist).
2. **Auto preset** (optional) → **Detect bounds**.
3. Check a few scans with **Next**.
4. Enable **Detect on Next** if every scan should re-snap.
5. Or use **Auto ▶** / a **macro** for longer runs.

---

## 8. Navigation and export from RASTER SETUP

At the bottom of **Manual position**:

| Control | Action |
|---------|--------|
| **No.** + **Go to** | Jump to scan (forward: export first) |
| **Current Frame** | Current scan number |
| **Previous** | Previous scan (**no** export) |
| **Next** | Exports current scan, then advances |
| **Auto ▶** | After load (+ detect when applicable), auto-Next until the last scan |
| **STOP** | Stops Auto ▶ and/or macro |

### Overwrite

If this scan was exported before, Next shows a dialog:

- **Continue** — skip export, still go to next scan
- **Overwrite** — rewrite the same frame numbers

**Auto ▶** skips that dialog (overwrites).

---

## 9. Macro recorder

Record a fixed action sequence (e.g. Detect → Next) and replay it across many scans.

| Control | Action |
|---------|--------|
| **Record** / **Stop record** | Recording |
| **Play** / **Stop** | Playback |
| **Save** / **Load** | Macro as JSON |
| **Clear** | Clear recording |
| **Loops** | Repeat count |
| **Remaining scans** | Ignores Loops; plays to end of project |
| **Speed** / **Pause (ms)** | Timing |
| **Safe / Normal / Fast / Safe profile** | Speed presets |

**STOP** or Escape interrupts.

---

## 10. PNG export (main window)

Under **Frame generator**:

1. Choose **Output folder (PNG)**.
2. Set **file name** prefix (e.g. `frame` → `frame_000001.png`).
3. **Export current scan** or **Batch: all scans**.

In Cut: always **PNG**, **native grid pixels** (no JPG / scaled output resolution in this variant).

Numbering continues across exports (`getNextFrameNumber`), unless overwrite reuses the previous range.

---

## 11. Settings (important)

| Setting | Action |
|---------|--------|
| **Scan DPI** | For calculations / display |
| **Default frames per strip** | Default for new projects |
| **Strip preview resolution** | Preview sharpness vs speed |
| **Full HD / 4K profile** | Quick preview presets |
| **Keep grid on Previous/Next** | **On:** carry current grid to next scan. **Off:** load saved per-scan state |
| **Arrow step** / **with Shift** | Hand step in RASTER SETUP |
| **RASTER SETUP — shortcuts** | Configurable (Hand, Line #, Center = **C**, etc.) |

**Save** settings after changes.

---

## 12. Typical workflow

1. **New project** + scan folder + frames per strip.
2. Load the first scan; check orientation.
3. Place the grid on one good frame (manual or Assist).
4. **Save Raster** (optional) and **Save** the project.
5. Check a few scans with **Next**; tune Assist/detect.
6. **Detect on Next** and/or **Auto ▶**, or a **macro**.
7. Or: **Batch: all scans** once the grid is correct / kept across scans.

---

## 13. Tips

- **Black line** suits cartoons/16mm with clear horizontal frame lines.
- **Sprocket white** suits visible white sprocket/triangle tips; don’t lead with “Center grid” for those presets.
- **Auto preset** is a suggestion: always verify with **Detect bounds**.
- If the grid “jumps to the bottom”: check whether **BOTTOM** is active (viewport) and whether the Assist preset is correct.
- Large `project.json` files: don’t wait on every save during navigation; autosave writes in the background.
- Status **Load** / **Operation** shows whether the app is busy (loading, export, Auto ▶).

---

## 14. What this Cut does not include

- Video creation (Avidemux)
- Pixel editor
- Extra preview windows (align/output)
- JPG export and scaled output resolutions
- Separate FILM FORMAT chooser UI (format is stored in project/scan info)

See also `README.md` and `END_USER_AGREEMENT.md`.

---

## 15. Glossary

| Term | Meaning |
|------|---------|
| **Scan / strip** | One image file (often one or more frames stacked) |
| **Grid** | Crop rectangles on the strip |
| **Assist** | Automatic edge / sprocket help |
| **Detect bounds** | One-shot align using Assist |
| **Auto ▶** | Automatic export + next scan |
| **Lint state** | Saved grid/assist per scan in `project.json` |

---

*Build version is shown under **About** / the toolbar (see `version.json`).*
