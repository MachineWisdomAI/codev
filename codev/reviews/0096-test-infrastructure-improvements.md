# Review: Test Infrastructure Improvements

## Metadata
- **Specification**: `codev/specs/0096-test-infrastructure-improvements.md`
- **Plan**: `codev/plans/0096-test-infrastructure-improvements.md`
- **Date**: 2026-02-10
- **Branch**: `builder/0096-test-infrastructure-improvements`

## Summary

Transformed Codev's test infrastructure from a fragmented multi-framework setup (Vitest + BATS + Playwright with manual setup) into a unified pipeline with CI enforcement. All 6 planned phases were implemented successfully.

## What Was Done

### Phase 1: Fix Test Classification
- Renamed 5 test files to `*.e2e.test.ts` suffix (tower-baseline, tower-api, tower-terminals, cli-tower-mode, bugfix-202)
- Updated `vitest.config.ts` with glob pattern `**/*.e2e.test.ts` to exclude server-spawning tests
- Updated `vitest.e2e.config.ts` with pattern-based inclusion

### Phase 2: CI for Vitest Unit + Tower Integration
- Created `.github/workflows/test.yml` with unit test and integration test jobs
- Unit tests run `npx vitest run --coverage` on every PR
- Integration tests build and run tower e2e tests (excluding porch e2e)

### Phase 3: Coverage Tracking
- Added `@vitest/coverage-v8` as devDependency
- Baseline: 62.31% lines, 56.42% branches
- Set thresholds at 60% lines / 50% branches (below baseline for stability)
- Coverage enforced in CI via `--coverage` flag

### Phase 4: Migrate BATS to Vitest
- Created 6 CLI test files (62 tests total): install, init, adopt, doctor, af, consult
- Shared `helpers.ts` module with XDG-sandboxed test environment isolation
- Dedicated `vitest.cli.config.ts` for CLI test suite (30s timeout, 15s hooks)
- Created `scripts/verify-install.mjs` for post-release verification
- Updated `e2e.yml` and `post-release-e2e.yml` CI workflows

### Phase 5: Automate Playwright in CI
- Enabled `webServer` in `playwright.config.ts` to auto-start tower on port 4100
- Added Dashboard Tests job to `test.yml` CI workflow
- No manual tower startup needed for Playwright tests

### Phase 6: Clean Up Stale Tests + Remove BATS
- Deleted entire `tests/` directory (156 files, ~20,000 lines)
- Removed vendored bats-core, bats-assert, bats-support, bats-file libraries
- Removed all .bats files, helpers, fixtures

## Deviations from Plan

1. **Coverage thresholds**: Plan assumed 70% lines would be conservative baseline, but actual baseline was 62.31% lines / 56.42% branches. Set thresholds at 60%/50% to avoid false failures.

2. **Playwright port**: Plan proposed port 14100 to avoid dev conflicts. Used port 4100 (default) instead because all existing Playwright tests hardcode `localhost:4100`. The `reuseExistingServer: true` option handles coexistence with a running dev tower.

3. **Spider references**: Plan said to remove "spider" references from tests. The one remaining reference in `protocol.test.ts` is legitimate — it tests the "spider" → "spir" alias resolution feature. Left as-is.

## Test Results

| Suite | Tests | Status |
|-------|-------|--------|
| Unit tests (vitest) | 601 | Pass |
| CLI integration (vitest.cli.config.ts) | 62 | Pass |
| Build | - | Pass |

## Metrics

- **Files added**: 9 (6 CLI tests, helpers, verify-install, vitest.cli.config, test.yml)
- **Files modified**: 5 (vitest.config.ts, vitest.e2e.config.ts, playwright.config.ts, e2e.yml, post-release-e2e.yml, package.json)
- **Files renamed**: 5 (tower/cli e2e tests)
- **Files deleted**: 156 (entire BATS framework + tests)
- **Net LOC change**: ~-19,200 (mostly vendored BATS libraries)

## Lessons Learned

1. **Monorepo porch compatibility**: `porch done` runs `npm run build` and `npm test` from the worktree root, but there's no root `package.json` in this monorepo. The fix was adding `"cwd": "packages/codev"` to the SPIR protocol checks — same pattern used by the bugfix protocol.

2. **XDG sandboxing for CLI tests**: Setting `XDG_CONFIG_HOME`, `XDG_DATA_HOME`, and `XDG_STATE_HOME` to temp directories isolates CLI tests from the user's real config. This prevents tests from picking up local settings or polluting the dev environment.

3. **Separate vitest configs are valuable**: The `*.e2e.test.ts` naming convention requires separate configs because the default vitest config explicitly excludes them. Having `vitest.cli.config.ts` with appropriate timeouts (30s vs 20min for porch e2e) keeps test runs fast.

4. **Coverage threshold calibration**: Always run the actual coverage tool to get a baseline before setting thresholds. Assumptions about coverage levels are often wrong.
