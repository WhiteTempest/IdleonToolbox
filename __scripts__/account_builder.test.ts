// account_builder — builds var/account.json from the live save via full parseData.
// Invoked by Python's ensure_account_fresh(); skips if GlobalTime hasn't advanced.
//
// Run:  cd ../IdleonToolbox && node_modules/.bin/vitest run __scripts__/account_builder.test.ts
import '../polyfills.js';
import { describe, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { parseData } from '@parsers/index';
import { getChipsAndJewels } from '@parsers/world-4/cooking';

// parseData error handler references window.gtag — stub it for Node
(globalThis as any).window = (globalThis as any).window ?? {};
(globalThis as any).window.gtag = () => {};

const SAVE_PATH = path.resolve(__dirname, '../../project-paple/var/saves/idleon_save_latest.json');
const OUT_PATH  = path.resolve(__dirname, '../../project-paple/var/account.json');

describe('account builder', () => {
  it('writes account.json when GlobalTime advances', () => {
    const save = JSON.parse(fs.readFileSync(SAVE_PATH, 'utf-8'));
    const cs = save.cloudsave ?? save;

    const timeAway = typeof cs.TimeAway === 'string' ? JSON.parse(cs.TimeAway) : (cs.TimeAway ?? {});
    const currentGlobalTime: number = timeAway.GlobalTime ?? 0;

    // freshness check — skip if account.json already matches this save
    if (fs.existsSync(OUT_PATH)) {
      try {
        const existing = JSON.parse(fs.readFileSync(OUT_PATH, 'utf-8'));
        if (existing.GlobalTime === currentGlobalTime) {
          console.log(`[account_builder] fresh (GlobalTime=${currentGlobalTime}), skipping`);
          return;
        }
      } catch { /* stale/corrupt — fall through and rebuild */ }
    }

    const charCount = Object.keys(cs).filter(k => /^CharSAVED_\d+$/.test(k)).length;
    const charNames = Array.from({ length: charCount }, (_, i) => i);

    const t0 = performance.now();
    const result = parseData(
      cs as any,
      charNames as any,
      null as any,  // companion
      null,         // guildData
      {} as any,    // serverVars (deferred — add var/server_vars.json later)
      0,            // accountCreateTime
      null          // tournament
    );
    const elapsed = (performance.now() - t0).toFixed(1);

    const { account } = result ?? {};
    if (!account) throw new Error('parseData returned no account');

    // Inject current-week chip/jewel rotation into account.lab so Python can
    // detect unclaimed state by comparing against currentRotation (labRaw[13]).
    const safeAccount = { ...account, serverVars: { ChipRepo: [-1, -1, -1], ...(account.serverVars ?? {}) } };
    const rotationItems = getChipsAndJewels(safeAccount, 1)?.at(0)?.items ?? [];
    if (account.lab) {
      account.lab.computedRotationIndices = rotationItems.map((item: any) => item?.index ?? -1);
    }

    fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
    fs.writeFileSync(OUT_PATH, JSON.stringify({ GlobalTime: currentGlobalTime, account }, null, 2));
    console.log(`[account_builder] wrote account.json in ${elapsed}ms (chars=${charCount}, GlobalTime=${currentGlobalTime})`);
  }, 30_000);
});
