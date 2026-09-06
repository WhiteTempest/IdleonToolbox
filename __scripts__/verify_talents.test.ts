// verify_talents — dumps the real Toolbox per-character talent levels so the
// Python port in project-paple can be diffed against them field by field.
//
// Throwaway verification harness, not part of the app.
// Run:  cd ../IdleonToolbox && node_modules/.bin/vitest run __scripts__/verify_talents.test.ts
import '../polyfills.js';
import { describe, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { parseData } from '@parsers/index';

(globalThis as any).window = (globalThis as any).window ?? {};
(globalThis as any).window.gtag = () => {};

const SAVE_PATH = path.resolve(__dirname, '../../project-paple/var/saves/idleon_save_latest.json');
const OUT_PATH = path.resolve(__dirname, '../../project-paple/var/talents_reference.json');

// Gated like the fixture dumper: pre-commit `npm test` runs everything here, and
// an ungated run would silently rewrite the very reference project-paple's
// test_talent_levels.py diffs against -- regenerating ground truth from whatever
// save is on disk makes the comparison self-fulfilling.
//   DUMP_TALENTS=1 node_modules/.bin/vitest run __scripts__/verify_talents.test.ts
const ENABLED = process.env.DUMP_TALENTS === '1';

describe('talent reference dump', () => {
  it.skipIf(!ENABLED)('writes the parsed talent levels for every character', () => {
    const save = JSON.parse(fs.readFileSync(SAVE_PATH, 'utf-8'));
    const cs = save.cloudsave ?? save;
    const charCount = Object.keys(cs).filter((k) => /^CharSAVED_\d+$/.test(k)).length;
    const charNames = Array.from({ length: charCount }, (_, i) => i);

    const result = parseData(cs as any, charNames as any, null as any, null,
      {} as any, 0, null);
    const { characters, account } = result ?? {};
    if (!characters) throw new Error('parseData returned no characters');

    const dump = characters.map((c: any) => ({
      playerId: c?.playerId,
      class: c?.class,
      level: c?.level,
      addedLevels: c?.addedLevels,
      rgTalentAddedLevelsCap: c?.rgTalentAddedLevelsCap,
      selectedTalentPreset: c?.selectedTalentPreset,
      superTalentsInfo: c?.superTalentsInfo,
      addedLevelsBreakdown: c?.addedLevelsBreakdown,
      talents: (c?.flatTalents ?? []).map((t: any) => ({
        name: t?.name,
        skillIndex: t?.skillIndex,
        level: t?.level,
        baseLevel: t?.baseLevel,
        maxLevel: t?.maxLevel,
        isSuperTalent: t?.isSuperTalent,
      })),
    }));

    fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
    fs.writeFileSync(OUT_PATH, JSON.stringify({
      superTalentAddedLevels: characters?.[0]?.superTalentsInfo?.bonus,
      accountOptions232: account?.accountOptions?.[232],
      characters: dump,
    }, null, 2));
    console.log(`[verify_talents] wrote ${OUT_PATH} for ${dump.length} characters`);
  }, 60_000);
});
