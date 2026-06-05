import { randomUUID } from 'node:crypto';
import { evaluateRisk } from './risk.js';
import type { BotConfig, BullpenClient, PaperTrade, Position, RunOnceResult, StateStore, TradeLog } from './types.js';

function nowIso(): string {
  return new Date().toISOString();
}

function isAfterStartup(tradeTimestamp: string, initializedAt: string): boolean {
  const tradeTime = Date.parse(tradeTimestamp);
  const startupTime = Date.parse(initializedAt);
  if (!Number.isFinite(tradeTime) || !Number.isFinite(startupTime)) return false;
  return tradeTime > startupTime;
}

export class CopyTradingBot {
  constructor(
    private readonly config: BotConfig,
    private readonly bullpen: BullpenClient,
    private readonly store: StateStore,
    private readonly log: TradeLog,
  ) {}

  async runOnce(): Promise<RunOnceResult> {
    if (!this.config.paperMode || !this.config.dryRun) {
      throw new Error('Live trading is disabled in this starter bot. Keep PAPER_MODE=true and DRY_RUN=true unless live execution is explicitly implemented and authorized.');
    }

    const result: RunOnceResult = {
      scannedWallets: 0,
      sourceTradesSeen: 0,
      newSourceTrades: 0,
      paperTradesRecorded: 0,
      skipped: 0,
      errors: 0,
    };

    for (const wallet of this.config.copyWallets) {
      result.scannedWallets += 1;
      this.store.upsertWatchedTrader(wallet);
      let trades;
      try {
        trades = await this.bullpen.getRecentTrades(wallet);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        result.errors += 1;
        this.store.recordError('bullpen_get_recent_trades', message, { wallet });
        this.log.append({ timestamp: nowIso(), type: 'error', payload: { wallet, source: 'bullpen_get_recent_trades', message } });
        continue;
      }
      result.sourceTradesSeen += trades.length;

      const initializedAt = this.store.getWatchedTraderInitializedAt(wallet);
      if (initializedAt == null) {
        for (const trade of trades) {
          if (!this.store.hasSeenSourceTrade(trade.externalId)) {
            this.store.recordSeenSourceTrade(trade);
          }
        }
        this.store.markWatchedTraderInitialized(wallet);
        this.store.recordBotEvent('startup_backfill_seen', {
          wallet,
          tradesMarkedSeen: trades.length,
          copiedHistoricalTrades: 0,
        });
        this.log.append({
          timestamp: nowIso(),
          type: 'startup_backfill_seen',
          payload: { wallet, tradesMarkedSeen: trades.length, copiedHistoricalTrades: 0 },
        });
        continue;
      }

      for (const trade of trades) {
        if (this.store.hasSeenSourceTrade(trade.externalId)) continue;
        if (!isAfterStartup(trade.timestamp, initializedAt)) {
          this.store.recordSeenSourceTrade(trade);
          this.store.recordBotEvent('historical_trade_marked_seen', { wallet, trade, initializedAt, copiedHistoricalTrades: 0 });
          this.log.append({
            timestamp: nowIso(),
            type: 'startup_backfill_seen',
            payload: { wallet, trade, initializedAt, copiedHistoricalTrades: 0, reason: 'trade_timestamp_not_after_startup' },
          });
          continue;
        }
        result.newSourceTrades += 1;
        this.store.recordSeenSourceTrade(trade);
        this.store.recordBotEvent('source_seen', trade);
        this.log.append({ timestamp: nowIso(), type: 'source_seen', payload: trade });

        if (trade.side === 'sell') {
          const openPositions = this.store.findOpenPositionsForSourceTrade({
            sourceWallet: trade.sourceWallet,
            marketSlug: trade.marketSlug,
            outcome: trade.outcome,
          });
          if (openPositions.length === 0) {
            result.skipped += 1;
            this.store.recordBotEvent('source_trade_skipped', { trade, reason: 'no_open_position_to_close' });
            this.log.append({ timestamp: nowIso(), type: 'skip', payload: { trade, reason: 'no_open_position_to_close' } });
            continue;
          }
          const totalOpenAmountUsd = openPositions.reduce((sum, position) => sum + position.amountUsd, 0);
          const closedPositions = [];
          for (const openPosition of openPositions) {
            const allocatedExitUsd = totalOpenAmountUsd > 0
              ? trade.amountUsd * (openPosition.amountUsd / totalOpenAmountUsd)
              : trade.amountUsd / openPositions.length;
            const closed = this.store.closePosition(openPosition.id, {
              closedAt: trade.timestamp,
              realizedPnlUsd: allocatedExitUsd - openPosition.amountUsd,
              raw: { dryRun: true, sourceExternalId: trade.externalId, sourceTrade: trade, allocatedExitUsd },
            });
            closedPositions.push(closed ?? openPosition);
          }
          this.store.recordBotEvent('paper_position_closed', { trade, positions: closedPositions });
          this.log.append({ timestamp: nowIso(), type: 'paper_position_closed', payload: { trade, positions: closedPositions } });
          continue;
        }

        if (trade.amountUsd < this.config.minSourceTradeUsd) {
          result.skipped += 1;
          this.store.recordBotEvent('source_trade_skipped', { trade, reason: 'below_min_source_trade_usd' });
          this.log.append({ timestamp: nowIso(), type: 'skip', payload: { trade, reason: 'below_min_source_trade_usd' } });
          continue;
        }

        const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
        const risk = evaluateRisk(this.config, trade, {
          marketExposureUsd: this.store.getOpenExposureUsd(trade.marketSlug),
          totalOpenExposureUsd: this.store.getOpenExposureUsd(),
          copiedTradesThisTraderHour: this.store.countCopiedTradesForTraderSince(trade.sourceWallet, since),
        });

        if (!risk.allowed) {
          result.skipped += 1;
          this.store.recordBotEvent('risk_rejected', { trade, reasons: risk.reasons, requestedUsd: risk.requestedUsd });
          this.log.append({ timestamp: nowIso(), type: 'skip', payload: { trade, reason: 'risk_rejected', reasons: risk.reasons } });
          continue;
        }

        const requestedUsd = risk.requestedUsd;

        try {
          const preview = await this.bullpen.previewTrade({
            marketSlug: trade.marketSlug,
            outcome: trade.outcome,
            side: trade.side,
            amountUsd: requestedUsd,
          });

          const paperTrade: PaperTrade = {
            id: randomUUID(),
            sourceExternalId: trade.externalId,
            createdAt: nowIso(),
            sourceWallet: trade.sourceWallet,
            side: trade.side,
            marketSlug: trade.marketSlug,
            outcome: trade.outcome,
            requestedUsd,
            paperMode: true,
            dryRun: true,
            status: 'paper_recorded',
            preview: preview.raw,
          };
          this.store.recordPaperTrade(paperTrade);
          const position: Position = {
            id: randomUUID(),
            copiedTradeId: paperTrade.id,
            sourceWallet: trade.sourceWallet,
            marketSlug: trade.marketSlug,
            outcome: trade.outcome,
            side: trade.side,
            amountUsd: requestedUsd,
            status: 'open',
            openedAt: paperTrade.createdAt,
            raw: { dryRun: true, sourceExternalId: trade.externalId },
          };
          this.store.recordPosition(position);
          this.store.recordBotEvent('paper_trade_recorded', { paperTrade, position });
          this.log.append({ timestamp: nowIso(), type: 'paper_trade', payload: paperTrade });
          result.paperTradesRecorded += 1;
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          const paperTrade: PaperTrade = {
            id: randomUUID(),
            sourceExternalId: trade.externalId,
            createdAt: nowIso(),
            sourceWallet: trade.sourceWallet,
            side: trade.side,
            marketSlug: trade.marketSlug,
            outcome: trade.outcome,
            requestedUsd,
            paperMode: true,
            dryRun: true,
            status: 'preview_failed',
            reason: message,
          };
          this.store.recordPaperTrade(paperTrade);
          this.store.recordError('preview_trade', message, paperTrade);
          this.log.append({ timestamp: nowIso(), type: 'error', payload: paperTrade });
          result.skipped += 1;
        }
      }
    }

    return result;
  }
}
