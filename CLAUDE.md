---
alwaysApply: true
---

## Add dashboard alerts

Read `utility/migrations.js`, `pages/dashboard.jsx`, both dashboard components, and both `utility/dashboard/` modules. Bump `baseTrackers` once per change and add its migration. Before writing a migration, ask whether the latest one shipped; extend an unreleased migration or create a new version based on the answer.

## Add pages

Place each page in the correct route, update `components/constants.jsx` `PAGES`, and update the tabs array when needed. Use the supplied icon or temporary `/data/ClassIconsNA2.png`. Ask when the route is unclear.

## Translate obfuscated code

Read existing `parsers/` implementations and reuse their helpers. Query `data/website-data/` for game data; `shared-data.json` contains small keys, while large keys use separate files. Produce readable code.

Examples:

- `m._customBlock_Summoning("WinBonus", 27, 0)` becomes `getWinnerBonus(account, '<x Amber Gain')`.
- `OptionsListAccount[478]` becomes `account?.accountOptions?.[478]`.
- `_customBlock_Summoning2("MeritocBonusz", 17, 0)` becomes `getMeritocracyBonus(account, 17)`.
- `DNSM.h.AlchBubbles.h.M11` becomes `getBubbleBonus(account, 'DEEP_DEPTH', false)`.

## Test changes

Use `http://localhost:3001?demo=true` to open every page without signing in.

`npm run test:e2e` builds and serves static `out/` on port 3002. `test:e2e:nobuild` reuses existing output, which can be stale. Never wait for `networkidle` because ads keep requests active; use `waitForRender` from `e2e/wait-helpers.js`. Navigate with relative paths because `playwright.config.js` owns `baseURL`. Pre-commit runs all Vitest tests; never use `--no-verify`.

## Preserve the mixed JavaScript and TypeScript design

Write new `parsers/` files in TypeScript. Keep `components/` in JSX and other JS files unchanged unless the user requests migration.

Do not edit generated `parsers/generated-types.ts`, `parsers/generated-firebase-types.ts`, or `data/website-data.d.ts`. Import parser types through `parsers/types.ts`:

```ts
import type { IdleonData, Account } from './types'
```

Export return interfaces and type parser functions as `getXxx(idleonData: IdleonData, account: Account, ...): ReturnType`. Internal helpers can use `any` when complete typing is impractical. `custom.ts` supplies ambient types to JS and JSX; TypeScript files use explicit imports.

Use aliases from `tsconfig.json`: `@components/*`, `@parsers/*`, `@hooks/*`, and `@utility/*` map to their root directories; `@website-data` maps to `data/website-data/index.js`. `vitest.config.js` mirrors them. Preserve a file's existing bare imports through `baseUrl: "./"`; add each new bare prefix to Vitest's anchored aliases.

## Format dates and storage

All visible dates and times follow `PreferencesContext` values from `pref-dateFormat` and `pref-timeFormat`.

- React uses `useFormatDate` for direct dates and `useRealDate` for the `getRealDateInMs` fallback. `useFormatDate` accepts `showSeconds`, `shortYear`, and `timeOnly`; only `showSeconds` defaults to true. Never hardcode numeric date or time formats.
- Parsers and utilities can call `utility/helpers.js.getRealDateInMs` with a format string.
- Month-name formats can remain fixed because they are unambiguous.
- Exports can use preferences to match the screen.

Use Mantine `useLocalStorage`, not direct `localStorage` plus `useState`. Use `readLocalStorageValue` for one read outside rendering. Values use JSON serialization. Omit `defaultValue` when unset must remain distinct. Dynamic keys update automatically.

React Compiler handles routine memoization; do not add `useMemo` or `useCallback` without a measured need.

## Preserve search metadata and static export

Never edit generated `data/page-seo.js`. After changing `<NextSeo>`, run `node utility/generate-page-seo.mjs`. `_app` emits title, description, and canonical above `<WaitForRouter>` so they exist before JavaScript runs.

- Never emit head tags from `_document`; Next cannot deduplicate them against `<NextSeo>`.
- Keep `key="canonical"` so Next deduplicates canonical links.
- A page with `seoNoindex` repeats `noindex` in its own `<NextSeo>`.
- `PAGE_SEO` keys dynamic route patterns. Dynamic pages pass metadata through `getStaticProps` and need generator `OVERRIDES`.
- Match `<title[^>]*>`, because exported titles contain attributes.
- Keep `<NextSeo>` above early loaders.
- Keep both raw-HTML and hydrated checks in `e2e/static-head.spec.js`.

Next permits only one dynamic parameter name per directory. Branch inside one route instead of adding sibling `[class].jsx` and `[build].jsx`. Lowercase filesystem slugs because Windows exports case-insensitively. With `fallback: false`, newly published builds use `/tools/builds/view?id=`; keep that route `noindex`.

Content below `<WaitForRouter>` does not enter static output. Return `crawlLinks` from `getStaticProps` and render `CrawlLinks` above the gate when crawlers need links. Keep `PreHydrationLoader` as a spinner only; do not restore page content that flashes before hydration.

## Write patch notes

Ask before changing `data/patch-notes.js`. After approval, include the note in the same commit. If the newest entry uses today's `DD/MM/YYYY` date, prepend to its `features` or `fixes`; otherwise add a new entry with the next patch version, today's date, copied `gameVer`, and an empty unused array.

Describe the visible effect briefly. Skip refactors, tests, tooling, documentation, and type-only work.

## Preserve empty-account output

Every page renders the full zero-value catalog while logged out.

- Loop over catalogs, not save entries.
- Return populated objects for available content. Use `null` with `unlocked: false` only for locked features, as pinned by `null-fallback-shape.test.js`.
- Default multipliers and rates to 1, not 0.
- Derive counts from catalogs.
- Check new empty-save guards against real saves.
- `parseData` returns `{ account, characters }`.
- `liveEntries` removes placeholders; `safeSection` isolates parser failures.

Compare real-save output with all five `__test__/fixtures/`. Run `empty-account.test.js`, `nan-elimination.test.js`, and `e2e/no-nan.spec.js`; non-finite values also fail.

## Keep comments and serialization behavior

Write only load-bearing comments that explain why. Never remove `@vitest-environment`, `eslint-*`, `@ts-*`, `webpackChunkName`, or `prettier-ignore` directives.

`serializeData` intentionally runs three passes because one pass can produce values required by the next. Keep the passes unless you prove all cascading calculations stabilize earlier.
