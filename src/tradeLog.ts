import { dirname } from 'node:path';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import type { TradeLog, TradeLogEntry } from './types.js';

function ensureParent(path: string): void {
  mkdirSync(dirname(path), { recursive: true });
}

export function createJsonTradeLog(path: string): TradeLog {
  ensureParent(path);
  if (!existsSync(path)) {
    writeFileSync(path, '[]\n', { encoding: 'utf8' });
  }

  return {
    append(entry: TradeLogEntry): void {
      const entries = this.readAll();
      entries.push(entry);
      writeFileSync(path, `${JSON.stringify(entries, null, 2)}\n`, { encoding: 'utf8' });
    },
    readAll(): TradeLogEntry[] {
      const raw = readFileSync(path, 'utf8').trim();
      if (!raw) return [];
      return JSON.parse(raw) as TradeLogEntry[];
    },
  };
}
