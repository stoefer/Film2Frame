# Bottleneck: snelheid bij rasterbeweging (Hand-tool e.d.)

## Hoofdbottleneck: **getStripCanvas() wordt twee keer per actie aangeroepen**

Bij elke pijltjestoets (Hand/Breedte/Verticaal) gebeurt het volgende:

1. **onFrameGridOffsetFromPreview** (renderer/ui.js)  
   - Roept `getStripCanvas()` aan om afmetingen en schaal te bepalen voor de delta.

2. **refreshPreviewsGridOnly()** → **sendStripUpdateGridOnly()** (renderer/preview.js)  
   - Roept **weer** `getStripCanvas()` aan om de grid-payload voor de scanlint-preview te bouwen.

Elke aanroep van **getStripCanvas()** (renderer/strip-loader.js) doet zwaar werk:

- Nieuw canvas aanmaken, **drawImage** met rotatie (volledige scan).
- Bij horizontaal/verticaal spiegelen: **nog een canvas** + **drawImage**.
- **scaleCanvasToMaxDim** (max 2048 px): bij grote scans **nog een canvas** + **drawImage**.

Dat zijn **tot 3 volledige bitmap-tekeningen per aanroep**. Twee aanroepen per toets = **tot 6 grote tekenoperaties per pijltjesindruk**. Op grote scans (bijv. 3000×1500 px) kost dat tientallen milliseconden en dat voel je als vertraging.

## Overige factoren (minder zwaar)

- **updateUI()** – DOM-updates; meestal licht.
- **IPC** – strip-update gaat al via `send` (niet-blokkerend); geen grote bottleneck.
- **drawGridOverlay** in de strip-preview – alleen lijnen/tekst; snel.

## Aanbevolen oplossing

**Strip-canvas maar één keer per actie gebruiken** en de payload daaruit afleiden:

- In **onFrameGridOffsetFromPreview**: één keer `getStripCanvas()` aanroepen.
- Met dat canvas: delta’s uitrekenen **en** de grid-payload bouwen (dimensies + schaal zijn hetzelfde).
- Die payload direct doorsturen naar de preview (bijv. nieuwe functie `sendStripUpdatePayload(payload)`), **zonder** in `sendStripUpdateGridOnly()` opnieuw `getStripCanvas()` aan te roepen.

Daarmee halveert je het zware werk per toets (van 2× naar 1× getStripCanvas), wat de voelbare snelheid sterk kan verbeteren.

Optioneel voor later: **strip-canvas cachen** en alleen opnieuw tekenen bij wijziging van beeld, rotatie, spiegeling of aantal frames; dan worden herhaalde pijltjesslagen nog goedkoper.
