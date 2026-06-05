export type TradeSide = 'buy' | 'sell';

export interface BotConfig {
  copyWallets: string[];
  pollIntervalMs: number;
  paperMode: boolean;
  bullpenReadOnly: boolean;
  dryRun: boolean;
  fixedCopyBuyUsd: number;
  maxExposurePerMarketUsd: number;
  maxTotalOpenExposureUsd: number;
  maxCopiedTradesPerTraderPerHour: number;
  maxCopyPrice: number;
  minHoursToResolution: number;
  copyTradeFraction: number;
  maxPaperTradeUsd: number;
  minSourceTradeUsd: number;
  dashboardPort: number;
  sqlitePath: string;
  tradeLogPath: string;
  selectedTradersPath: string;
  leaderboardPath: string;
  bullpenBin: string;
}

export interface SelectedTrader {
  rank: number;
  wallet: string;
  username?: string | null;
  score: number;
  selectedAt: string;
  source: 'self_learning_selector';
  reasons: string[];
  metrics: {
    pnl7d: number;
    volume7d: number;
    winRate7d: number | null;
    pnl30d: number | null;
    volume30d: number | null;
    winRate30d: number | null;
    maxDrawdown: number | null;
    copyabilityTier: string | null;
    riskTier: string | null;
    isBot: boolean;
    isFarmer: boolean;
  };
}

export interface NormalizedTrade {
  sourceWallet: string;
  externalId: string;
  timestamp: string;
  side: TradeSide;
  marketSlug: string;
  outcome: string;
  amountUsd: number;
  price?: number;
  size?: number;
  resolutionTimestamp?: string;
  raw: unknown;
}

export interface PreviewRequest {
  marketSlug: string;
  outcome: string;
  side: TradeSide;
  amountUsd: number;
}

export interface BullpenPreview {
  ok: boolean;
  raw: unknown;
}

export interface BullpenClient {
  getRecentTrades(sourceWallet: string): Promise<NormalizedTrade[]>;
  previewTrade(request: PreviewRequest): Promise<BullpenPreview>;
}

export type PaperTradeStatus = 'paper_recorded' | 'paper_skipped' | 'preview_failed';

export interface PaperTrade {
  id: string;
  sourceExternalId: string;
  createdAt: string;
  sourceWallet: string;
  side: TradeSide;
  marketSlug: string;
  outcome: string;
  requestedUsd: number;
  paperMode: true;
  dryRun: true;
  status: PaperTradeStatus;
  preview?: unknown;
  reason?: string;
}

export interface Position {
  id: string;
  copiedTradeId: string;
  sourceWallet: string;
  marketSlug: string;
  outcome: string;
  side: TradeSide;
  amountUsd: number;
  status: 'open' | 'closed';
  openedAt: string;
  closedAt?: string;
  realizedPnlUsd?: number;
  unrealizedPnlUsd?: number;
  raw?: unknown;
}

export interface WatchedTrader {
  wallet: string;
  username?: string | null;
  active: boolean;
  firstSeenAt: string;
  lastSeenAt: string;
  initializedAt?: string | null;
}

export interface ErrorRecord {
  id: number;
  timestamp: string;
  source: string;
  message: string;
  payload?: unknown;
}

export interface DashboardStats {
  watchedTraders: number;
  initializedWatchedTraders: number;
  seenSourceTrades: number;
  totalCopiedTrades: number;
  openPositions: number;
  totalPositions: number;
  openExposureUsd: number;
  realizedPnlUsd: number | null;
  unrealizedPnlUsd: number | null;
  winRate: number | null;
  winners: number;
  losers: number;
  failedTrades: number;
  skippedTrades: number;
  botEvents: number;
  errors: number;
}

export interface BotStats {
  watchedTraders: number;
  initializedWatchedTraders: number;
  seenSourceTrades: number;
  copiedTrades: number;
  positions: number;
  openExposureUsd: number;
  botEvents: number;
  errors: number;
}

export interface ExposureSnapshot {
  marketExposureUsd: number;
  totalOpenExposureUsd: number;
  copiedTradesThisTraderHour: number;
}

export interface StateStore {
  upsertWatchedTrader(wallet: string, username?: string | null): void;
  isWatchedTraderInitialized(wallet: string): boolean;
  getWatchedTraderInitializedAt(wallet: string): string | null;
  markWatchedTraderInitialized(wallet: string): void;
  hasSeenSourceTrade(externalId: string): boolean;
  recordSeenSourceTrade(trade: NormalizedTrade): void;
  recordPaperTrade(trade: PaperTrade): void;
  recordPosition(position: Position): void;
  findOpenPositionForSourceTrade(criteria: Pick<Position, 'sourceWallet' | 'marketSlug' | 'outcome'>): Position | null;
  findOpenPositionsForSourceTrade(criteria: Pick<Position, 'sourceWallet' | 'marketSlug' | 'outcome'>): Position[];
  closePosition(positionId: string, close: { closedAt: string; realizedPnlUsd?: number; raw?: unknown }): Position | null;
  getOpenExposureUsd(marketSlug?: string): number;
  countCopiedTradesForTraderSince(sourceWallet: string, sinceIso: string): number;
  recordBotEvent(eventType: string, payload: unknown): void;
  recordError(source: string, message: string, payload?: unknown): void;
  listWatchedTraders(): WatchedTrader[];
  listPaperTrades(limit?: number): PaperTrade[];
  listOpenPositions(limit?: number): Position[];
  listErrors(limit?: number): ErrorRecord[];
  getStats(): BotStats;
  getDashboardStats(): DashboardStats;
  close(): void;
}

export interface TradeLogEntry {
  timestamp: string;
  type: 'paper_trade' | 'paper_position_closed' | 'source_seen' | 'startup_backfill_seen' | 'skip' | 'error';
  payload: unknown;
}

export interface TradeLog {
  append(entry: TradeLogEntry): void;
  readAll(): TradeLogEntry[];
}

export interface RunOnceResult {
  scannedWallets: number;
  sourceTradesSeen: number;
  newSourceTrades: number;
  paperTradesRecorded: number;
  skipped: number;
  errors: number;
}
