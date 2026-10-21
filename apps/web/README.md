# apps/web

The forecast-signals web app (rebuild of the recon in `replica/`).

```bash
npm install
npm run dev          # http://localhost:3000
npm run build && npm start
npm run typecheck
npm run tokens       # regenerate tokens.css after editing replica/design/tokens.json
```

Data is generated demo data (`src/lib/data/fake.ts`); users live in `.data/store.json` (gitignored). Checkout is a
demo that charges nothing. `/design` shows every primitive.
