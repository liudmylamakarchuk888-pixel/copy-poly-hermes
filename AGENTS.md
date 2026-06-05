# AGENTS.md

## Cursor Cloud specific instructions

### Product overview

Single Node.js/TypeScript app: **poly-copy-hermes**, a Polymarket copy-trading bot starter in paper mode. One process exposes CLI subcommands (`dashboard`, `worker`, `once`, `select-traders`) and an Express dashboard. State is stored in local SQLite (`data/bot.sqlite`) and JSON under `data/`.

### Node.js version

README requires **Node.js 24+** (uses `node:sqlite`). The VM may ship with Node 22 at `/exec-daemon/node`, which takes precedence over nvm unless PATH is adjusted. Before running npm scripts, prepend Node 24:

```bash
export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$PATH"
node --version   # should print v24.x
```

Install Node 24 once if missing: `source ~/.nvm/nvm.sh && nvm install 24`.

### Bullpen CLI (external dependency)

Required for `worker`, `once`, and live dashboard polling (not for unit tests, which mock Bullpen). Install if missing:

```bash
curl -fsSL https://cli.bullpen.fi/install.sh | sh
export PATH="$HOME/.bullpen/bin:$PATH"
bullpen --version
```

Read-only Polymarket activity fetches work without login. Some commands (e.g. trade feed) require `bullpen login` (interactive device auth).

Set `BULLPEN_BIN=bullpen` in `.env` (default) or use the full path under `~/.bullpen/bin/bullpen`.

### Configuration

```bash
cp .env.example .env
# Set COPY_WALLETS or run: npm run select-traders -- <limit>
```

`data/` and `.env` are gitignored. Dashboard default port is **3007** (`DASHBOARD_PORT`), not 3000 as mentioned in README.

### Common commands

See `README.md` and `package.json` scripts:

| Command | Purpose |
|---|---|
| `npm test` | Vitest unit tests (no Bullpen needed) |
| `npm run build` | TypeScript compile to `dist/` |
| `npm run dashboard` | Web UI + REST API at `http://localhost:3007` |
| `npm run once` | One-shot wallet scan |
| `npm run dev -- worker` | Polling worker loop |
| `npm run select-traders -- <n>` | Score/select traders from `data/leaderboard.json` |

No ESLint or dedicated lint script is configured.

### Running the dashboard in background

Use tmux so the dev server survives between commands:

```bash
tmux -f /exec-daemon/tmux.portal.conf new-session -d -s poly-dashboard -c /workspace -- zsh -l
tmux -f /exec-daemon/tmux.portal.conf send-keys -t poly-dashboard:0.0 \
  'export PATH="$HOME/.bullpen/bin:$HOME/.nvm/versions/node/v24.16.0/bin:$PATH" && npm run dashboard' C-m
curl -s http://localhost:3007/api/status
```

### API smoke test

```bash
curl -s http://localhost:3007/api/status
curl -s -X POST http://localhost:3007/api/control -H 'Content-Type: application/json' -d '{"action":"start"}'
```
