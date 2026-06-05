import { describe, expect, it, vi } from 'vitest';
import { CopyTradingBot } from '../src/bot.js';
import type { BotConfig, BullpenClient, NormalizedTrade, StateStore, TradeLog } from '../src/types.js';

function config(overrides: Partial<BotConfig> = {}): BotConfig {
  return {
    copyWallets: ['0xsource'],
    pollIntervalMs: 30_000,
    paperMode: true,
    bullpenReadOnly: true,
    dryRun: true,
    fixedCopyBuyUsd: 5,
    maxExposurePerMarketUsd: 25,
    maxTotalOpenExposureUsd: 50,
    maxCopiedTradesPerTraderPerHour: 3,
    maxCopyPrice: 0.9,
    minHoursToResolution: 24,
    copyTradeFraction: 0.5,
    maxPaperTradeUsd: 10,
    minSourceTradeUsd: 1,
    dashboardPort: 3000,
    sqlitePath: 'data/bot.sqlite',
    tradeLogPath: 'data/trades.json',
    selectedTradersPath: 'data/selected-traders.json',
    leaderboardPath: 'data/leaderboard.json',
    bullpenBin: 'bullpen',
    ...overrides,
  };
}

describe('copy trading bot', () => {
  it('copies new Bullpen source trades into paper trades without executing live orders', async () => {
    const sourceTrade: NormalizedTrade = {
      sourceWallet: '0xsource',
      externalId: 'source-1',
      timestamp: '2026-06-03T00:00:00.000Z',
      side: 'buy',
      marketSlug: 'will-test-pass',
      outcome: 'Yes',
      amountUsd: 30,
      price: 0.42,
      size: 71.42,
      resolutionTimestamp: '2026-06-10T00:00:00.000Z',
      raw: { id: 'source-1' },
    };
    const bullpen: BullpenClient = {
      getRecentTrades: vi.fn(async () => [sourceTrade]),
      previewTrade: vi.fn(async () => ({ ok: true, raw: { estimated: true } })),
    };
    const store: StateStore = {
      upsertWatchedTrader: vi.fn(),
      isWatchedTraderInitialized: vi.fn(() => true),
      getWatchedTraderInitializedAt: vi.fn(() => '2026-06-02T00:00:00.000Z'),
      markWatchedTraderInitialized: vi.fn(),
      hasSeenSourceTrade: vi.fn(() => false),
      recordSeenSourceTrade: vi.fn(),
      recordPaperTrade: vi.fn(),
      recordPosition: vi.fn(),
      findOpenPositionForSourceTrade: vi.fn(() => null),
      findOpenPositionsForSourceTrade: vi.fn(() => []),
      closePosition: vi.fn(() => null),
      getOpenExposureUsd: vi.fn(() => 0),
      countCopiedTradesForTraderSince: vi.fn(() => 0),
      recordBotEvent: vi.fn(),
      recordError: vi.fn(),
      listWatchedTraders: vi.fn(() => []),
      listPaperTrades: vi.fn(() => []),
      listOpenPositions: vi.fn(() => []),
      listErrors: vi.fn(() => []),
      getStats: vi.fn(() => ({
        watchedTraders: 1,
        initializedWatchedTraders: 1,
        seenSourceTrades: 0,
        copiedTrades: 0,
        positions: 0,
        openExposureUsd: 0,
        botEvents: 0,
        errors: 0,
      })),
      getDashboardStats: vi.fn(() => ({
        watchedTraders: 1,
        initializedWatchedTraders: 1,
        seenSourceTrades: 0,
        totalCopiedTrades: 0,
        openPositions: 0,
        totalPositions: 0,
        openExposureUsd: 0,
        realizedPnlUsd: null,
        unrealizedPnlUsd: null,
        winRate: null,
        winners: 0,
        losers: 0,
        failedTrades: 0,
        skippedTrades: 0,
        botEvents: 0,
        errors: 0,
      })),
      close: vi.fn(),
    };
    const log: TradeLog = { append: vi.fn(), readAll: vi.fn(() => []) };

    const bot = new CopyTradingBot(config(), bullpen, store, log);
    const result = await bot.runOnce();

    expect(result.scannedWallets).toBe(1);
    expect(result.newSourceTrades).toBe(1);
    expect(result.paperTradesRecorded).toBe(1);
    expect(bullpen.previewTrade).toHaveBeenCalledWith({
      marketSlug: 'will-test-pass',
      outcome: 'Yes',
      side: 'buy',
      amountUsd: 5,
    });
    expect(store.recordPaperTrade).toHaveBeenCalledWith(expect.objectContaining({
      sourceExternalId: 'source-1',
      requestedUsd: 5,
      paperMode: true,
      dryRun: true,
      status: 'paper_recorded',
    }));
    expect(store.recordPosition).toHaveBeenCalledWith(expect.objectContaining({
      copiedTradeId: expect.any(String),
      amountUsd: 5,
      status: 'open',
    }));
    expect(log.append).toHaveBeenCalledWith(expect.objectContaining({ type: 'paper_trade' }));
  });

  it('marks existing recent trades as seen on first startup without copying history', async () => {
    const sourceTrade: NormalizedTrade = {
      sourceWallet: '0xsource',
      externalId: 'historical-1',
      timestamp: '2026-06-03T00:00:00.000Z',
      side: 'buy',
      marketSlug: 'will-test-pass',
      outcome: 'Yes',
      amountUsd: 30,
      raw: { id: 'historical-1' },
    };
    const bullpen: BullpenClient = {
      getRecentTrades: vi.fn(async () => [sourceTrade]),
      previewTrade: vi.fn(async () => ({ ok: true, raw: { estimated: true } })),
    };
    const store: StateStore = {
      upsertWatchedTrader: vi.fn(),
      isWatchedTraderInitialized: vi.fn(() => false),
      getWatchedTraderInitializedAt: vi.fn(() => null),
      markWatchedTraderInitialized: vi.fn(),
      hasSeenSourceTrade: vi.fn(() => false),
      recordSeenSourceTrade: vi.fn(),
      recordPaperTrade: vi.fn(),
      recordPosition: vi.fn(),
      findOpenPositionForSourceTrade: vi.fn(() => null),
      findOpenPositionsForSourceTrade: vi.fn(() => []),
      closePosition: vi.fn(() => null),
      getOpenExposureUsd: vi.fn(() => 0),
      countCopiedTradesForTraderSince: vi.fn(() => 0),
      recordBotEvent: vi.fn(),
      recordError: vi.fn(),
      listWatchedTraders: vi.fn(() => []),
      listPaperTrades: vi.fn(() => []),
      listOpenPositions: vi.fn(() => []),
      listErrors: vi.fn(() => []),
      getStats: vi.fn(() => ({
        watchedTraders: 1,
        initializedWatchedTraders: 0,
        seenSourceTrades: 0,
        copiedTrades: 0,
        positions: 0,
        openExposureUsd: 0,
        botEvents: 0,
        errors: 0,
      })),
      getDashboardStats: vi.fn(() => ({
        watchedTraders: 1,
        initializedWatchedTraders: 1,
        seenSourceTrades: 0,
        totalCopiedTrades: 0,
        openPositions: 0,
        totalPositions: 0,
        openExposureUsd: 0,
        realizedPnlUsd: null,
        unrealizedPnlUsd: null,
        winRate: null,
        winners: 0,
        losers: 0,
        failedTrades: 0,
        skippedTrades: 0,
        botEvents: 0,
        errors: 0,
      })),
      close: vi.fn(),
    };
    const log: TradeLog = { append: vi.fn(), readAll: vi.fn(() => []) };

    const bot = new CopyTradingBot(config(), bullpen, store, log);
    const result = await bot.runOnce();

    expect(result.sourceTradesSeen).toBe(1);
    expect(result.newSourceTrades).toBe(0);
    expect(result.paperTradesRecorded).toBe(0);
    expect(store.recordSeenSourceTrade).toHaveBeenCalledWith(sourceTrade);
    expect(store.markWatchedTraderInitialized).toHaveBeenCalledWith('0xsource');
    expect(bullpen.previewTrade).not.toHaveBeenCalled();
    expect(store.recordPaperTrade).not.toHaveBeenCalled();
    expect(log.append).toHaveBeenCalledWith(expect.objectContaining({ type: 'startup_backfill_seen' }));
  });


  it('logs Bullpen command failures and keeps scanning later wallets', async () => {
    const copiedTrade: NormalizedTrade = {
      sourceWallet: '0xok',
      externalId: 'ok-1',
      timestamp: '2026-06-03T00:00:00.000Z',
      side: 'buy',
      marketSlug: 'will-test-pass',
      outcome: 'Yes',
      amountUsd: 30,
      price: 0.4,
      resolutionTimestamp: '2026-06-10T00:00:00.000Z',
      raw: { id: 'ok-1' },
    };
    const bullpen: BullpenClient = {
      getRecentTrades: vi.fn(async (wallet: string) => {
        if (wallet === '0xfail') throw new Error('Bullpen failed');
        return [copiedTrade];
      }),
      previewTrade: vi.fn(async () => ({ ok: true, raw: { estimated: true } })),
    };
    const store: StateStore = {
      upsertWatchedTrader: vi.fn(),
      isWatchedTraderInitialized: vi.fn(() => true),
      getWatchedTraderInitializedAt: vi.fn(() => '2026-06-02T00:00:00.000Z'),
      markWatchedTraderInitialized: vi.fn(),
      hasSeenSourceTrade: vi.fn(() => false),
      recordSeenSourceTrade: vi.fn(),
      recordPaperTrade: vi.fn(),
      recordPosition: vi.fn(),
      findOpenPositionForSourceTrade: vi.fn(() => null),
      findOpenPositionsForSourceTrade: vi.fn(() => []),
      closePosition: vi.fn(() => null),
      getOpenExposureUsd: vi.fn(() => 0),
      countCopiedTradesForTraderSince: vi.fn(() => 0),
      recordBotEvent: vi.fn(),
      recordError: vi.fn(),
      listWatchedTraders: vi.fn(() => []),
      listPaperTrades: vi.fn(() => []),
      listOpenPositions: vi.fn(() => []),
      listErrors: vi.fn(() => []),
      getStats: vi.fn(() => ({
        watchedTraders: 2,
        initializedWatchedTraders: 2,
        seenSourceTrades: 0,
        copiedTrades: 0,
        positions: 0,
        openExposureUsd: 0,
        botEvents: 0,
        errors: 0,
      })),
      getDashboardStats: vi.fn(() => ({
        watchedTraders: 1,
        initializedWatchedTraders: 1,
        seenSourceTrades: 0,
        totalCopiedTrades: 0,
        openPositions: 0,
        totalPositions: 0,
        openExposureUsd: 0,
        realizedPnlUsd: null,
        unrealizedPnlUsd: null,
        winRate: null,
        winners: 0,
        losers: 0,
        failedTrades: 0,
        skippedTrades: 0,
        botEvents: 0,
        errors: 0,
      })),
      close: vi.fn(),
    };
    const log: TradeLog = { append: vi.fn(), readAll: vi.fn(() => []) };

    const bot = new CopyTradingBot(config({ copyWallets: ['0xfail', '0xok'] }), bullpen, store, log);
    const result = await bot.runOnce();

    expect(result.errors).toBe(1);
    expect(result.paperTradesRecorded).toBe(1);
    expect(store.recordError).toHaveBeenCalledWith('bullpen_get_recent_trades', 'Bullpen failed', { wallet: '0xfail' });
  });

  it('closes an existing paper position when the source trader sells the same outcome', async () => {
    const sourceTrade: NormalizedTrade = {
      sourceWallet: '0xsource',
      externalId: 'sell-1',
      timestamp: '2026-06-04T00:00:00.000Z',
      side: 'sell',
      marketSlug: 'will-test-pass',
      outcome: 'Yes',
      amountUsd: 7,
      price: 0.7,
      raw: { id: 'sell-1' },
    };
    const bullpen: BullpenClient = {
      getRecentTrades: vi.fn(async () => [sourceTrade]),
      previewTrade: vi.fn(async () => ({ ok: true, raw: { estimated: true } })),
    };
    const openPosition = {
      id: 'position-1',
      copiedTradeId: 'paper-1',
      sourceWallet: '0xsource',
      marketSlug: 'will-test-pass',
      outcome: 'Yes',
      side: 'buy' as const,
      amountUsd: 5,
      status: 'open' as const,
      openedAt: '2026-06-03T00:00:00.000Z',
    };
    const store: StateStore = {
      upsertWatchedTrader: vi.fn(),
      isWatchedTraderInitialized: vi.fn(() => true),
      getWatchedTraderInitializedAt: vi.fn(() => '2026-06-02T00:00:00.000Z'),
      markWatchedTraderInitialized: vi.fn(),
      hasSeenSourceTrade: vi.fn(() => false),
      recordSeenSourceTrade: vi.fn(),
      recordPaperTrade: vi.fn(),
      recordPosition: vi.fn(),
      findOpenPositionForSourceTrade: vi.fn(() => openPosition),
      findOpenPositionsForSourceTrade: vi.fn(() => [openPosition]),
      closePosition: vi.fn(() => ({ ...openPosition, status: 'closed' as const, closedAt: sourceTrade.timestamp, realizedPnlUsd: 2 })),
      getOpenExposureUsd: vi.fn(() => 5),
      countCopiedTradesForTraderSince: vi.fn(() => 0),
      recordBotEvent: vi.fn(),
      recordError: vi.fn(),
      listWatchedTraders: vi.fn(() => []),
      listPaperTrades: vi.fn(() => []),
      listOpenPositions: vi.fn(() => []),
      listErrors: vi.fn(() => []),
      getStats: vi.fn(() => ({
        watchedTraders: 1,
        initializedWatchedTraders: 1,
        seenSourceTrades: 0,
        copiedTrades: 1,
        positions: 1,
        openExposureUsd: 5,
        botEvents: 0,
        errors: 0,
      })),
      getDashboardStats: vi.fn(() => ({
        watchedTraders: 1,
        initializedWatchedTraders: 1,
        seenSourceTrades: 0,
        totalCopiedTrades: 1,
        openPositions: 1,
        totalPositions: 1,
        openExposureUsd: 5,
        realizedPnlUsd: null,
        unrealizedPnlUsd: null,
        winRate: null,
        winners: 0,
        losers: 0,
        failedTrades: 0,
        skippedTrades: 0,
        botEvents: 0,
        errors: 0,
      })),
      close: vi.fn(),
    };
    const log: TradeLog = { append: vi.fn(), readAll: vi.fn(() => []) };

    const bot = new CopyTradingBot(config(), bullpen, store, log);
    const result = await bot.runOnce();

    expect(result.newSourceTrades).toBe(1);
    expect(result.paperTradesRecorded).toBe(0);
    expect(result.skipped).toBe(0);
    expect(store.findOpenPositionsForSourceTrade).toHaveBeenCalledWith({
      sourceWallet: '0xsource',
      marketSlug: 'will-test-pass',
      outcome: 'Yes',
    });
    expect(store.closePosition).toHaveBeenCalledWith('position-1', expect.objectContaining({
      closedAt: sourceTrade.timestamp,
      raw: expect.objectContaining({ sourceExternalId: 'sell-1' }),
    }));
    expect(bullpen.previewTrade).not.toHaveBeenCalled();
    expect(store.recordBotEvent).toHaveBeenCalledWith('paper_position_closed', expect.any(Object));
    expect(log.append).toHaveBeenCalledWith(expect.objectContaining({ type: 'paper_position_closed' }));
  });

  it('fails closed if live mode is requested', async () => {
    const bot = new CopyTradingBot(config({ paperMode: false }), {} as BullpenClient, {} as StateStore, {} as TradeLog);
    await expect(bot.runOnce()).rejects.toThrow(/Live trading is disabled/);
  });
});
