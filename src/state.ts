import { dirname } from 'node:path';
import { mkdirSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import type { BotStats, DashboardStats, ErrorRecord, NormalizedTrade, PaperTrade, Position, StateStore, WatchedTrader } from './types.js';

function ensureParent(path: string): void {
  mkdirSync(dirname(path), { recursive: true });
}

function rowJson<T>(value: string): T {
  return JSON.parse(value) as T;
}

function nowIso(): string {
  return new Date().toISOString();
}

export function createStateStore(path: string): StateStore {
  ensureParent(path);
  const db = new DatabaseSync(path);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS watched_traders (
      wallet TEXT PRIMARY KEY,
      username TEXT,
      active INTEGER NOT NULL DEFAULT 1,
      first_seen_at TEXT NOT NULL,
      last_seen_at TEXT NOT NULL,
      initialized_at TEXT
    );

    CREATE TABLE IF NOT EXISTS seen_source_trades (
      external_id TEXT PRIMARY KEY,
      trader_wallet TEXT NOT NULL,
      market_slug TEXT NOT NULL,
      outcome TEXT NOT NULL,
      side TEXT NOT NULL,
      amount_usd REAL NOT NULL,
      timestamp TEXT NOT NULL,
      first_seen_at TEXT NOT NULL,
      payload_json TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS copied_trades (
      id TEXT PRIMARY KEY,
      source_external_id TEXT NOT NULL,
      trader_wallet TEXT NOT NULL,
      market_slug TEXT NOT NULL,
      outcome TEXT NOT NULL,
      side TEXT NOT NULL,
      requested_usd REAL NOT NULL,
      paper_mode INTEGER NOT NULL DEFAULT 1,
      status TEXT NOT NULL,
      reason TEXT,
      created_at TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      FOREIGN KEY (source_external_id) REFERENCES seen_source_trades(external_id)
    );

    CREATE TABLE IF NOT EXISTS positions (
      id TEXT PRIMARY KEY,
      copied_trade_id TEXT,
      trader_wallet TEXT NOT NULL,
      market_slug TEXT NOT NULL,
      outcome TEXT NOT NULL,
      side TEXT NOT NULL,
      amount_usd REAL NOT NULL,
      status TEXT NOT NULL,
      opened_at TEXT NOT NULL,
      closed_at TEXT,
      payload_json TEXT NOT NULL,
      FOREIGN KEY (copied_trade_id) REFERENCES copied_trades(id)
    );

    CREATE TABLE IF NOT EXISTS bot_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp TEXT NOT NULL,
      event_type TEXT NOT NULL,
      payload_json TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS errors (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp TEXT NOT NULL,
      source TEXT NOT NULL,
      message TEXT NOT NULL,
      payload_json TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_seen_source_trades_wallet_timestamp
      ON seen_source_trades (trader_wallet, timestamp DESC);
    CREATE INDEX IF NOT EXISTS idx_copied_trades_created_at
      ON copied_trades (created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_positions_status
      ON positions (status);
    CREATE INDEX IF NOT EXISTS idx_bot_events_timestamp
      ON bot_events (timestamp DESC);
    CREATE INDEX IF NOT EXISTS idx_errors_timestamp
      ON errors (timestamp DESC);
  `);

  const upsertWatched = db.prepare(`
    INSERT INTO watched_traders (wallet, username, active, first_seen_at, last_seen_at, initialized_at)
    VALUES (?, ?, 1, ?, ?, NULL)
    ON CONFLICT(wallet) DO UPDATE SET
      username = COALESCE(excluded.username, watched_traders.username),
      active = 1,
      last_seen_at = excluded.last_seen_at
  `);
  const initialized = db.prepare('SELECT initialized_at FROM watched_traders WHERE wallet = ? LIMIT 1');
  const markInitialized = db.prepare(`
    UPDATE watched_traders
    SET initialized_at = COALESCE(initialized_at, ?), last_seen_at = ?
    WHERE wallet = ?
  `);
  const hasSeen = db.prepare('SELECT 1 FROM seen_source_trades WHERE external_id = ? LIMIT 1');
  const insertSeen = db.prepare(`
    INSERT OR IGNORE INTO seen_source_trades (
      external_id, trader_wallet, market_slug, outcome, side, amount_usd, timestamp, first_seen_at, payload_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertCopied = db.prepare(`
    INSERT OR REPLACE INTO copied_trades (
      id, source_external_id, trader_wallet, market_slug, outcome, side, requested_usd,
      paper_mode, status, reason, created_at, payload_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertPosition = db.prepare(`
    INSERT OR REPLACE INTO positions (
      id, copied_trade_id, trader_wallet, market_slug, outcome, side, amount_usd,
      status, opened_at, closed_at, payload_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertEvent = db.prepare('INSERT INTO bot_events (timestamp, event_type, payload_json) VALUES (?, ?, ?)');
  const insertError = db.prepare('INSERT INTO errors (timestamp, source, message, payload_json) VALUES (?, ?, ?, ?)');
  const listCopied = db.prepare('SELECT payload_json FROM copied_trades ORDER BY created_at DESC LIMIT ?');
  const listWatched = db.prepare('SELECT wallet, username, active, first_seen_at, last_seen_at, initialized_at FROM watched_traders ORDER BY last_seen_at DESC');
  const listOpenPositionsStmt = db.prepare("SELECT payload_json FROM positions WHERE status = 'open' ORDER BY opened_at DESC LIMIT ?");
  const findOpenPositionStmt = db.prepare(`
    SELECT payload_json FROM positions
    WHERE status = 'open' AND lower(trader_wallet) = lower(?) AND lower(market_slug) = lower(?) AND lower(outcome) = lower(?)
    ORDER BY opened_at DESC
    LIMIT 1
  `);
  const findOpenPositionsStmt = db.prepare(`
    SELECT payload_json FROM positions
    WHERE status = 'open' AND lower(trader_wallet) = lower(?) AND lower(market_slug) = lower(?) AND lower(outcome) = lower(?)
    ORDER BY opened_at ASC
  `);
  const findPositionByIdStmt = db.prepare('SELECT payload_json FROM positions WHERE id = ? LIMIT 1');
  const listErrorsStmt = db.prepare('SELECT id, timestamp, source, message, payload_json FROM errors ORDER BY timestamp DESC LIMIT ?');
  const openExposure = db.prepare("SELECT COALESCE(SUM(amount_usd), 0) AS exposure FROM positions WHERE status = 'open'");
  const openMarketExposure = db.prepare("SELECT COALESCE(SUM(amount_usd), 0) AS exposure FROM positions WHERE status = 'open' AND market_slug = ?");
  const copiedForTraderSince = db.prepare('SELECT COUNT(*) AS count FROM copied_trades WHERE trader_wallet = ? AND created_at >= ?');
  const countWatched = db.prepare('SELECT COUNT(*) AS count FROM watched_traders');
  const countInitialized = db.prepare('SELECT COUNT(*) AS count FROM watched_traders WHERE initialized_at IS NOT NULL');
  const countSeen = db.prepare('SELECT COUNT(*) AS count FROM seen_source_trades');
  const countCopied = db.prepare('SELECT COUNT(*) AS count FROM copied_trades');
  const countPositions = db.prepare('SELECT COUNT(*) AS count FROM positions');
  const countOpenPositions = db.prepare("SELECT COUNT(*) AS count FROM positions WHERE status = 'open'");
  const countFailedTrades = db.prepare("SELECT COUNT(*) AS count FROM copied_trades WHERE status = 'preview_failed'");
  const countSkippedTrades = db.prepare("SELECT COUNT(*) AS count FROM bot_events WHERE event_type IN ('source_trade_skipped', 'risk_rejected')");
  const allPositionPayloads = db.prepare('SELECT payload_json FROM positions');
  const countEvents = db.prepare('SELECT COUNT(*) AS count FROM bot_events');
  const countErrors = db.prepare('SELECT COUNT(*) AS count FROM errors');

  function count(statement: ReturnType<DatabaseSync['prepare']>): number {
    return Number((statement.get() as { count: number }).count);
  }

  return {
    upsertWatchedTrader(wallet: string, username?: string | null): void {
      const now = nowIso();
      upsertWatched.run(wallet, username ?? null, now, now);
    },
    isWatchedTraderInitialized(wallet: string): boolean {
      const row = initialized.get(wallet) as { initialized_at: string | null } | undefined;
      return row?.initialized_at != null;
    },
    getWatchedTraderInitializedAt(wallet: string): string | null {
      const row = initialized.get(wallet) as { initialized_at: string | null } | undefined;
      return row?.initialized_at ?? null;
    },
    markWatchedTraderInitialized(wallet: string): void {
      const now = nowIso();
      markInitialized.run(now, now, wallet);
    },
    hasSeenSourceTrade(externalId: string): boolean {
      return hasSeen.get(externalId) != null;
    },
    recordSeenSourceTrade(trade: NormalizedTrade): void {
      insertSeen.run(
        trade.externalId,
        trade.sourceWallet,
        trade.marketSlug,
        trade.outcome,
        trade.side,
        trade.amountUsd,
        trade.timestamp,
        nowIso(),
        JSON.stringify(trade),
      );
    },
    recordPaperTrade(trade: PaperTrade): void {
      insertCopied.run(
        trade.id,
        trade.sourceExternalId,
        trade.sourceWallet,
        trade.marketSlug,
        trade.outcome,
        trade.side,
        trade.requestedUsd,
        trade.paperMode ? 1 : 0,
        trade.status,
        trade.reason ?? null,
        trade.createdAt,
        JSON.stringify(trade),
      );
    },
    recordPosition(position: Position): void {
      insertPosition.run(
        position.id,
        position.copiedTradeId,
        position.sourceWallet,
        position.marketSlug,
        position.outcome,
        position.side,
        position.amountUsd,
        position.status,
        position.openedAt,
        position.closedAt ?? null,
        JSON.stringify(position),
      );
    },
    findOpenPositionForSourceTrade(criteria: Pick<Position, 'sourceWallet' | 'marketSlug' | 'outcome'>): Position | null {
      const row = findOpenPositionStmt.get(criteria.sourceWallet, criteria.marketSlug, criteria.outcome) as { payload_json: string } | undefined;
      return row == null ? null : rowJson<Position>(row.payload_json);
    },
    findOpenPositionsForSourceTrade(criteria: Pick<Position, 'sourceWallet' | 'marketSlug' | 'outcome'>): Position[] {
      return findOpenPositionsStmt
        .all(criteria.sourceWallet, criteria.marketSlug, criteria.outcome)
        .map((row) => rowJson<Position>((row as { payload_json: string }).payload_json));
    },
    closePosition(positionId: string, close: { closedAt: string; realizedPnlUsd?: number; raw?: unknown }): Position | null {
      const row = findPositionByIdStmt.get(positionId) as { payload_json: string } | undefined;
      if (row == null) return null;
      const existing = rowJson<Position>(row.payload_json);
      if (existing.status === 'closed') return existing;
      const closed: Position = {
        ...existing,
        status: 'closed',
        closedAt: close.closedAt,
        ...(close.realizedPnlUsd == null ? {} : { realizedPnlUsd: close.realizedPnlUsd }),
        ...(close.raw == null ? {} : { raw: close.raw }),
      };
      insertPosition.run(
        closed.id,
        closed.copiedTradeId,
        closed.sourceWallet,
        closed.marketSlug,
        closed.outcome,
        closed.side,
        closed.amountUsd,
        closed.status,
        closed.openedAt,
        closed.closedAt ?? null,
        JSON.stringify(closed),
      );
      return closed;
    },
    getOpenExposureUsd(marketSlug?: string): number {
      const row = marketSlug == null
        ? openExposure.get() as { exposure: number }
        : openMarketExposure.get(marketSlug) as { exposure: number };
      return Number(row.exposure ?? 0);
    },
    countCopiedTradesForTraderSince(sourceWallet: string, sinceIso: string): number {
      return Number((copiedForTraderSince.get(sourceWallet, sinceIso) as { count: number }).count);
    },
    recordBotEvent(eventType: string, payload: unknown): void {
      insertEvent.run(nowIso(), eventType, JSON.stringify(payload));
    },
    recordError(source: string, message: string, payload?: unknown): void {
      insertError.run(nowIso(), source, message, payload == null ? null : JSON.stringify(payload));
    },
    listWatchedTraders(): WatchedTrader[] {
      return listWatched.all().map((row) => {
        const typed = row as {
          wallet: string;
          username: string | null;
          active: number;
          first_seen_at: string;
          last_seen_at: string;
          initialized_at: string | null;
        };
        return {
          wallet: typed.wallet,
          username: typed.username,
          active: typed.active === 1,
          firstSeenAt: typed.first_seen_at,
          lastSeenAt: typed.last_seen_at,
          initializedAt: typed.initialized_at,
        };
      });
    },
    listPaperTrades(limit = 100): PaperTrade[] {
      return listCopied.all(limit).map((row) => rowJson<PaperTrade>((row as { payload_json: string }).payload_json));
    },
    listOpenPositions(limit = 100): Position[] {
      return listOpenPositionsStmt.all(limit).map((row) => rowJson<Position>((row as { payload_json: string }).payload_json));
    },
    listErrors(limit = 100): ErrorRecord[] {
      return listErrorsStmt.all(limit).map((row) => {
        const typed = row as { id: number; timestamp: string; source: string; message: string; payload_json: string | null };
        return {
          id: typed.id,
          timestamp: typed.timestamp,
          source: typed.source,
          message: typed.message,
          payload: typed.payload_json == null ? undefined : JSON.parse(typed.payload_json),
        };
      });
    },
    getStats(): BotStats {
      return {
        watchedTraders: count(countWatched),
        initializedWatchedTraders: count(countInitialized),
        seenSourceTrades: count(countSeen),
        copiedTrades: count(countCopied),
        positions: count(countPositions),
        openExposureUsd: this.getOpenExposureUsd(),
        botEvents: count(countEvents),
        errors: count(countErrors),
      };
    },
    getDashboardStats(): DashboardStats {
      const positions = allPositionPayloads.all()
        .map((row) => rowJson<Position>((row as { payload_json: string }).payload_json));
      let realizedPnlUsd = 0;
      let unrealizedPnlUsd = 0;
      let hasRealized = false;
      let hasUnrealized = false;
      let winners = 0;
      let losers = 0;

      for (const position of positions) {
        if (typeof position.realizedPnlUsd === 'number') {
          hasRealized = true;
          realizedPnlUsd += position.realizedPnlUsd;
          if (position.status === 'closed' && position.realizedPnlUsd > 0) winners += 1;
          if (position.status === 'closed' && position.realizedPnlUsd < 0) losers += 1;
        }
        if (typeof position.unrealizedPnlUsd === 'number') {
          hasUnrealized = true;
          unrealizedPnlUsd += position.unrealizedPnlUsd;
        }
      }

      const resolvedPositions = winners + losers;
      return {
        watchedTraders: count(countWatched),
        initializedWatchedTraders: count(countInitialized),
        seenSourceTrades: count(countSeen),
        totalCopiedTrades: count(countCopied),
        openPositions: count(countOpenPositions),
        totalPositions: count(countPositions),
        openExposureUsd: this.getOpenExposureUsd(),
        realizedPnlUsd: hasRealized ? realizedPnlUsd : null,
        unrealizedPnlUsd: hasUnrealized ? unrealizedPnlUsd : null,
        winRate: resolvedPositions > 0 ? winners / resolvedPositions : null,
        winners,
        losers,
        failedTrades: count(countFailedTrades),
        skippedTrades: count(countSkippedTrades),
        botEvents: count(countEvents),
        errors: count(countErrors),
      };
    },
    close(): void {
      db.close();
    },
  };
}
