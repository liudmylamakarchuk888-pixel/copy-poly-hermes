import { describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config.js';

describe('config', () => {
  it('defaults to safe paper mode and read-only Bullpen calls', () => {
    const config = loadConfig({});
    expect(config.paperMode).toBe(true);
    expect(config.bullpenReadOnly).toBe(true);
    expect(config.dryRun).toBe(true);
    expect(config.fixedCopyBuyUsd).toBe(5);
    expect(config.maxExposurePerMarketUsd).toBe(25);
    expect(config.maxTotalOpenExposureUsd).toBe(50);
    expect(config.maxCopiedTradesPerTraderPerHour).toBe(3);
    expect(config.maxCopyPrice).toBe(0.90);
    expect(config.dashboardPort).toBe(3007);
    expect(config.pollIntervalMs).toBe(30_000);
    expect(config.tradeLogPath).toBe('data/trades.json');
    expect(config.selectedTradersPath).toBe('data/selected-traders.json');
    expect(config.leaderboardPath).toBe('data/leaderboard.json');
    expect(config.sqlitePath).toBe('data/bot.sqlite');
  });

  it('parses copy wallet list and sizing from environment', () => {
    const config = loadConfig({
      COPY_WALLETS: '0xabc, 0xdef',
      COPY_TRADE_FRACTION: '0.25',
      MAX_PAPER_TRADE_USD: '15',
      DASHBOARD_PORT: '4321',
      DRY_RUN: 'false',
      FIXED_COPY_BUY_USD: '7',
    });
    expect(config.copyWallets).toEqual(['0xabc', '0xdef']);
    expect(config.copyTradeFraction).toBe(0.25);
    expect(config.maxPaperTradeUsd).toBe(15);
    expect(config.dashboardPort).toBe(4321);
    expect(config.dryRun).toBe(false);
    expect(config.fixedCopyBuyUsd).toBe(7);
  });
});
