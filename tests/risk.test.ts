import { describe, expect, it } from 'vitest';
import { evaluateRisk } from '../src/risk.js';
import type { BotConfig, ExposureSnapshot, NormalizedTrade } from '../src/types.js';

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
    dashboardPort: 3007,
    sqlitePath: 'data/bot.sqlite',
    tradeLogPath: 'data/trades.json',
    selectedTradersPath: 'data/selected-traders.json',
    leaderboardPath: 'data/leaderboard.json',
    bullpenBin: 'bullpen',
    ...overrides,
  };
}

function trade(overrides: Partial<NormalizedTrade> = {}): NormalizedTrade {
  return {
    sourceWallet: '0xsource',
    externalId: 'source-1',
    timestamp: '2026-06-03T00:00:00.000Z',
    side: 'buy',
    marketSlug: 'will-test-pass',
    outcome: 'Yes',
    amountUsd: 100,
    price: 0.5,
    size: 200,
    resolutionTimestamp: '2026-06-10T00:00:00.000Z',
    raw: {},
    ...overrides,
  };
}

function exposure(overrides: Partial<ExposureSnapshot> = {}): ExposureSnapshot {
  return {
    marketExposureUsd: 0,
    totalOpenExposureUsd: 0,
    copiedTradesThisTraderHour: 0,
    ...overrides,
  };
}

describe('risk engine', () => {
  const now = new Date('2026-06-03T00:00:00.000Z');

  it('allows a valid copied buy and fixes requested size at $5', () => {
    const decision = evaluateRisk(config(), trade(), exposure(), now);
    expect(decision).toEqual({ allowed: true, requestedUsd: 5, reasons: [] });
  });

  it('rejects high prices, exposure breaches, hourly limits, and close resolution', () => {
    expect(evaluateRisk(config(), trade({ price: 0.91 }), exposure(), now).reasons).toContain('price_above_max');
    expect(evaluateRisk(config(), trade(), exposure({ marketExposureUsd: 21 }), now).reasons).toContain('market_exposure_limit');
    expect(evaluateRisk(config(), trade(), exposure({ totalOpenExposureUsd: 46 }), now).reasons).toContain('total_open_exposure_limit');
    expect(evaluateRisk(config(), trade(), exposure({ copiedTradesThisTraderHour: 3 }), now).reasons).toContain('trader_hourly_copy_limit');
    expect(evaluateRisk(config(), trade({ resolutionTimestamp: '2026-06-03T12:00:00.000Z' }), exposure(), now).reasons).toContain('market_close_to_resolution');
  });

  it('rejects missing required fields before copy simulation', () => {
    const decision = evaluateRisk(config(), trade({ price: undefined, resolutionTimestamp: undefined }), exposure(), now);
    expect(decision.allowed).toBe(false);
    expect(decision.reasons).toContain('missing_or_invalid_price');
    expect(decision.reasons).toContain('missing_resolution_timestamp');
  });
});
