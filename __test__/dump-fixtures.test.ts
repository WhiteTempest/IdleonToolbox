// Golden-fixture dumper for the project-paple faithful port.
// Runs the REAL Toolbox parsers against project-paple's live save and writes
// account.<key>.json fixtures the Python accumulator asserts against.
//
// Not a real test -- it's a generator that happens to ride vitest's alias
// resolution (@parsers/@website-data). Run with:
//   npx vitest run __test__/dump-fixtures.test.ts
//
// Add a key here as each faithful parser is ported (Milestone 0: rift +
// accountOptions only).
import '../polyfills.js'; // MUST be first: patches Array/String prototypes the parsers rely on
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { tryToParse } from '@utility/helpers';
import { getRift } from '@parsers/world-4/rift';
import { getAdviceFish } from '@parsers/misc';
import { getCards } from '@parsers/cards';
import { getStamps } from '@parsers/world-1/stamps';
import { getArmorSmithy } from '@parsers/world-3/armorSmithy';
import { getAlchemy } from '@parsers/world-2/alchemy';
import { getSlab } from '@parsers/misc';
import { getCooking } from '@parsers/world-4/cooking';
import { getAchievements } from '@parsers/achievements';
import { getGaming } from '@parsers/world-5/gaming';
import { getSpelunking } from '@parsers/world-7/spelunking';
import { getBundles } from '@parsers/misc';
import { getGrimoire } from '@parsers/class-specific/grimoire';
import { getCharacters } from '@parsers/character';
import { getStatues } from '@parsers/world-1/statues';
import { getArtifacts, getSailing } from '@parsers/world-5/sailing';
import { getArcade } from '@parsers/world-2/arcade';
import { getFarming, updateFarming } from '@parsers/world-6/farming';
import { getCompanions } from '@parsers/misc';
import { summoningBonuses, summoningEnemies, summoningEndless, classes, jadeUpgrades, pristineCharms as rawPristineCharms } from '@website-data';
import { number2letter } from '@utility/helpers';

const SAVE = path.resolve(__dirname, '../../project-paple/var/saves/idleon_save_latest.json');
const OUT = path.resolve(__dirname, '../../project-paple/IdleonProcessor/fixtures');

// Opt-in only: `npm test` runs on every pre-commit and this file rewrites every
// project-paple fixture against the current save when it runs (clobbered 15
// fixtures on 2026-08-28). Set DUMP_FIXTURES=1 to regenerate deliberately.
describe.skipIf(!process.env.DUMP_FIXTURES)('dump fixtures', () => {
  it('writes account fixtures from the live save', () => {
    const save = JSON.parse(fs.readFileSync(SAVE, 'utf-8'));
    const cs = save.cloudsave ?? save;
    let numChars = 0;
    while (`CharacterClass_${numChars}` in cs) numChars++;
    const charNames = Array.from({ length: numChars }, (_, i) => `Char${i}`);
    const charactersData = getCharacters(cs as any, charNames);
    const raw = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../data/raw.json'), 'utf-8'));
    const serverVars = raw.serverVars;
    const accountOptions = tryToParse(cs.OptLacc);
    const charLevelsData = charactersData.map((c: any) => ({
      level: c?.PersonalValuesMap?.StatList?.[4] ?? 0,
      class: (classes as any)?.[c?.CharacterClass] ?? null,
    }));
    const looty = getSlab(cs);
    const cookingFull = getCooking(cs as any, { accountOptions } as any);
    // Computed early (not just inside the `sailing` fixture) because spelunking's chapter
    // baseMultiplier reads sailing.artifacts[35].bonus -- must match what Python's
    // IdleonAccount.py sees (real sailing.artifacts, now that sailing is ported) or the two
    // sides diverge on chapters/sharedGrandDiscoveryFactors.
    const artifactsList = getArtifacts(cs as any, charLevelsData as any,
      {
        accountOptions, looty, cooking: cookingFull, lab: { labBonuses: [] },
        legendTalents: { talents: [{ originalIndex: 11, bonus: 0 }, { originalIndex: 28, bonus: 0 }] },
        construction: { playersBuildRate: 0 }, atoms: { particles: 0 },
      } as any);

    const alchemyFull = getAlchemy(cs as any, [], { accountOptions } as any);

    // Summoning winnerBonuses with all cross-system deps = 0 (sailing/charms/
    // achievements/merits unported in Python -> both sides agree on zeros).
    const summonRaw = tryToParse(cs.Summon) ?? [];
    const wonBattles: string[] = summonRaw[1] ?? [];
    const endlessLevel: number = (accountOptions as any)?.[319] ?? 0;
    const sumRaw = new Array(32).fill(0);
    for (const enemyId of wonBattles) {
      const e = (summoningEnemies as any[]).find((x: any) => x.enemyId === enemyId);
      if (e && typeof e.bonusId === 'number' && e.bonusId < 20) {
        sumRaw[e.bonusId] = (sumRaw[e.bonusId] || 0) + Number(e.bonusQty);
      }
    }
    for (let wave = 0; wave < endlessLevel; wave++) {
      const wi = wave % 40;
      const bid = Math.round(Number((summoningEndless as any).bonusIds[wi]) - 1);
      const qty = Number((summoningEndless as any).bonusQuantities[wi]);
      if (bid >= 0 && bid < 32) sumRaw[bid] = (sumRaw[bid] || 0) + qty;
    }
    const _sumLocal = (i: number): number => {
      const rv = sumRaw[i] ?? 0;
      if ([20, 22, 24, 31].includes(i)) return rv;
      const multi = sumRaw[31] ?? 0;
      if (i === 19) return 3.5 * rv;
      if (i >= 20 && i <= 33) return rv * (1 + multi / 100);
      return 3.5 * rv * (1 + multi / 100);
    };
    const summoningWinnerBonuses = (summoningBonuses as any[]).map(({ bonusId, bonus }: any, i: number) => ({
      bonusId, bonus, value: _sumLocal(i), baseValue: sumRaw[i] ?? 0,
    }));

    // sneaking: mirrors IdleonAccount.py's _parse_sneaking_jade_emporium -- ONLY
    // jadeEmporium unlock flags + pristineCharms unlocked/baseValue, computed straight
    // from raw Ninja (rawSneaking) indices, matching orderedEmporium's/pristineCharms'
    // own unlock formulas from sneaking.ts without needing the full getSneaking() call
    // (which needs lab/compass/palette/upgradeVault/legendTalents/spelunking cross-deps
    // Python doesn't compute for this narrow subset).
    const rawSneaking = tryToParse(cs.Ninja) ?? cs.Ninja;
    const jadeEmporiumUnlocks: string = rawSneaking?.[102]?.[9] ?? '';
    const jadeEmporiumFixture = (jadeUpgrades as any[]).map((upg: any, idx: number) => ({
      name: upg.name,
      unlocked: jadeEmporiumUnlocks ? jadeEmporiumUnlocks.indexOf(number2letter[idx]) !== -1 : false,
    }));
    const pristineCharmUnlocks: any[] = rawSneaking?.[107] ?? [];
    const pristineCharmsFixture = (rawPristineCharms as any[]).map((charm: any, idx: number) => ({
      name: charm.name,
      baseValue: charm.x3,
      unlocked: Boolean(pristineCharmUnlocks?.[idx]),
    }));

    // companions: real data (save.companion is a top-level field, NOT part of cloudsave --
    // mirrors IdleonData/CompanionsData.py's is_companion_acquired reading save_data['companion']
    // directly). Needed by arcade's companion-bonus term below.
    const companionsList = getCompanions((save as any).companion, accountOptions).list;

    // grimoire: computed once, reused by both the grimoire fixture and farming's
    // cropDepot (getCropDepotBonuses reads account.grimoire.upgrades[22]).
    const grimoireFull = getGrimoire(cs as any, [] as any, { accountOptions, bundles: getBundles(cs) } as any);

    // research.totalStickers: real value (mirrors IdleonAccount.py::_parse_research --
    // sum of raw Research[9], the 5-entry farming-sticker-level array). farming's
    // updateFarming just passes this through verbatim, so feeding the real number here
    // (not 0) is required to match Python, which already has this system ported.
    const rawResearchStickers: number[] = (tryToParse(cs.Research) ?? [])[9] ?? [];
    const totalStickersReal = rawResearchStickers.reduce((sum: number, v: number) => sum + (v || 0), 0);

    const _mealSubset = (m: any) => ({
      name: m.name, cookReq: m.cookReq, rawName: m.rawName, baseStat: m.baseStat,
      effect: m.effect, description: m.description, stat: m.stat,
      index: m.index, level: m.level, amount: m.amount,
      cookingMasteryNode: m.cookingMasteryNode,
    });

    // Spelunking: feed chars with spelunking.level=0 (no char data in account accumulator)
    // and the real sailing.artifacts (chapter baseMultiplier reads artifacts[35].bonus).
    const spelunkPartialAccount = { accountOptions, sailing: { artifacts: artifactsList } };
    const spelunkChars = [{ skillsInfo: { spelunking: { level: 0 } } }];
    const spFull = getSpelunking(cs as any, spelunkPartialAccount as any, spelunkChars as any);
    const _spLoreBoss = (b: any) => ({
      index: b.index, defeated: b.defeated,
      discoveriesCount: b.discoveriesCount, maxDiscoveries: b.maxDiscoveries,
      grandDiscoveriesFound: b.grandDiscoveriesFound, grandDiscoveryChance: b.grandDiscoveryChance,
      biggestHaul: b.biggestHaul, bestCaveLevel: b.bestCaveLevel, foundAt: b.foundAt,
    });
    const spelunkingFixture = spFull ? {
      cavesUnlocked: spFull.cavesUnlocked,
      bestCaveLevels: spFull.bestCaveLevels,
      totalBestCaveLevels: spFull.totalBestCaveLevels,
      discoveriesCount: spFull.discoveriesCount,
      maxDiscoveries: spFull.maxDiscoveries,
      currentAmber: spFull.currentAmber,
      overstimLevel: spFull.overstimLevel,
      overstimCurrent: spFull.overstimCurrent ?? 0,
      totalGrandDiscoveries: spFull.totalGrandDiscoveries,
      biggestHaul: spFull.biggestHaul,
      biggestHauls: spFull.biggestHauls,
      loreBosses: spFull.loreBosses?.map(_spLoreBoss),
      chapters: spFull.chapters?.map((chArr: any) => chArr.map((ch: any) => ({ level: ch.level, bonus: ch.bonus }))),
      upgrades: spFull.upgrades?.map((u: any) => ({ level: u.level, baseBonus: u.baseBonus, bonus: u.bonus })),
    } : null;

    const fixtures: Record<string, unknown> = {
      accountOptions,
      rift: getRift(cs),
      adviceFish: getAdviceFish(cs),
      looty: { rawLootedItems: looty.rawLootedItems },
      cooking: { meals: cookingFull?.meals?.map(_mealSubset) ?? [] },
      spelunking: spelunkingFixture,
      // account-dependent: feed accountOptions + spelunking (loreBosses controls 6-star cap)
      cards: getCards(cs, { accountOptions, spelunking: spFull } as any),
      // account-dependent on storage, which Python hasn't parsed yet -> feed none, both sides agree
      stamps: getStamps(cs, { accountOptions } as any),
      bundles: getBundles(cs),
      armorSmithy: getArmorSmithy(cs as any, {} as any, { accountOptions, bundles: getBundles(cs) } as any),
      // alchemy: only the subset Python computes (bubbles+vials+prisma); p2w/cauldrons deferred
      alchemy: {
        bubbles: alchemyFull.bubbles,
        bubblesFlat: alchemyFull.bubblesFlat,
        vials: alchemyFull.vials,
        prismaFragments: alchemyFull.prismaFragments,
        prismaBubbles: alchemyFull.prismaBubbles,
      },
      summoning: { winnerBonuses: summoningWinnerBonuses },
      sneaking: { jadeEmporium: jadeEmporiumFixture, pristineCharms: pristineCharmsFixture },
      // achievements: pure save read, no account deps
      achievements: getAchievements(cs),
      // gaming: simulate Toolbox's converged state (2 passes like Toolbox's 3-pass loop).
      //   Pass 1: get superbitsUpgrades + snailLevel with minimal account.
      //   Pass 2: feed gaming.{snailLevel,superbitsUpgrades} so getPaletteLuck uses real snailLevel.
      // Deps kept zero in Python and here: jade unlocked:false (sneaking unported),
      //   chars=[{gaming:0}] so getHighestCharacterSkill returns 0 not -Infinity.
      // bonus/totalBonus on superbits omitted (need towers/chars/achievements).
      gaming: (() => {
        // legend talent 10 (Picasso_Gaming): real bonus = 25 * Spelunk[18][10] level,
        // same linear formula as legendTalents.ts's parseLegendTalents (not stubbed
        // to 0 anymore -- this save has it invested, see project-paple TODO E2).
        const talent10Level = (tryToParse(cs.Spelunk) as any)?.[18]?.[10] || 0;
        const legendTalents = { talents: [{ originalIndex: 10, bonus: 25 * talent10Level }] };
        // isJadeBonusUnlocked returns ?.unlocked (bool); unlocked:false → false → 100*false=0 in JS
        const sneaking = { jadeEmporium: [{ name: 'Palette_Slot', unlocked: false }] };
        // dummy char with level 0 so Math.max(...[0])=0 instead of Math.max()=-Infinity
        const chars = [{ skillsInfo: { gaming: { level: 0 } } }];
        const acct1: any = { accountOptions, legendTalents, sneaking };
        const g1 = getGaming(cs as any, chars as any, acct1, {});
        if (!g1) return null;
        // pass 2: feed full g1 as account.gaming (mirrors Toolbox parseData pass 2)
        // so imports[2].acornShop[2].bonus + palette[3].bonus resolve to real values
        const acct2 = { ...acct1, gaming: g1 };
        const g = getGaming(cs as any, chars as any, acct2, {});
        if (!g) return null;
        // cost excluded: Python int vs JS float precision diverges for large x2 values
        const _sb = (s: any) => ({ name: s.name, originalIndex: s.originalIndex, unlocked: s.unlocked, isDuper: s.isDuper, isZuper: s.isZuper });
        const _pal = (p: any) => ({ name: p.name, x4: p.x4, x5: p.x5, level: p.level, bonus: p.bonus, active: p.active, chance: p.chance });
        return {
          superbitsUpgrades: g.superbitsUpgrades?.map(_sb),
          palette: [...(g.palette?.slice(0, 37)?.map(_pal) ?? []), g.palette?.[37]],
          paletteFinalBonus: g.paletteFinalBonus,
          paletteLuck: { value: g.paletteLuck?.value },
        };
      })(),
      // grimoire: account-level subset only (totalUpgradeLevels/bones/upgrades/nextUnlock/
      // totalBonesCollected/ribbons). charactersData=[] (unused by these fields; only
      // getWraithStats/getExtraBonesBonus need it, out of scope). legendTalents unfed ->
      // hasLegendTalent resolves false on both sides (see IdleonAccount.py comment).
      grimoire: (() => {
        const g = grimoireFull;
        return {
          totalUpgradeLevels: g.totalUpgradeLevels,
          bones: g.bones,
          totalBonesCollected: g.totalBonesCollected,
          ribbons: g.ribbons,
          upgrades: g.upgrades?.map((u: any) => ({
            index: u.index, level: u.level, cost: u.cost, unlocked: u.unlocked,
            bonus: u.bonus, description: u.description,
          })),
          nextUnlock: g.nextUnlock ? { index: g.nextUnlock.index, unlockLevel: g.nextUnlock.unlockLevel } : null,
        };
      })(),
      // characters: narrow subset (class/level/statueLevels) -- mirrors how getStaticData
      // derives charactersLevels from the raw getCharacters() output, plus StatueLevels
      // (used directly, capitalized, by statues.ts). Full per-char parse out of scope.
      characters: charactersData.map((char: any) => ({
        class: (classes as any)?.[char?.CharacterClass] ?? null,
        level: char?.PersonalValuesMap?.StatList?.[4] ?? null,
        statueLevels: char?.StatueLevels ?? null,
      })),
      // statues: full getStatues() output (accountData.statues/zenith as Toolbox actually
      // exposes them -- applyStatuesMulti's result is discarded same-pass, see IdleonAccount.py).
      statues: (() => {
        const { statues, zenith } = getStatues(cs as any, charactersData as any, { accountOptions } as any);
        return {
          statues: statues?.map((s: any) => ({
            index: s.index, name: s.name, rawName: s.rawName, level: s.level, progress: s.progress,
            onyxStatue: s.onyxStatue, zenithStatue: s.zenithStatue, statueIndex: s.statueIndex,
          })),
          zenith: {
            market: zenith.market?.map((m: any) => ({
              name: m.name, level: m.level, bonus: m.bonus, cost: m.cost,
              description: m.description, costToMax: m.costToMax,
            })),
            clusters: zenith.clusters,
          },
        };
      })(),
      // sailing: structural subset only (see IdleonAccount.py _parse_sailing docstring for the
      // full list of deferred bonus-stack fields: boat.loot/speed/artifactChance/maxTime/
      // timeLeft, trades, timeToFullChests -- all need systems this port doesn't have).
      // charLevelsData mirrors getStaticData's charactersLevels shape (level/class from the
      // raw per-char fields), which is what getArtifacts/getSailing actually consume.
      sailing: (() => {
        const acct: any = {
          accountOptions, rift: getRift(cs), achievements: getAchievements(cs),
          looty, cooking: cookingFull, spelunking: spFull,
          gemShopPurchases: tryToParse(cs.GemItemsPurchased),
          tasks: tryToParse(cs.Tasks) ?? [0, 1, 2, 3, 4, 5, 6].map((i) => tryToParse((cs as any)[`TaskZZ${i}`])),
          // Everything below is unported and its real VALUE is discarded from the fixture
          // (we only keep maxChests/artifacts/lootPile/chests/captains/boats structural
          // fields -- see the big comment in IdleonAccount.py _parse_sailing). These stubs
          // exist only so the internal bonus-stack calls (getBoatLootValue/SpeedValue/
          // ArtifactChance etc., which getBoat always runs) don't throw on missing `?.`
          // chains a few levels deep in Toolbox's own helpers.
          lab: { labBonuses: [] },
          hole: {
            holesObject: {
              wellSediment: [], sedimentMulti: [], extraCalculations: [],
              bellImprovementMethods: [], engineerSchematics: [], studyStuff: [],
            },
          },
          upgradeVault: { upgrades: [] },
          arcade: { shop: [] },
          divinity: { deities: [] },
          breeding: { pets: [] },
          sneaking: { jadeEmporium: [] },
          // legendTalents unported -> bonus 0, not absent: getLegendTalentBonus returns
          // undefined for a missing index, and `0 + undefined` is NaN, not 0 -- an empty
          // talents array would silently NaN several formulas. Cover every index
          // sailing.ts queries (11: boat speed/Davey Jones; 28: Ruble_Cuble family).
          legendTalents: { talents: [{ originalIndex: 11, bonus: 0 }, { originalIndex: 28, bonus: 0 }] },
          bribes: [],
          companions: { list: [] },
          alchemy: { p2w: { sigils: [] }, vials: alchemyFull.vials },
          starSigns: [],
          // construction/atoms unported -> feed 0, not absent: lavaLog(undefined) is NaN
          // (Math.max(undefined,1)=NaN), but lavaLog(0)=0 -- Fun_Hippoete/The_True_Lantern
          // need a real number here, not a missing key.
          construction: { playersBuildRate: 0 },
          atoms: { particles: 0 },
        };
        const s = getSailing(cs as any, artifactsList, charactersData as any, acct, serverVars, charLevelsData as any);
        if (!s) return null;
        return {
          maxChests: s.maxChests,
          rareTreasureChance: s.rareTreasureChance,
          minimumTravelTime: s.minimumTravelTime,
          captainsOnBoats: s.captainsOnBoats,
          lootPile: s.lootPile,
          artifacts: s.artifacts?.map((a: any) => ({
            name: a.name, description: a.description, additionalData: a.additionalData,
            bonus: a.bonus, acquired: a.acquired, rawName: a.rawName,
          })),
          chests: s.chests,
          captains: s.captains?.map((c: any) => ({
            captainIndex: c.captainIndex, captainType: c.captainType, level: c.level,
            firstBonusValue: c.firstBonusValue, secondBonusValue: c.secondBonusValue,
            firstBonus: c.firstBonus, secondBonus: c.secondBonus,
            firstBonusDescription: c.firstBonusDescription, secondBonusDescription: c.secondBonusDescription,
          })),
          shopCaptains: s.shopCaptains?.map((c: any) => ({
            captainIndex: c.captainIndex, captainType: c.captainType, level: c.level, cost: c.cost,
          })),
          boats: s.boats?.map((b: any) => ({
            rawName: b.rawName, level: b.level, captainIndex: b.captainIndex,
            captainMappedIndex: b.captainMappedIndex, lootLevel: b.lootLevel, speedLevel: b.speedLevel,
            boatIndex: b.boatIndex, islandIndex: b.islandIndex, distanceTraveled: b.distanceTraveled,
            resources: b.resources, breakpointResources: b.breakpointResources,
          })),
        };
      })(),
      // arcade: real companions.list (save.companion is real data, not stubbed -- see
      // IdleonData/CompanionsData.py) so the companionBonus(idx 27) doubling term is
      // exercised for real, matching Python's is_companion_acquired. balls/goldBalls/
      // royalBalls/maxBalls dropped -- Python skips them (needs dungeons.ts, no consumer).
      arcade: (() => {
        const acct: any = { accountOptions, companions: { list: companionsList } };
        const a = getArcade(cs as any, acct, serverVars);
        if (!a) return null;
        return {
          shop: a.shop?.map((s: any) => ({
            effect: s.effect, x1: s.x1, x2: s.x2, func: s.func, level: s.level, bonus: s.bonus,
          })),
          totalUpgradeLevels: a.totalUpgradeLevels,
        };
      })(),
      // farming: only the 4 fields Python computes (exoticMarket/cropsFound/totalRanks/
      // cropDepot.spelunky/totalStickers -- see IdleonAccount.py::_parse_farming docstring).
      // lab/upgradeVault/emperor/research stubbed empty (unported, Python zeroes their
      // contribution too); grimoire/sneaking.jadeEmporium fed real (both already ported).
      // Two-pass, same shape as index.ts's real build order (getFarming, then
      // updateFarming with account.farming=pass1 -- cropDepot/totalStickers only exist
      // after the second pass, updateFarming's own return).
      // NOTE: real getFarming's own exoticMarket filters out placeholder 'NAME_MAGNI'
      // entries (index >=60) -- Python's vendored catalog doesn't, so the two arrays
      // differ in length past index 60. test_account_fixtures.py's _check_farming must
      // filter both sides by name!='NAME_MAGNI' before comparing.
      farming: (() => {
        const acct1: any = {
          accountOptions,
          gemShopPurchases: tryToParse(cs.GemItemsPurchased),
          grimoire: grimoireFull,
          sneaking: { jadeEmporium: jadeEmporiumFixture },
          lab: { labBonuses: [], jewels: [] },
          upgradeVault: { upgrades: [] },
          research: { totalStickers: totalStickersReal },
          emperor: {},
          companions: { list: companionsList },
          starSigns: [],
          achievements: getAchievements(cs),
          alchemy: { vials: alchemyFull.vials },
          tasks: [],
        };
        const farmingPass1 = getFarming(cs as any, acct1, charactersData as any);
        if (!farmingPass1) return null;
        const acct2 = { ...acct1, farming: farmingPass1 };
        const f = updateFarming(charactersData as any, acct2 as any);
        if (!f) return null;
        return {
          exoticMarket: f.exoticMarket?.map((e: any) => ({ name: e.name, level: e.level, value: e.value })),
          cropsFound: f.cropsFound,
          totalRanks: f.totalRanks,
          cropDepot: { spelunky: f.cropDepot?.spelunky },
          totalStickers: f.totalStickers,
        };
      })(),
    };

    fs.mkdirSync(OUT, { recursive: true });
    for (const [key, value] of Object.entries(fixtures)) {
      fs.writeFileSync(path.join(OUT, `account.${key}.json`), JSON.stringify(value, null, 2));
    }
    expect(Object.keys(fixtures).length).toBeGreaterThan(0);
  });
});
