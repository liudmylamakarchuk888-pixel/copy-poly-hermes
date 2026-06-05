import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { BullpenClient, BullpenPreview, NormalizedTrade, PreviewRequest, TradeSide } from './types.js';

const execFileAsync = promisify(execFile);

type UnknownRecord = Record<string, unknown>;

function getString(item: UnknownRecord, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = item[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return undefined;
}

function getNumber(item: UnknownRecord, keys: string[]): number | undefined {
  for (const key of keys) {
    const value = item[key];
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string' && value.trim() && Number.isFinite(Number(value))) return Number(value);
  }
  return undefined;
}

function stableId(item: UnknownRecord): string | undefined {
  const explicit = getString(item, ['id', 'activityId', 'transactionHash', 'transaction_hash', 'txHash', 'tx_hash', 'hash']);
  if (explicit) return explicit;
  const timestamp = getString(item, ['timestamp', 'createdAt', 'created_at', 'time']);
  const market = getString(item, ['marketSlug', 'market_slug', 'slug']);
  const outcome = getString(item, ['outcome', 'outcomeName', 'asset']);
  const side = getString(item, ['side', 'type']);
  if (timestamp && market && outcome && side) return `${timestamp}:${market}:${outcome}:${side}`;
  return undefined;
}

function extractArray(payload: unknown): unknown[] {
  if (Array.isArray(payload)) return payload;
  if (payload && typeof payload === 'object') {
    const record = payload as UnknownRecord;
    for (const key of ['data', 'items', 'activity', 'activities', 'trades', 'results']) {
      const value = record[key];
      if (Array.isArray(value)) return value;
    }
  }
  return [];
}

function findResolutionTimestamp(payload: unknown): string | undefined {
  if (!payload || typeof payload !== 'object') return undefined;
  const record = payload as UnknownRecord;
  const direct = getString(record, [
    'resolutionTimestamp',
    'resolution_timestamp',
    'resolutionTime',
    'resolution_time',
    'endDate',
    'end_date',
    'endTimestamp',
    'end_timestamp',
    'closeTime',
    'close_time',
    'closedTime',
    'closed_time',
  ]);
  if (direct) return direct;
  for (const key of ['market', 'event', 'details']) {
    const nested = record[key];
    if (nested && typeof nested === 'object') {
      const found = findResolutionTimestamp(nested);
      if (found) return found;
    }
  }
  return undefined;
}

export function normalizeBullpenActivityItem(sourceWallet: string, item: unknown): NormalizedTrade | null {
  if (!item || typeof item !== 'object') return null;
  const record = item as UnknownRecord;
  const sideRaw = getString(record, ['side', 'tradeSide', 'type'])?.toLowerCase();
  const side: TradeSide | undefined = sideRaw?.includes('sell') ? 'sell' : sideRaw?.includes('buy') ? 'buy' : undefined;
  const externalId = stableId(record);
  const timestamp = getString(record, ['timestamp', 'createdAt', 'created_at', 'time', 'date']);
  const marketSlug = getString(record, ['marketSlug', 'market_slug', 'slug', 'eventSlug', 'event_slug']);
  const outcome = getString(record, ['outcome', 'outcomeName', 'asset', 'answer']);
  const amountUsd = getNumber(record, ['usdc_size', 'cash', 'amountUsd', 'amount_usd', 'usd', 'value', 'pricePaid']);
  const price = getNumber(record, ['price', 'avgPrice', 'averagePrice']);
  const size = getNumber(record, ['size', 'shares', 'quantity']);
  const resolutionTimestamp = findResolutionTimestamp(record);

  if (!externalId || !timestamp || !side || !marketSlug || !outcome || amountUsd == null) {
    return null;
  }

  return { sourceWallet, externalId, timestamp, side, marketSlug, outcome, amountUsd, price, size, resolutionTimestamp, raw: item };
}

export class BullpenCliClient implements BullpenClient {
  constructor(private readonly bullpenBin: string, private readonly readOnly = true) {}

  private readonly marketResolutionCache = new Map<string, string | null>();

  private async getMarketResolutionTimestamp(marketSlug: string): Promise<string | undefined> {
    if (this.marketResolutionCache.has(marketSlug)) {
      return this.marketResolutionCache.get(marketSlug) ?? undefined;
    }
    const args = [
      ...(this.readOnly ? ['--read-only'] : []),
      'polymarket',
      'market',
      marketSlug,
      '--output',
      'json',
    ];
    try {
      const { stdout } = await execFileAsync(this.bullpenBin, args, { timeout: 60_000, maxBuffer: 10 * 1024 * 1024 });
      const parsed = JSON.parse(stdout) as unknown;
      const resolution = findResolutionTimestamp(parsed);
      this.marketResolutionCache.set(marketSlug, resolution ?? null);
      return resolution;
    } catch {
      this.marketResolutionCache.set(marketSlug, null);
      return undefined;
    }
  }

  async getRecentTrades(sourceWallet: string): Promise<NormalizedTrade[]> {
    const args = [
      ...(this.readOnly ? ['--read-only'] : []),
      'polymarket',
      'activity',
      '--address',
      sourceWallet,
      '--type',
      'trade',
      '--limit',
      '50',
      '--output',
      'json',
    ];
    const { stdout } = await execFileAsync(this.bullpenBin, args, { timeout: 60_000, maxBuffer: 10 * 1024 * 1024 });
    const parsed = JSON.parse(stdout) as unknown;
    const trades = extractArray(parsed)
      .map((item) => normalizeBullpenActivityItem(sourceWallet, item))
      .filter((item): item is NormalizedTrade => item != null);
    const enriched: NormalizedTrade[] = [];
    for (const trade of trades) {
      if (trade.resolutionTimestamp) {
        enriched.push(trade);
        continue;
      }
      const resolutionTimestamp = await this.getMarketResolutionTimestamp(trade.marketSlug);
      enriched.push(resolutionTimestamp ? { ...trade, resolutionTimestamp } : trade);
    }
    return enriched;
  }

  async previewTrade(request: PreviewRequest): Promise<BullpenPreview> {
    const args = [
      ...(this.readOnly ? ['--read-only'] : []),
      'polymarket',
      'preview',
      request.marketSlug,
      request.outcome,
      String(request.amountUsd),
      '--side',
      request.side,
      '--output',
      'json',
    ];
    const { stdout } = await execFileAsync(this.bullpenBin, args, { timeout: 60_000, maxBuffer: 10 * 1024 * 1024 });
    return { ok: true, raw: JSON.parse(stdout) as unknown };
  }
}
