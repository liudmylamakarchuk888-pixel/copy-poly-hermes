# Polymarket Copy-Trading Bot (Bullpen CLI + TypeScript)

Local TypeScript/Node.js starter for a Polymarket copy-trading bot.

Safety posture:
- Starts in paper mode.
- Uses Bullpen CLI as the trading/data layer.
- Does not use the raw Polymarket SDK.
- Uses Bullpen `--read-only` for data and preview calls by default.
- Does not send live buy/sell/approve/wrap/withdraw commands.

## Requirements

- Node.js 24+
- Authenticated Bullpen CLI (`bullpen --read-only status` should work)

## Setup

```bash
cp .env.example .env
# edit COPY_WALLETS in .env
npm install
npm test
npm run build
```

## Run a one-shot scan

```bash
npm run once
```

## Run the worker loop

```bash
npm run dev -- worker
```

## Run the local dashboard

```bash
npm run dashboard
# open http://localhost:3000
```

## State and logs

- SQLite state: `data/bot.sqlite`
- Human-readable trade log: `data/trades.json`

## Configuration

See `.env.example`.

Important variables:
- `PAPER_MODE=true` keeps the bot in paper mode.
- `BULLPEN_READ_ONLY=true` adds Bullpen's global read-only flag.
- `COPY_WALLETS` is a comma-separated list of source wallets to monitor.
- `COPY_TRADE_FRACTION` and `MAX_PAPER_TRADE_USD` size the simulated copy trade.

## Notes

Bullpen JSON response shapes may evolve. The normalizer in `src/bullpen.ts` accepts common field names and ignores activity rows that do not include required copy-trading fields: id/timestamp/side/market slug/outcome/USD amount.

Live execution is intentionally not implemented. Add it only after explicit authorization, dry-run payload verification, and a separate safety review.
