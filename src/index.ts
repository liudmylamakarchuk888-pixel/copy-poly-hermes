import 'dotenv/config';
import { createServer } from 'node:http';
import { CopyTradingBot } from './bot.js';
import { BullpenCliClient } from './bullpen.js';
import { loadConfig } from './config.js';
import { createDashboard, BotController } from './dashboard.js';
import { createStateStore } from './state.js';
import { createJsonTradeLog } from './tradeLog.js';
import { selectGoodTraders } from './traderSelection.js';

async function main(): Promise<void> {
  const command = process.argv[2] ?? 'dashboard';
  const config = loadConfig();
  const store = createStateStore(config.sqlitePath);
  const log = createJsonTradeLog(config.tradeLogPath);
  const bullpen = new BullpenCliClient(config.bullpenBin, config.bullpenReadOnly);
  const bot = new CopyTradingBot(config, bullpen, store, log);

  if (!config.paperMode && command !== 'dashboard' && command !== 'select-traders') {
    throw new Error('Refusing to start worker/once: PAPER_MODE must remain true for this starter project.');
  }

  if (command === 'select-traders') {
    const result = selectGoodTraders({
      leaderboardPath: config.leaderboardPath,
      selectedTradersPath: config.selectedTradersPath,
      envPath: '.env',
      limit: Number(process.argv[3] ?? 10),
    });
    for (const trader of result.selected) {
      store.upsertWatchedTrader(trader.wallet, trader.username ?? null);
    }
    store.recordBotEvent('self_learning_traders_selected', {
      selectedCount: result.selected.length,
      rejectedCount: result.rejected.length,
      selectedTradersPath: result.selectedTradersPath,
      envPath: result.envPath,
    });
    console.log(JSON.stringify({
      ok: true,
      mode: 'PAPER',
      dryRun: true,
      selectedCount: result.selected.length,
      rejectedCount: result.rejected.length,
      selectedTradersPath: result.selectedTradersPath,
      envUpdated: result.envPath,
      selected: result.selected,
    }, null, 2));
    store.close();
    return;
  }

  if (command === 'once') {
    const result = await bot.runOnce();
    console.log(JSON.stringify({ ok: true, paperMode: true, dryRun: true, liveOrdersSent: 0, result }, null, 2));
    store.close();
    return;
  }

  if (command === 'worker') {
    if (config.copyWallets.length === 0) {
      console.error('COPY_WALLETS is empty. Set one or more source wallet addresses before running the worker.');
    }
    const tick = async () => {
      try {
        const result = await bot.runOnce();
        console.log(JSON.stringify({ timestamp: new Date().toISOString(), paperMode: true, dryRun: true, liveOrdersSent: 0, result }));
      } catch (error) {
        console.error(error instanceof Error ? error.message : String(error));
      }
    };
    await tick();
    setInterval(tick, config.pollIntervalMs);
    return;
  }

  if (command === 'dashboard') {
    const controller = new BotController(bot, config.pollIntervalMs);
    const app = createDashboard(config, store, log, controller);
    const server = createServer(app);
    server.listen(config.dashboardPort, '0.0.0.0', () => {
      console.log(`Dashboard listening on http://0.0.0.0:${config.dashboardPort}`);
      console.log(`Mode: ${config.paperMode && config.dryRun ? 'PAPER' : 'LIVE'}. Live controls require confirmation when LIVE mode is enabled.`);
    });
    return;
  }

  throw new Error(`Unknown command: ${command}. Use one of: dashboard, once, worker, select-traders.`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
