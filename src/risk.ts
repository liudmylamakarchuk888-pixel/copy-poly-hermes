import type { BotConfig, ExposureSnapshot, NormalizedTrade } from './types.js';

export interface RiskDecision {
  allowed: boolean;
  requestedUsd: number;
  reasons: string[];
}

function isPresentString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isFiniteNonNegative(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function hoursUntil(timestamp: string, nowMs: number): number | null {
  const resolutionMs = Date.parse(timestamp);
  if (!Number.isFinite(resolutionMs)) return null;
  return (resolutionMs - nowMs) / (60 * 60 * 1000);
}

export function evaluateRisk(
  config: BotConfig,
  trade: NormalizedTrade,
  exposure: ExposureSnapshot,
  now: Date = new Date(),
): RiskDecision {
  const requestedUsd = config.fixedCopyBuyUsd;
  const reasons: string[] = [];

  if (!isPresentString(trade.externalId)) reasons.push('missing_external_id');
  if (!isPresentString(trade.sourceWallet)) reasons.push('missing_trader_wallet');
  if (!isPresentString(trade.marketSlug)) reasons.push('missing_market_slug');
  if (!isPresentString(trade.outcome)) reasons.push('missing_outcome');
  if (!isPresentString(trade.timestamp) || !Number.isFinite(Date.parse(trade.timestamp))) reasons.push('missing_or_invalid_timestamp');
  if (trade.side !== 'buy') reasons.push('not_a_buy_trade');
  if (!isFiniteNonNegative(trade.amountUsd)) reasons.push('missing_or_invalid_amount_usd');
  if (!isFiniteNonNegative(trade.price)) reasons.push('missing_or_invalid_price');
  if (!isPresentString(trade.resolutionTimestamp)) reasons.push('missing_resolution_timestamp');

  if (isFiniteNonNegative(trade.price) && trade.price > config.maxCopyPrice) {
    reasons.push('price_above_max');
  }

  if (isPresentString(trade.resolutionTimestamp)) {
    const remainingHours = hoursUntil(trade.resolutionTimestamp, now.getTime());
    if (remainingHours == null) {
      reasons.push('invalid_resolution_timestamp');
    } else if (remainingHours <= config.minHoursToResolution) {
      reasons.push('market_close_to_resolution');
    }
  }

  if (exposure.marketExposureUsd + requestedUsd > config.maxExposurePerMarketUsd) {
    reasons.push('market_exposure_limit');
  }
  if (exposure.totalOpenExposureUsd + requestedUsd > config.maxTotalOpenExposureUsd) {
    reasons.push('total_open_exposure_limit');
  }
  if (exposure.copiedTradesThisTraderHour >= config.maxCopiedTradesPerTraderPerHour) {
    reasons.push('trader_hourly_copy_limit');
  }

  return {
    allowed: reasons.length === 0,
    requestedUsd,
    reasons,
  };
}
