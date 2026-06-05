import { describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createStateStore } from '../src/state.js';
import { DatabaseSync } from 'node:sqlite';
import type { NormalizedTrade, PaperTrade, Position } from '../src/types.js';

describe('state store', () => {
  it('persists seen source trades and paper trades in SQLite', () => {
    const dir = mkdtempSync(join(tmpdir(), 'poly-copy-'));
    try {
      mkdirSync(join(dir, 'data'));
      const dbPath = join(dir, 'data', 'bot.sqlite');
      const store = createStateStore(dbPath);
      store.upsertWatchedTrader('0xsource', 'Source Trader');
      expect(store.isWatchedTraderInitialized('0xsource')).toBe(false);
      const sourceTrade: NormalizedTrade = {
        sourceWallet: '0xsource',
        externalId: 'trade-1',
        timestamp: '2026-06-03T00:00:00.000Z',
        side: 'buy',
        marketSlug: 'will-test-pass',
        outcome: 'Yes',
        amountUsd: 12.34,
        raw: { id: 'trade-1' },
      };
      const paperTrade: PaperTrade = {
        id: 'paper-1',
        sourceExternalId: 'trade-1',
        createdAt: sourceTrade.timestamp,
        sourceWallet: '0xsource',
        side: 'buy',
        marketSlug: 'will-test-pass',
        outcome: 'Yes',
        requestedUsd: 6.17,
        paperMode: true,
        dryRun: true,
        status: 'paper_recorded',
      };

      expect(store.hasSeenSourceTrade('trade-1')).toBe(false);
      store.recordSeenSourceTrade(sourceTrade);
      store.markWatchedTraderInitialized('0xsource');
      store.recordPaperTrade(paperTrade);
      store.recordBotEvent('test_event', { ok: true });
      store.recordError('test', 'expected test error', { ok: false });
      store.close();

      const reopened = createStateStore(dbPath);
      expect(reopened.isWatchedTraderInitialized('0xsource')).toBe(true);
      expect(reopened.hasSeenSourceTrade('trade-1')).toBe(true);
      expect(reopened.listPaperTrades()).toEqual([paperTrade]);
      expect(reopened.getStats()).toEqual({
        watchedTraders: 1,
        initializedWatchedTraders: 1,
        seenSourceTrades: 1,
        copiedTrades: 1,
        positions: 0,
        openExposureUsd: 0,
        botEvents: 1,
        errors: 1,
      });
      reopened.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('creates the required SQLite state tables', () => {
    const dir = mkdtempSync(join(tmpdir(), 'poly-copy-'));
    try {
      mkdirSync(join(dir, 'data'));
      const dbPath = join(dir, 'data', 'bot.sqlite');
      const store = createStateStore(dbPath);
      store.close();

      const db = new DatabaseSync(dbPath);
      const tables = db.prepare(`
        SELECT name FROM sqlite_master
        WHERE type = 'table' AND name NOT LIKE 'sqlite_%'
        ORDER BY name
      `).all().map((row) => (row as { name: string }).name);
      db.close();

      expect(tables).toEqual([
        'bot_events',
        'copied_trades',
        'errors',
        'positions',
        'seen_source_trades',
        'watched_traders',
      ]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('closes an open paper position and removes it from open exposure', () => {
    const dir = mkdtempSync(join(tmpdir(), 'poly-copy-'));
    try {
      mkdirSync(join(dir, 'data'));
      const dbPath = join(dir, 'data', 'bot.sqlite');
      const store = createStateStore(dbPath);
      const position: Position = {
        id: 'position-1',
        copiedTradeId: 'paper-1',
        sourceWallet: '0xsource',
        marketSlug: 'will-test-pass',
        outcome: 'Yes',
        side: 'buy',
        amountUsd: 10,
        status: 'open',
        openedAt: '2026-06-03T00:00:00.000Z',
      };

      const sourceTrade: NormalizedTrade = {
        sourceWallet: '0xsource',
        externalId: 'trade-1',
        timestamp: position.openedAt,
        side: 'buy',
        marketSlug: position.marketSlug,
        outcome: position.outcome,
        amountUsd: 20,
        raw: { id: 'trade-1' },
      };
      const paperTrade: PaperTrade = {
        id: 'paper-1',
        sourceExternalId: 'trade-1',
        createdAt: position.openedAt,
        sourceWallet: '0xsource',
        side: 'buy',
        marketSlug: position.marketSlug,
        outcome: position.outcome,
        requestedUsd: 10,
        paperMode: true,
        dryRun: true,
        status: 'paper_recorded',
      };
      store.recordSeenSourceTrade(sourceTrade);
      store.recordPaperTrade(paperTrade);
      store.recordPosition(position);
      expect(store.findOpenPositionForSourceTrade({
        sourceWallet: '0xSOURCE',
        marketSlug: 'WILL-TEST-PASS',
        outcome: 'yes',
      })).toEqual(position);
      expect(store.findOpenPositionsForSourceTrade({
        sourceWallet: '0xSOURCE',
        marketSlug: 'WILL-TEST-PASS',
        outcome: 'yes',
      })).toEqual([position]);
      expect(store.getOpenExposureUsd()).toBe(10);

      const closed = store.closePosition('position-1', {
        closedAt: '2026-06-04T00:00:00.000Z',
        realizedPnlUsd: 2.5,
        raw: { sourceExternalId: 'sell-1' },
      });

      expect(closed).toEqual({
        ...position,
        status: 'closed',
        closedAt: '2026-06-04T00:00:00.000Z',
        realizedPnlUsd: 2.5,
        raw: { sourceExternalId: 'sell-1' },
      });
      expect(store.listOpenPositions()).toEqual([]);
      expect(store.getOpenExposureUsd()).toBe(0);
      expect(store.getDashboardStats()).toEqual(expect.objectContaining({
        openPositions: 0,
        totalPositions: 1,
        realizedPnlUsd: 2.5,
        winners: 1,
        losers: 0,
      }));
      store.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
