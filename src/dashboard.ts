import express from 'express';
import type { CopyTradingBot } from './bot.js';
import { readSelectedTraders } from './traderSelection.js';
import type { BotConfig, RunOnceResult, StateStore, TradeLog } from './types.js';

export type BotRuntimeStatus = 'running' | 'paused' | 'stopped';
export type BotControlAction = 'start' | 'pause' | 'resume' | 'stop';

interface BotControllerSnapshot {
  status: BotRuntimeStatus;
  lastRunAt: string | null;
  lastResult: RunOnceResult | null;
  lastError: string | null;
  inFlight: boolean;
}

export class BotController {
  private status: BotRuntimeStatus = 'stopped';
  private timer: NodeJS.Timeout | null = null;
  private inFlight = false;
  private lastRunAt: string | null = null;
  private lastResult: RunOnceResult | null = null;
  private lastError: string | null = null;

  constructor(
    private readonly bot: CopyTradingBot,
    private readonly pollIntervalMs: number,
  ) {}

  start(): BotControllerSnapshot {
    if (this.status === 'running') return this.snapshot();
    this.status = 'running';
    this.ensureTimer();
    void this.tick();
    return this.snapshot();
  }

  pause(): BotControllerSnapshot {
    if (this.status !== 'stopped') {
      this.status = 'paused';
      this.clearTimer();
    }
    return this.snapshot();
  }

  resume(): BotControllerSnapshot {
    if (this.status === 'paused') {
      this.status = 'running';
      this.ensureTimer();
      void this.tick();
    }
    return this.snapshot();
  }

  stop(): BotControllerSnapshot {
    this.status = 'stopped';
    this.clearTimer();
    return this.snapshot();
  }

  snapshot(): BotControllerSnapshot {
    return {
      status: this.status,
      lastRunAt: this.lastRunAt,
      lastResult: this.lastResult,
      lastError: this.lastError,
      inFlight: this.inFlight,
    };
  }

  private ensureTimer(): void {
    if (this.timer != null) return;
    this.timer = setInterval(() => {
      void this.tick();
    }, this.pollIntervalMs);
  }

  private clearTimer(): void {
    if (this.timer != null) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private async tick(): Promise<void> {
    if (this.status !== 'running' || this.inFlight) return;
    this.inFlight = true;
    this.lastRunAt = new Date().toISOString();
    try {
      this.lastResult = await this.bot.runOnce();
      this.lastError = null;
    } catch (error) {
      this.lastError = error instanceof Error ? error.message : String(error);
    } finally {
      this.inFlight = false;
    }
  }
}

function mode(config: BotConfig): 'PAPER' | 'LIVE' {
  return config.paperMode && config.dryRun ? 'PAPER' : 'LIVE';
}

function assertLiveConfirmation(config: BotConfig, confirmation: unknown): void {
  if (mode(config) !== 'LIVE') return;
  if (confirmation !== 'CONFIRM LIVE') {
    throw new Error('LIVE mode control requires confirmation: CONFIRM LIVE');
  }
}

function latestEntries(log: TradeLog, limit: number) {
  return log.readAll().slice(-limit).reverse();
}

function selectedTradersForDashboard(config: BotConfig, store: StateStore) {
  const watchedTraders = store.listWatchedTraders();
  const watchedByWallet = new Map(watchedTraders.map((trader) => [trader.wallet.toLowerCase(), trader]));
  const selfLearningSelectedTraders = readSelectedTraders(config.selectedTradersPath);
  if (selfLearningSelectedTraders.length > 0) {
    return selfLearningSelectedTraders.map((trader) => ({
      ...trader,
      watch: watchedByWallet.get(trader.wallet.toLowerCase()) ?? null,
    }));
  }
  return watchedTraders;
}

export function createDashboard(config: BotConfig, store: StateStore, log: TradeLog, controller: BotController): express.Express {
  const app = express();
  app.use(express.json());

  app.get('/api/status', (_req, res) => {
    const selectedTraders = selectedTradersForDashboard(config, store);
    res.json({
      ok: true,
      botStatus: controller.snapshot().status,
      runtime: controller.snapshot(),
      mode: mode(config),
      paperMode: config.paperMode,
      dryRun: config.dryRun,
      bullpenReadOnly: config.bullpenReadOnly,
      selectedTraders,
      configuredCopyWallets: config.copyWallets,
      stats: store.getDashboardStats(),
      risk: {
        fixedCopyBuyUsd: config.fixedCopyBuyUsd,
        maxExposurePerMarketUsd: config.maxExposurePerMarketUsd,
        maxTotalOpenExposureUsd: config.maxTotalOpenExposureUsd,
        maxCopiedTradesPerTraderPerHour: config.maxCopiedTradesPerTraderPerHour,
        maxCopyPrice: config.maxCopyPrice,
        minHoursToResolution: config.minHoursToResolution,
      },
      latestTradeLog: latestEntries(log, 25),
    });
  });

  app.get('/api/traders', (_req, res) => {
    res.json(selectedTradersForDashboard(config, store));
  });

  app.get('/api/trades', (req, res) => {
    const limit = Number(req.query.limit ?? 100);
    res.json(store.listPaperTrades(Number.isFinite(limit) ? limit : 100));
  });

  app.get('/api/positions', (req, res) => {
    const limit = Number(req.query.limit ?? 100);
    res.json(store.listOpenPositions(Number.isFinite(limit) ? limit : 100));
  });

  app.get('/api/errors', (req, res) => {
    const limit = Number(req.query.limit ?? 100);
    res.json(store.listErrors(Number.isFinite(limit) ? limit : 100));
  });

  app.get('/api/logs', (req, res) => {
    const limit = Number(req.query.limit ?? 100);
    res.json(latestEntries(log, Number.isFinite(limit) ? limit : 100));
  });

  app.post('/api/control', (req, res) => {
    try {
      const action = String(req.body?.action ?? '') as BotControlAction;
      assertLiveConfirmation(config, req.body?.confirmation);
      let runtime;
      switch (action) {
        case 'start':
          runtime = controller.start();
          break;
        case 'pause':
          runtime = controller.pause();
          break;
        case 'resume':
          runtime = controller.resume();
          break;
        case 'stop':
          runtime = controller.stop();
          break;
        default:
          res.status(400).json({ ok: false, error: `Unknown control action: ${action}` });
          return;
      }
      res.json({ ok: true, mode: mode(config), runtime });
    } catch (error) {
      res.status(403).json({ ok: false, error: error instanceof Error ? error.message : String(error) });
    }
  });

  app.get('/', (_req, res) => {
    res.type('html').send(`<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Polymarket Copy Bot Dashboard</title>
  <style>
    :root { color-scheme: dark; }
    body { font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; margin: 0; background: #020617; color: #e2e8f0; }
    header { padding: 1.25rem 1.5rem; border-bottom: 1px solid #1e293b; display: flex; justify-content: space-between; gap: 1rem; align-items: center; position: sticky; top: 0; background: rgba(2, 6, 23, 0.95); backdrop-filter: blur(10px); }
    h1 { margin: 0; font-size: 1.35rem; }
    main { padding: 1.5rem; display: grid; gap: 1rem; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(210px, 1fr)); gap: 1rem; }
    .card { background: #0f172a; border: 1px solid #1e293b; border-radius: 14px; padding: 1rem; box-shadow: 0 14px 40px rgba(0,0,0,0.24); }
    .label { color: #94a3b8; font-size: 0.82rem; text-transform: uppercase; letter-spacing: 0.05em; }
    .value { font-size: 1.55rem; font-weight: 750; margin-top: 0.3rem; word-break: break-word; }
    .paper { color: #86efac; }
    .live { color: #fca5a5; }
    .running { color: #86efac; }
    .paused { color: #fde68a; }
    .stopped { color: #fca5a5; }
    button { border: 0; border-radius: 10px; padding: 0.7rem 1rem; font-weight: 750; color: #020617; background: #38bdf8; cursor: pointer; }
    button:hover { filter: brightness(1.1); }
    button.danger { background: #fb7185; }
    button.warn { background: #facc15; }
    table { width: 100%; border-collapse: collapse; }
    th, td { text-align: left; padding: 0.65rem; border-bottom: 1px solid #1e293b; vertical-align: top; }
    th { color: #94a3b8; font-size: 0.82rem; }
    code, pre { background: #020617; color: #cbd5e1; padding: 0.75rem; border-radius: 10px; overflow: auto; }
    .controls { display: flex; flex-wrap: wrap; gap: 0.75rem; }
    .muted { color: #94a3b8; }
    .error { color: #fca5a5; }
  </style>
</head>
<body>
  <header>
    <div>
      <h1>Polymarket Copy Bot Dashboard</h1>
      <div class="muted">Express dashboard bound to 0.0.0.0:${config.dashboardPort}</div>
    </div>
    <div class="controls">
      <button onclick="control('start')">Start bot</button>
      <button class="warn" onclick="control('pause')">Pause bot</button>
      <button onclick="control('resume')">Resume bot</button>
      <button class="danger" onclick="control('stop')">Stop bot</button>
    </div>
  </header>
  <main>
    <div id="notice" class="card muted">Loading...</div>
    <section class="grid" id="metrics"></section>
    <section class="card">
      <h2>Selected traders</h2>
      <div id="traders"></div>
    </section>
    <section class="card">
      <h2>Open positions</h2>
      <div id="positions"></div>
    </section>
    <section class="card">
      <h2>Latest trade log</h2>
      <pre id="logs">Loading...</pre>
    </section>
  </main>
  <script>
    const fmtUsd = (value) => value == null ? 'N/A' : '$' + Number(value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const fmtPct = (value) => value == null ? 'N/A' : (Number(value) * 100).toFixed(1) + '%';
    const htmlEscape = (s) => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

    function metric(label, value, cls = '') {
      return '<div class="card"><div class="label">' + htmlEscape(label) + '</div><div class="value ' + cls + '">' + htmlEscape(value) + '</div></div>';
    }

    async function control(action) {
      const status = await fetch('/api/status').then(r => r.json());
      let confirmation;
      if (status.mode === 'LIVE') {
        confirmation = prompt('LIVE mode is enabled. Type CONFIRM LIVE to ' + action + ' the bot.');
        if (confirmation !== 'CONFIRM LIVE') return;
      }
      const response = await fetch('/api/control', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action, confirmation })
      }).then(r => r.json());
      if (!response.ok) alert(response.error || 'Control command failed');
      await refresh();
    }

    function renderTraders(status) {
      const traders = status.selectedTraders.length ? status.selectedTraders : status.configuredCopyWallets.map(wallet => ({ wallet, username: null, active: true, initializedAt: null }));
      if (traders.length === 0) return '<p class="muted">No selected traders configured.</p>';
      return '<table><thead><tr><th>Rank</th><th>Wallet</th><th>Username</th><th>Score</th><th>7d P&L</th><th>7d Win</th><th>Risk</th></tr></thead><tbody>' +
        traders.map(t => '<tr><td>' + htmlEscape(t.rank || '—') + '</td><td><code>' + htmlEscape(t.wallet) + '</code></td><td>' + htmlEscape(t.username || '—') + '</td><td>' + htmlEscape(t.score ?? '—') + '</td><td>' + htmlEscape(t.metrics ? fmtUsd(t.metrics.pnl7d) : '—') + '</td><td>' + htmlEscape(t.metrics ? fmtPct(t.metrics.winRate7d) : '—') + '</td><td>' + htmlEscape(t.metrics?.riskTier || '—') + '</td></tr>').join('') +
        '</tbody></table>';
    }

    function renderPositions(positions) {
      if (positions.length === 0) return '<p class="muted">No open positions.</p>';
      return '<table><thead><tr><th>Market</th><th>Outcome</th><th>Side</th><th>Amount</th><th>Wallet</th><th>Opened</th></tr></thead><tbody>' +
        positions.map(p => '<tr><td>' + htmlEscape(p.marketSlug) + '</td><td>' + htmlEscape(p.outcome) + '</td><td>' + htmlEscape(p.side) + '</td><td>' + htmlEscape(fmtUsd(p.amountUsd)) + '</td><td><code>' + htmlEscape(p.sourceWallet) + '</code></td><td>' + htmlEscape(p.openedAt) + '</td></tr>').join('') +
        '</tbody></table>';
    }

    async function refresh() {
      const [status, positions] = await Promise.all([
        fetch('/api/status').then(r => r.json()),
        fetch('/api/positions?limit=50').then(r => r.json())
      ]);
      const s = status.stats;
      document.getElementById('notice').innerHTML =
        'Bot status: <b class="' + status.botStatus + '">' + htmlEscape(status.botStatus.toUpperCase()) + '</b>' +
        ' · Mode: <b class="' + (status.mode === 'PAPER' ? 'paper' : 'live') + '">' + htmlEscape(status.mode) + '</b>' +
        (status.runtime.lastError ? ' · <span class="error">Last error: ' + htmlEscape(status.runtime.lastError) + '</span>' : '') +
        '<br><span class="muted">Last run: ' + htmlEscape(status.runtime.lastRunAt || 'never') + '</span>';
      document.getElementById('metrics').innerHTML = [
        metric('Bot status', status.botStatus, status.botStatus),
        metric('Mode', status.mode, status.mode === 'PAPER' ? 'paper' : 'live'),
        metric('Total copied trades', s.totalCopiedTrades),
        metric('Open positions', s.openPositions),
        metric('Realized P&L', fmtUsd(s.realizedPnlUsd)),
        metric('Unrealized P&L', fmtUsd(s.unrealizedPnlUsd)),
        metric('Win rate', fmtPct(s.winRate)),
        metric('Winners / losers', s.winners + ' / ' + s.losers),
        metric('Failed trades', s.failedTrades),
        metric('Skipped trades', s.skippedTrades)
      ].join('');
      document.getElementById('traders').innerHTML = renderTraders(status);
      document.getElementById('positions').innerHTML = renderPositions(positions);
      document.getElementById('logs').textContent = JSON.stringify(status.latestTradeLog, null, 2);
    }
    refresh(); setInterval(refresh, 5000);
  </script>
</body>
</html>`);
  });

  return app;
}
