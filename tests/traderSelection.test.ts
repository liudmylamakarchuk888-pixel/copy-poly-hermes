import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { selectGoodTraders } from '../src/traderSelection.js';

describe('self-learning trader selector', () => {
  it('selects copy candidates by score while rejecting bots, farmers, and weak traders', () => {
    const dir = mkdtempSync(join(tmpdir(), 'poly-selector-'));
    try {
      mkdirSync(join(dir, 'data'));
      const leaderboardPath = join(dir, 'data', 'leaderboard.json');
      const selectedTradersPath = join(dir, 'data', 'selected-traders.json');
      const envPath = join(dir, '.env');
      writeFileSync(leaderboardPath, JSON.stringify({
        leaderboard: [
          { wallet_address: '0xgood1', realized_pnl_7d: 1000, volume_7d: 250000, win_rate_7d: 0.55, realized_pnl_30d: 5000, win_rate_30d: 0.53, risk_tier: 'moderate', copyability_tier: 'ok', is_bot: false, is_farmer: false },
          { wallet_address: '0xbot', realized_pnl_7d: 999999, volume_7d: 999999, win_rate_7d: 0.9, risk_tier: 'moderate', is_bot: true, is_farmer: false },
          { wallet_address: '0xlowwin', realized_pnl_7d: 5000, volume_7d: 300000, win_rate_7d: 0.2, risk_tier: 'moderate', is_bot: false, is_farmer: false },
          { wallet_address: '0xgood2', realized_pnl_7d: 800, volume_7d: 200000, win_rate_7d: 0.5, risk_tier: 'high', is_bot: false, is_farmer: false },
        ],
      }));

      const result = selectGoodTraders({ leaderboardPath, selectedTradersPath, envPath, limit: 2 });

      expect(result.selected.map((trader) => trader.wallet)).toEqual(['0xgood1', '0xgood2']);
      expect(result.rejected.some((rejected) => rejected.wallet === '0xbot' && rejected.reasons.includes('bot_flag'))).toBe(true);
      expect(result.rejected.some((rejected) => rejected.wallet === '0xlowwin' && rejected.reasons.includes('low_7d_win_rate'))).toBe(true);
      expect(JSON.parse(readFileSync(selectedTradersPath, 'utf8'))).toHaveLength(2);
      const env = readFileSync(envPath, 'utf8');
      expect(env).toContain('PAPER_MODE=true');
      expect(env).toContain('DRY_RUN=true');
      expect(env).toContain('BULLPEN_READ_ONLY=true');
      expect(env).toContain('COPY_WALLETS=0xgood1,0xgood2');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
