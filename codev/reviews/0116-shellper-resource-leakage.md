# Review: Shellper Resource Leakage Prevention (Spec 0116)

## Summary

This project addresses shellper resource leakage — Unix sockets and orphaned OS processes accumulating during long Tower sessions and E2E test suites, eventually exhausting the macOS PTY device pool (`kern.tty.ptmx_max = 511`).

## Implementation Overview

### Phase 1: Periodic Cleanup + Defensive Creation
- Added periodic `cleanupStaleSockets()` interval to Tower (configurable via `SHELLPER_CLEANUP_INTERVAL_MS`, default 60s, min 1s)
- Added defensive `child.kill('SIGKILL')` in `SessionManager.createSession()` first catch block
- Added `clearInterval` for cleanup timer during Tower graceful shutdown

### Phase 2: Test Socket Isolation + E2E Teardown
- Extracted shared test utilities into `tower-test-utils.ts` (was duplicated across 6 files)
- Added `SHELLPER_SOCKET_DIR` env var support for isolated test socket directories
- Added `cleanupAllTerminals()` — explicit terminal deletion in every E2E test's `afterAll`
- Added `cleanupTestDb()` for consistent SQLite cleanup
- Fixed tower server path resolution (was 3 levels up, needed 4)
- Net reduction: ~380 lines removed via shared utility extraction

### Phase 3: Unit + Integration Tests
- Unit test: PID liveness verification (custom hang script → `readShellperInfo` timeout → SIGKILL → `process.kill(pid, 0)` confirms death)
- Unit test: `cleanupStaleSockets()` idempotency (second call returns 0)
- E2E test: Tower periodic cleanup timer removes stale sockets during runtime (2s interval, externally killed shellper)
- E2E test: Full lifecycle creates no orphan sockets (create → delete via API → verify)
- E2E test: Tower graceful shutdown completes without hanging (validates `clearInterval`)
- Fixed macOS `sun_path` 104-byte limit issue by using `/tmp/` instead of `os.tmpdir()` for test socket dirs

## Metrics

- **14 files changed**: 1064 insertions, 585 deletions (+479 net)
- **1442 unit tests pass** (2 new tests added)
- **62 E2E tests pass** (3 new tests added, all pass individually; 3 pre-existing port-collision failures when run in same process)
- TypeScript compiles cleanly

## Key Decisions

1. **Refactored shared utilities rather than duplicating changes**: User explicitly requested this. Reduced 6 copies of `startTower`/`stopServer`/port helpers to 1.

2. **`/tmp/` instead of `os.tmpdir()`**: macOS `os.tmpdir()` returns `/var/folders/...` paths that are ~80 chars long. With shellper socket filenames (`shellper-{uuid}.sock`), total path exceeds the `sun_path` limit of 104 bytes. Using `/tmp/` directly keeps paths short enough.

3. **`waitForShellperReady()` probe in E2E**: Tower's `server.listen()` callback initializes the shellper manager asynchronously after the port opens. Tests that need persistent (shellper-backed) terminals must wait for this initialization.

4. **`extraEnv` parameter on `startTower()`**: Rather than mutating `process.env`, tests pass additional env vars (like `SHELLPER_CLEANUP_INTERVAL_MS`) cleanly through the function signature.

## Lessons Learned

1. **Unix socket path length is a hard limit**: macOS's 104-byte `sun_path` limit silently causes `EINVAL` on `listen()`. This manifests as "shellper creation failed" with fallback to non-persistent mode. Always use short base paths for socket directories.

2. **Tower initialization is async after port bind**: `server.listen()` callback runs after the TCP socket binds, but the callback itself is `async` and may not complete before the first request arrives. Tests need readiness probes.

3. **Shellper requires `persistent: true` and `cwd` in API requests**: Without both, the terminal creation handler falls through to the non-shellper path. This is easy to miss when writing E2E tests.

4. **Port collisions in parallel E2E**: `bugfix-199` and `cli-tower-mode` both hardcode port 14500. When vitest runs them in the same process sequentially, the second suite may encounter the first's still-closing tower. This is a pre-existing issue not introduced by this spec.
