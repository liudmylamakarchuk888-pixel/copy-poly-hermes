import { z } from 'zod';
import type { BotConfig } from './types.js';

function boolFromEnv(value: string | undefined, defaultValue: boolean): boolean {
  if (value == null || value === '') return defaultValue;
  return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
}

function listFromEnv(value: string | undefined): string[] {
  return (value ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

const numeric = (defaultValue: number) => z.coerce.number().finite().positive().default(defaultValue);

export function loadConfig(env: NodeJS.ProcessEnv = process.env): BotConfig {
  const parsed = z.object({
    POLL_INTERVAL_MS: numeric(30_000),
    COPY_TRADE_FRACTION: z.coerce.number().finite().min(0).max(1).default(0.25),
    MAX_PAPER_TRADE_USD: numeric(10),
    MIN_SOURCE_TRADE_USD: z.coerce.number().finite().min(0).default(1),
    FIXED_COPY_BUY_USD: numeric(5),
    MAX_EXPOSURE_PER_MARKET_USD: numeric(25),
    MAX_TOTAL_OPEN_EXPOSURE_USD: numeric(50),
    MAX_COPIED_TRADES_PER_TRADER_PER_HOUR: z.coerce.number().int().positive().default(3),
    MAX_COPY_PRICE: z.coerce.number().finite().positive().max(1).default(0.90),
    MIN_HOURS_TO_RESOLUTION: z.coerce.number().finite().min(0).default(24),
    DASHBOARD_PORT: z.coerce.number().int().positive().default(3007),
    SQLITE_PATH: z.string().default('data/bot.sqlite'),
    TRADES_JSON_PATH: z.string().default('data/trades.json'),
    SELECTED_TRADERS_PATH: z.string().default('data/selected-traders.json'),
    LEADERBOARD_JSON_PATH: z.string().default('data/leaderboard.json'),
    BULLPEN_BIN: z.string().default('bullpen'),
  }).parse(env);

  return {
    copyWallets: listFromEnv(env.COPY_WALLETS),
    pollIntervalMs: parsed.POLL_INTERVAL_MS,
    paperMode: boolFromEnv(env.PAPER_MODE, true),
    bullpenReadOnly: boolFromEnv(env.BULLPEN_READ_ONLY, true),
    dryRun: boolFromEnv(env.DRY_RUN, true),
    copyTradeFraction: parsed.COPY_TRADE_FRACTION,
    maxPaperTradeUsd: parsed.MAX_PAPER_TRADE_USD,
    minSourceTradeUsd: parsed.MIN_SOURCE_TRADE_USD,
    fixedCopyBuyUsd: parsed.FIXED_COPY_BUY_USD,
    maxExposurePerMarketUsd: parsed.MAX_EXPOSURE_PER_MARKET_USD,
    maxTotalOpenExposureUsd: parsed.MAX_TOTAL_OPEN_EXPOSURE_USD,
    maxCopiedTradesPerTraderPerHour: parsed.MAX_COPIED_TRADES_PER_TRADER_PER_HOUR,
    maxCopyPrice: parsed.MAX_COPY_PRICE,
    minHoursToResolution: parsed.MIN_HOURS_TO_RESOLUTION,
    dashboardPort: parsed.DASHBOARD_PORT,
    sqlitePath: parsed.SQLITE_PATH,
    tradeLogPath: parsed.TRADES_JSON_PATH,
    selectedTradersPath: parsed.SELECTED_TRADERS_PATH,
    leaderboardPath: parsed.LEADERBOARD_JSON_PATH,
    bullpenBin: parsed.BULLPEN_BIN,
  };
}
