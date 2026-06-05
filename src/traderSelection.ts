import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { SelectedTrader } from './types.js';

interface LeaderboardRow {
  wallet_address?: string;
  display_name?: string | null;
  realized_pnl_7d?: number;
  realized_pnl_30d?: number;
  volume_7d?: number;
  volume_30d?: number;
  win_rate_7d?: number;
  win_rate_30d?: number;
  max_drawdown?: number;
  copyability_tier?: string;
  risk_tier?: string;
  is_bot?: boolean;
  is_farmer?: boolean;
}

export interface TraderSelectionOptions {
  leaderboardPath: string;
  selectedTradersPath: string;
  envPath: string;
  limit?: number;
}

export interface TraderSelectionResult {
  selected: SelectedTrader[];
  rejected: Array<{ wallet: string; reasons: string[] }>;
  envPath: string;
  selectedTradersPath: string;
}

function numberOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function numberOrZero(value: unknown): number {
  return numberOrNull(value) ?? 0;
}

function readLeaderboard(path: string): LeaderboardRow[] {
  const raw = JSON.parse(readFileSync(path, 'utf8')) as unknown;
  if (Array.isArray(raw)) return raw as LeaderboardRow[];
  if (raw && typeof raw === 'object') {
    const obj = raw as Record<string, unknown>;
    for (const key of ['leaderboard', 'data', 'traders', 'results']) {
      if (Array.isArray(obj[key])) return obj[key] as LeaderboardRow[];
    }
  }
  throw new Error(`No leaderboard array found in ${path}`);
}

function scoreRow(row: LeaderboardRow): { score: number; reasons: string[]; hardReject: string[] } {
  const pnl7d = numberOrZero(row.realized_pnl_7d);
  const pnl30d = numberOrNull(row.realized_pnl_30d);
  const volume7d = numberOrZero(row.volume_7d);
  const winRate7d = numberOrNull(row.win_rate_7d);
  const winRate30d = numberOrNull(row.win_rate_30d);
  const maxDrawdown = numberOrNull(row.max_drawdown);
  const hardReject: string[] = [];
  const reasons: string[] = [];

  if (!row.wallet_address) hardReject.push('missing_wallet');
  if (row.is_bot) hardReject.push('bot_flag');
  if (row.is_farmer) hardReject.push('farmer_flag');
  if (pnl7d <= 0) hardReject.push('non_positive_7d_pnl');
  if (volume7d < 100_000) hardReject.push('low_7d_volume');
  if (winRate7d != null && winRate7d < 0.35) hardReject.push('low_7d_win_rate');

  let score = 0;
  score += Math.log10(Math.max(pnl7d, 1)) * 18;
  score += Math.log10(Math.max(volume7d, 1)) * 4;
  if (winRate7d != null) score += (winRate7d - 0.5) * 45;
  if (winRate30d != null) score += (winRate30d - 0.5) * 25;
  if (pnl30d != null && pnl30d > 0) score += Math.log10(Math.max(pnl30d, 1)) * 5;

  if (row.risk_tier === 'moderate') {
    score += 12;
    reasons.push('moderate_risk_tier_bonus');
  }
  if (row.risk_tier === 'high') {
    score -= 8;
    reasons.push('high_risk_penalty');
  }
  if (row.risk_tier === 'degen') {
    score -= 18;
    reasons.push('degen_risk_penalty');
  }
  if (row.copyability_tier === 'low_copyability') {
    score -= 8;
    reasons.push('low_copyability_penalty');
  }
  if (row.copyability_tier === 'not_recommended') {
    score -= 12;
    reasons.push('not_recommended_penalty');
  }
  if (maxDrawdown != null && maxDrawdown > 0.25) {
    score -= 10;
    reasons.push('drawdown_penalty');
  }

  reasons.push('positive_7d_pnl', 'sufficient_7d_volume');
  if (winRate7d != null && winRate7d >= 0.45) reasons.push('solid_7d_win_rate');
  if (pnl30d != null && pnl30d > 0) reasons.push('positive_30d_pnl');

  return { score, reasons, hardReject };
}

function toSelected(row: LeaderboardRow, rank: number, score: number, reasons: string[], selectedAt: string): SelectedTrader {
  return {
    rank,
    wallet: row.wallet_address ?? '',
    username: row.display_name ?? null,
    score: Number(score.toFixed(2)),
    selectedAt,
    source: 'self_learning_selector',
    reasons,
    metrics: {
      pnl7d: numberOrZero(row.realized_pnl_7d),
      volume7d: numberOrZero(row.volume_7d),
      winRate7d: numberOrNull(row.win_rate_7d),
      pnl30d: numberOrNull(row.realized_pnl_30d),
      volume30d: numberOrNull(row.volume_30d),
      winRate30d: numberOrNull(row.win_rate_30d),
      maxDrawdown: numberOrNull(row.max_drawdown),
      copyabilityTier: row.copyability_tier ?? null,
      riskTier: row.risk_tier ?? null,
      isBot: row.is_bot === true,
      isFarmer: row.is_farmer === true,
    },
  };
}

function setEnvValue(text: string, key: string, value: string): string {
  const line = `${key}=${value}`;
  const pattern = new RegExp(`^${key}=.*$`, 'm');
  if (pattern.test(text)) return text.replace(pattern, line);
  return `${text.trimEnd()}\n${line}\n`;
}

function updateEnv(path: string, wallets: string[]): void {
  let text = existsSync(path) ? readFileSync(path, 'utf8') : '';
  text = setEnvValue(text, 'PAPER_MODE', 'true');
  text = setEnvValue(text, 'DRY_RUN', 'true');
  text = setEnvValue(text, 'BULLPEN_READ_ONLY', 'true');
  text = setEnvValue(text, 'DASHBOARD_PORT', '3007');
  text = setEnvValue(text, 'COPY_WALLETS', wallets.join(','));
  writeFileSync(path, text, { encoding: 'utf8', mode: 0o600 });
}

export function selectGoodTraders(options: TraderSelectionOptions): TraderSelectionResult {
  const limit = options.limit ?? 10;
  const rows = readLeaderboard(options.leaderboardPath);
  const selectedAt = new Date().toISOString();
  const scored = rows.map((row) => ({ row, ...scoreRow(row) }));
  const rejected = scored
    .filter((item) => item.row.wallet_address && item.hardReject.length > 0)
    .map((item) => ({ wallet: item.row.wallet_address as string, reasons: item.hardReject }));
  const selected = scored
    .filter((item) => item.hardReject.length === 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((item, index) => toSelected(item.row, index + 1, item.score, item.reasons, selectedAt));

  mkdirSync(dirname(options.selectedTradersPath), { recursive: true });
  writeFileSync(options.selectedTradersPath, `${JSON.stringify(selected, null, 2)}\n`, 'utf8');
  updateEnv(options.envPath, selected.map((trader) => trader.wallet));

  return {
    selected,
    rejected,
    envPath: options.envPath,
    selectedTradersPath: options.selectedTradersPath,
  };
}

export function readSelectedTraders(path: string): SelectedTrader[] {
  if (!existsSync(path)) return [];
  const raw = readFileSync(path, 'utf8').trim();
  if (!raw) return [];
  return JSON.parse(raw) as SelectedTrader[];
}
