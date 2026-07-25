# Film2Frame

**Freeware** (niet-commercieel) voor het uitsnijden van ingescande filmstroken (scanlinten) naar losse PNG-frames.

> By installing or using Film2Frame you agree to the [End User Agreement](END_USER_AGREEMENT.md).  
> Door Film2Frame te installeren of te gebruiken gaat u akkoord met de [Gebruikersovereenkomst](END_USER_AGREEMENT.md).

## Freeware in het kort

| Toegestaan | Niet zonder toestemming |
|------------|-------------------------|
| Gratis persoonlijk / educatief / archiefgebruik | Commercieel / betaald zakelijk gebruik |
| Officieel gratis pakket delen | Software verkopen of verhuren |
| Aanpassen voor eigen niet-commercieel gebruik | Licentie-/copyrightvermeldingen verwijderen |

Volledige tekst: [END_USER_AGREEMENT.md](END_USER_AGREEMENT.md) · korte uitleg: [docs/FREEWARE.md](docs/FREEWARE.md)

## Workflow

1. Open of maak een project.
2. Kies de map met scans.
3. Stel het raster af (RASTER SETUP / zwevende preview).
4. Controleer scans met Vorige / Volgende / Ga naar.
5. Exporteer de huidige scan of een batch naar PNG (bestandsstam blijft behouden, bv. `Frame_15962.png`).

## Starten (ontwikkeling)

```bash
npm install
npm start
```

## Scripts

- `npm start` – start Electron  
- `npm run pack` – build (dir)  
- `npm run build` – Windows-installer (NSIS; bestand `dist/F2F-Setup-<versie>.exe`, toont de gebruikersovereenkomst)

## Documentatie in de app

Via **Documenten** in de toolbar: snelstart, handleiding, freeware-info.

## Copyright

Copyright © 2026 Jan De Nef (Film2Frame).  
**Contact:** Jan De Nef — softwarejdn@gmail.com  

Freeware — see [END_USER_AGREEMENT.md](END_USER_AGREEMENT.md).
