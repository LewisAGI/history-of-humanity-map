# History of humanity map

A single-page globe of historical and mythological events from 300,000 BCE to the present.

## Develop

```bash
npm install
npm run dev
```

## Test

```bash
npm test
npm run test:e2e
```

## Data

Events live in [`data/events.json`](data/events.json). Years are historical: `-500` is 500 BCE, `1066` is 1066 CE, and there is no year 0.

An event is shown in the selected period when the two closed intervals overlap (`event.start <= period.end` and `event.end >= period.start`). An event that crosses a boundary, including 3000 BCE, appears in every period it touches.

`type` is `history` or `myth`. A `path` of `{lat, lng}` waypoints draws a curved arrow when the pin is clicked. Myths use a traditional date when one exists; otherwise the pin marks the earliest written source, and `dateNote` says which. If `dateNote` contains “approximate”, the pop-up date is prefixed with “approx.”

`place` and `continent` are included so the pop-up and the coverage check stay honest. `continent` is one of Africa, Asia, Europe, North America, South America, Oceania, or Antarctica.

## Time controls

Before civilisation runs from 300,000 BCE through 3001 BCE in 5,000-year steps. After civilisation runs from 3000 BCE through the present year in 50-year steps (1066 falls in 1050–1099). The slider covers whichever era is selected, so both eras use its full width.

## Licence

The code and the event text are under the MIT licence (see `LICENSE`). The globe uses NASA Blue Marble imagery (public domain) and Natural Earth land polygons (public domain).

## Deploy

Cloudflare Pages, project `history-of-humanity-map`. Pushes to `main` deploy production. Pushes to any other branch deploy a preview on that branch and do not publish production. The workflow reads the `CF_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` secrets.
