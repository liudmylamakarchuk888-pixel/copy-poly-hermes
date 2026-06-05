import { describe, expect, it } from 'vitest';
import { normalizeBullpenActivityItem } from '../src/bullpen.js';

describe('Bullpen activity normalization', () => {
  it('extracts market slug, outcome, side, amount, and stable id from Bullpen JSON-like trade activity', () => {
    const normalized = normalizeBullpenActivityItem('0xsource', {
      id: 'abc',
      timestamp: '2026-06-03T00:00:00Z',
      side: 'BUY',
      marketSlug: 'will-test-pass',
      outcome: 'Yes',
      cash: 42.5,
      price: 0.42,
      size: 100,
      endDate: '2026-06-10T00:00:00Z',
    });
    expect(normalized).toEqual({
      sourceWallet: '0xsource',
      externalId: 'abc',
      timestamp: '2026-06-03T00:00:00Z',
      side: 'buy',
      marketSlug: 'will-test-pass',
      outcome: 'Yes',
      amountUsd: 42.5,
      price: 0.42,
      size: 100,
      resolutionTimestamp: '2026-06-10T00:00:00Z',
      raw: expect.any(Object),
    });
  });

  it('returns null when required copy-trading fields are missing', () => {
    expect(normalizeBullpenActivityItem('0xsource', { id: 'abc' })).toBeNull();
  });

  it('normalizes the current Bullpen activity JSON shape', () => {
    const normalized = normalizeBullpenActivityItem('0xsource', {
      transaction_hash: '0xabc',
      timestamp: '2026-06-03T18:00:16+00:00',
      side: 'BUY',
      slug: 'atp-berrett-arnaldi-2026-06-03',
      event_slug: 'atp-berrett-arnaldi-2026-06-03',
      outcome: 'Matteo Berrettini',
      usdc_size: 119.189189,
      price: 0.63000000296,
      size: 189.189188,
    });

    expect(normalized).toMatchObject({
      sourceWallet: '0xsource',
      externalId: '0xabc',
      timestamp: '2026-06-03T18:00:16+00:00',
      side: 'buy',
      marketSlug: 'atp-berrett-arnaldi-2026-06-03',
      outcome: 'Matteo Berrettini',
      amountUsd: 119.189189,
      price: 0.63000000296,
      size: 189.189188,
    });
  });
});
