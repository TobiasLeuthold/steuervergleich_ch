# Steuervergleich Schweiz

Interaktive Karte und Steuerkurven der Einkommenssteuer in allen Schweizer Gemeinden.

- **Karte**: Bruttolohn eingeben, jede Gemeinde wird nach der jährlichen Steuer (Bund + Kanton + Gemeinde, optional Kirche) eingefärbt. Hover zeigt die Aufteilung, Klick hebt eine Gemeinde hervor; darunter Rangliste mit Suche und Kantonsfilter.
- **Diagramm**: Steuerbelastung in % des Bruttolohns (0 bis 1 Mio. CHF). Pro gewähltem Kanton (max. 8 gleichzeitig) drei Linien: Durchschnitt der Gemeinden (ungewichtet), tiefste und höchste Gemeinde (punktweise, der Gemeindename steht im Tooltip). Tabellenansicht inklusive.
- **Haushalt**: ledig / verheiratet (Alleinverdiener) / verheiratet mit 2 Kindern; Konfession: keine, reformiert, römisch-katholisch.

## Daten

Quelle: Eidgenössische Steuerverwaltung (ESTV), [Steuerrechner](https://swisstaxcalculator.estv.admin.ch), Steuerjahr 2026.
`API_calculateManySimpleTaxes` liefert für einen Bruttolohn die Steuern aller Gemeinden eines Kantons; Sozialabzüge (AHV/IV/EO, ALV, NBU, BVG) und Standardabzüge rechnet der ESTV-Rechner selbst.

- 3 Haushaltsprofile × 3 Konfessionen × 26 Kantone × 85 Einkommensstufen (0–200k in 5k-, 200–400k in 10k-, 400k–1 Mio. in 25k-Schritten) ≈ 19'900 Abfragen
- Zwischen den Stufen wird linear interpoliert
- Kirchensteuer = Differenz zur Berechnung ohne Konfession (in SO hängt auch die Personalsteuer von der Konfession ab)
- Kein Vermögen; Einkommen vollständig aus unselbständiger Erwerbstätigkeit einer Person

Gemeindegrenzen: BFS / swisstopo (generalisiert, Stand 2026) via [swiss-maps](https://github.com/interactivethings/swiss-maps) 4.7.0. Drei unbewohnte Gebiete (Staatswald Galm, zwei Tessiner Kommunanzen) haben keine Steuerdaten.

### Daten aktualisieren

```bash
python3 scripts/fetch_estv.py --year 2026   # ~10 min, Rohdaten nach data/raw/ (gitignored, resumable)
python3 scripts/build_data.py --year 2026   # schreibt public/data/meta.json + taxes_<profil>.json
```

Für ein neues Steuerjahr zusätzlich `public/data/map.json` aus der passenden swiss-maps-Version (`<jahr>/ch-combined.json`) ersetzen, damit die Gemeindefusionen übereinstimmen.

## Entwicklung

```bash
npm install
npm run dev      # http://localhost:3000
npm run build    # statischer Export nach out/
```

Next.js mit `output: "export"`: das Ergebnis ist eine statische Seite (HTML/JS + JSON) und läuft auf Vercel, Netlify oder GitHub Pages. Für GitHub Pages unter `/steuervergleich_ch` beim Build `NEXT_PUBLIC_BASE_PATH=/steuervergleich_ch` setzen.
