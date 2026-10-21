# apps/web

The forecast-signals app (rebuild of the recon in `replica/`). Private build: only the owner email can sign in.

```bash
cp .env.example .env.local   # fill in DATABASE_URL, OWNER_EMAILS, RESEND_API_KEY, CRON_SECRET
npm install
npm run db:setup             # migrations + asset catalogue
npm run dev                  # http://localhost:3000
npm run build && npm start
npm run typecheck
npm run test:api             # against a running server, see replica/backend.md
npm run tokens               # after editing replica/design/tokens.json
```

Prices: Binance (crypto), ECB via Frankfurter (forex), Alpaca if keys are set (stocks/ETFs); other markets use a
labelled demo series. Scheduled jobs: `/api/cron/*`, driven by `.github/workflows/forecast-jobs.yml`.
Setup for production and the security checklist: `replica/backend.md`.
