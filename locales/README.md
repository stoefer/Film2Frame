# Translations (i18n)

Film2Frame ondersteunt Engels (en) en Nederlands (nl).  
Film2Frame supports English (en) and Dutch (nl).

## Nieuwe taal toevoegen / Add a new language

1. Kopieer `en.json` naar een nieuw bestand, bijv. `de.json` voor Duits.  
   Copy `en.json` to a new file, e.g. `de.json` for German.

2. Vertaal alle waarden naar de nieuwe taal.  
   Translate all values to the new language.

3. Registreer de taal in `main/locales.js`:
   ```javascript
   const SUPPORTED = ['en', 'nl', 'de'];  // voeg 'de' toe
   ```

4. Voeg de taal toe aan `main/prefs.js` (getLocale, setLocale, setSettings) waar `['en', 'nl']` wordt gecontroleerd.

5. Voeg een optie toe aan de taalkeuze in `index.html`:
   ```html
   <option value="de">Deutsch</option>
   ```

## Sleutelstructuur / Key structure

Sleutels zijn genest per sectie: `project.noProjectOpen`, `strip.loadButton`, enz.  
Keys are grouped by section: `project.noProjectOpen`, `strip.loadButton`, etc.

Placeholders gebruiken `{naam}`: `{current}`, `{total}`, `{total}`.  
Placeholders use `{name}`: `{current}`, `{total}`.
