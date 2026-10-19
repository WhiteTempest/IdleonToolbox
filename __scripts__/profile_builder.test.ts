// profile_builder — builds one Toolbox profile JSON into the parsed account, its characters, and the
// values the site uploads as parsedData (expandLeaderboardInfo). project-paple's leaderboard gap
// tool runs it on the user's save and on public control profiles.
//
// Run:  PROFILE_IN=<profile.json> PROFILE_OUT=<out.json> node_modules/.bin/vitest run __scripts__/profile_builder.test.ts
// The input carries the upload shape: data, charNames, companion, guildData, serverVars,
// accountCreateTime, tournament.
import '../polyfills.js';
import { describe, it } from 'vitest';
import fs from 'node:fs';
import { parseData } from '@parsers/index';
import { expandLeaderboardInfo } from '../services/leaderboardInfo';

// parseData error handler references window.gtag; stub it for Node.
(globalThis as any).window = (globalThis as any).window ?? {};
(globalThis as any).window.gtag = () => {};

describe.runIf(process.env.PROFILE_IN && process.env.PROFILE_OUT)('profile builder', () => {
  it('writes the parsed profile', () => {
    const profile = JSON.parse(fs.readFileSync(process.env.PROFILE_IN!, 'utf-8'));
    const { data, charNames, companion, guildData, serverVars, accountCreateTime, tournament } = profile;
    const result = parseData(data, charNames, companion ?? null, guildData ?? null, serverVars ?? {},
      accountCreateTime ?? 0, tournament ?? null);
    const { account, characters } = result ?? {};
    if (!account) throw new Error('parseData returned no account');
    const leaderboard = expandLeaderboardInfo(account, characters);
    fs.writeFileSync(process.env.PROFILE_OUT!, JSON.stringify({ account, characters, leaderboard }));
  }, 60_000);
});
