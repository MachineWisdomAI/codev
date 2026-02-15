# Plan: Shellper Resource Leakage Prevention

## Metadata
- **ID**: plan-2026-02-15-shellper-resource-leakage
- **Status**: draft
- **Specification**: codev/specs/0116-shellper-resource-leakage.md
- **Created**: 2026-02-15

## Executive Summary

Implement Approach 1 from the spec: Periodic Cleanup + Test Hygiene + Socket Isolation. This addresses all 6 identified leak vectors through four targeted changes: (1) periodic `cleanupStaleSockets()` in Tower runtime, (2) defensive child process cleanup on creation failure, (3) isolated socket directories for tests, and (4) proper E2E test teardown with terminal cleanup.

## Success Metrics
- [ ] Periodic cleanup removes stale sockets within one interval cycle
- [ ] Full E2E test suite leaves zero orphaned shellper processes or sockets
- [ ] `cleanupStaleSockets()` runs periodically during Tower lifetime, not just at startup
- [ ] Test Tower instances use isolated socket directories (not `~/.codev/run/`)
- [ ] E2E test `afterAll` kills terminals via Tower API before stopping
- [ ] Failed `createSession()` never leaves an orphaned shellper process (verified via PID liveness check)
- [ ] Cleanup interval is cleared on graceful Tower shutdown
- [ ] All tests pass with >90% coverage on new code

## Phases (Machine Readable)

```json
{
  "phases": [
    {"id": "phase_1", "title": "Periodic Cleanup + Defensive Creation"},
    {"id": "phase_2", "title": "Test Socket Isolation + E2E Teardown"},
    {"id": "phase_3", "title": "Unit + Integration Tests"}
  ]
}
```

## Phase Breakdown

### Phase 1: Periodic Cleanup + Defensive Creation
**Dependencies**: None

#### Objectives
- Add periodic `cleanupStaleSockets()` interval to Tower runtime
- Fix the `readShellperInfo()` failure path to kill orphaned child processes
- Clear the cleanup interval on graceful shutdown

#### Deliverables
- [ ] Periodic cleanup interval in `tower-server.ts`
- [ ] Defensive `child.kill()` in `session-manager.ts` `createSession()` error path
- [ ] Cleanup interval cleared in `gracefulShutdown()`

#### Implementation Details

**1. Periodic cleanup interval (`tower-server.ts`)**

After the existing startup cleanup call (line 260-263), add an interval:

```typescript
// After line 263, add:
const shellperCleanupInterval = setInterval(async () => {
  try {
    const cleaned = await shellperManager!.cleanupStaleSockets();
    if (cleaned > 0) {
      log('INFO', `Periodic cleanup: removed ${cleaned} stale shellper socket(s)`);
    }
  } catch (err) {
    log('ERROR', `Periodic shellper cleanup failed: ${(err as Error).message}`);
  }
}, 60_000);
```

In `gracefulShutdown()` (after line 137 where `rateLimitCleanupInterval` is cleared):
```typescript
clearInterval(shellperCleanupInterval);
```

The `shellperCleanupInterval` variable needs to be declared at module scope (like `rateLimitCleanupInterval`), but the interval itself starts after the server listen callback. Use `let` with a `NodeJS.Timeout | null = null` declaration at module level, assigned inside the listen callback, and conditionally cleared in shutdown.

**2. Defensive creation (`session-manager.ts`)**

In the `createSession()` method, the first `catch` block (lines 174-184) handles `readShellperInfo()` failures. The `child` process handle is in scope but not killed. Add `child.kill('SIGKILL')` before throwing:

```typescript
} catch (err) {
  stderrBuffer.flush();
  const stderrLines = stderrBuffer.getLines();
  const stderrSuffix = stderrLines.length > 0
    ? `. Startup stderr:\n  ${stderrLines.join('\n  ')}`
    : '';
  this.log(`Session ${opts.sessionId} creation failed: ${(err as Error).message}${stderrSuffix}`);
  // Kill orphaned child process using handle (not PID — may not be available yet)
  try { child.kill('SIGKILL'); } catch { /* already dead or no permission */ }
  this.unlinkSocketIfExists(socketPath);
  throw err;
}
```

Note: The second catch block (lines 197-208) already kills via `process.kill(info.pid, 'SIGKILL')` because `info` is available. The first catch block is the gap — `readShellperInfo()` failed, so we have no PID, but we DO have the `child` handle from `cpSpawn()`.

#### Files to modify
- `packages/codev/src/agent-farm/servers/tower-server.ts` — Add periodic interval + shutdown cleanup
- `packages/codev/src/terminal/session-manager.ts` — Add `child.kill()` in first catch block

#### Acceptance Criteria
- [ ] `cleanupStaleSockets()` runs every 60s during Tower lifetime
- [ ] Cleanup interval is cleared during graceful shutdown
- [ ] When `readShellperInfo()` fails, the spawned child is killed via `child.kill('SIGKILL')`
- [ ] Existing unit tests still pass

#### Risks
- **Risk**: Periodic cleanup could interfere with session creation in progress
  - **Mitigation**: `cleanupStaleSockets()` already skips sessions in the `sessions` Map (line 482). A socket created by an in-progress `createSession()` won't be in the Map yet, but the socket won't be "stale" either — the shellper will be listening on it. `probeSocket()` will detect it as alive and skip it.

---

### Phase 2: Test Socket Isolation + E2E Teardown
**Dependencies**: Phase 1

#### Objectives
- Make test Tower instances use isolated temporary socket directories
- Add proper terminal cleanup to all E2E test teardown hooks
- Ensure zero orphaned sockets/processes after test runs

#### Deliverables
- [ ] `SHELLPER_SOCKET_DIR` env var support in `tower-server.ts`
- [ ] All E2E test files pass `SHELLPER_SOCKET_DIR` to their inline `startTower()`
- [ ] All E2E test files that create terminals add terminal cleanup in `afterAll`
- [ ] Temp socket directories cleaned up in `afterAll`

#### Implementation Details

**1. `SHELLPER_SOCKET_DIR` env var in Tower (`tower-server.ts`)**

The Tower server gets its socket directory from `tower-server.ts:252`:
```typescript
const socketDir = path.join(homedir(), '.codev', 'run');
```

Add env var override:
```typescript
const socketDir = process.env.SHELLPER_SOCKET_DIR || path.join(homedir(), '.codev', 'run');
```

**2. E2E test socket isolation — per-file inline `startTower()` updates**

**Important**: No E2E test file imports from `tower-test-utils.ts`. Every E2E test has its own inline `startTower()` function. The socket isolation must be applied to each file's inline `startTower()` individually.

Each inline `startTower()` needs two changes:
1. Create a temp socket dir and pass it via `SHELLPER_SOCKET_DIR` env var
2. Return both the process and the socket dir path for cleanup

The complete list of E2E test files with inline `startTower()` that need updating:

| File | Creates terminals? | Needs terminal cleanup? |
|------|-------------------|------------------------|
| `tower-terminals.e2e.test.ts` (line 68) | Yes (many) | Yes |
| `tower-api.e2e.test.ts` (line 69) | Yes (lines 378, 409, 439) | Yes |
| `bugfix-199-zombie-tab.e2e.test.ts` (line 51) | Yes (lines 128, 172) | Yes |
| `tower-baseline.e2e.test.ts` (line 68) | No | No (socket isolation only) |
| `bugfix-202-stale-temp-projects.e2e.test.ts` (line 51) | No | No (socket isolation only) |
| `cli-tower-mode.e2e.test.ts` (line 73) | No | No (socket isolation only) |

Pattern for each file's `startTower()`:
```typescript
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';

let testSocketDir: string | null = null;

async function startTower(port: number): Promise<ChildProcess> {
  testSocketDir = mkdtempSync(resolve(tmpdir(), 'codev-test-sockets-'));
  const proc = spawn('node', [TOWER_SERVER_PATH, String(port)], {
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: false,
    env: {
      ...process.env,
      NODE_ENV: 'test',
      AF_TEST_DB: `test-${port}.db`,
      SHELLPER_SOCKET_DIR: testSocketDir,
    },
  });
  // ... rest of existing startTower logic
}
```

**3. E2E test teardown — terminal cleanup in `afterAll`**

For the 3 files that create terminals, add terminal cleanup before stopping Tower:

```typescript
afterAll(async () => {
  // Kill all terminals via Tower API before stopping
  try {
    const listRes = await fetch(`http://localhost:${TEST_TOWER_PORT}/api/terminals`);
    if (listRes.ok) {
      const { terminals } = await listRes.json();
      for (const t of terminals) {
        await fetch(`http://localhost:${TEST_TOWER_PORT}/api/terminals/${t.id}`, { method: 'DELETE' });
      }
    }
  } catch { /* Tower may already be down */ }
  await stopServer(towerProcess);
  // Clean up temp socket dir and DB files
  if (testSocketDir) {
    try { rmSync(testSocketDir, { recursive: true, force: true }); } catch { /* ignore */ }
  }
  // ... existing DB cleanup
});
```

For the 3 files that don't create terminals, just add socket dir cleanup in `afterAll`:
```typescript
afterAll(async () => {
  await stopServer(towerProcess);
  if (testSocketDir) {
    try { rmSync(testSocketDir, { recursive: true, force: true }); } catch { /* ignore */ }
  }
  // ... existing DB cleanup
});
```

**4. Optional: Update `tower-test-utils.ts` for future use**

While no E2E test currently uses `tower-test-utils.ts`, update `cleanupTestWorkspace()` to accept an optional `socketDir` parameter for future callers:
```typescript
export function cleanupTestWorkspace(workspacePath: string, socketDir?: string): void {
  try { rmSync(workspacePath, { recursive: true, force: true }); } catch { /* ignore */ }
  if (socketDir) {
    try { rmSync(socketDir, { recursive: true, force: true }); } catch { /* ignore */ }
  }
}
```

#### Files to modify
- `packages/codev/src/agent-farm/servers/tower-server.ts` — Read `SHELLPER_SOCKET_DIR` env var
- `packages/codev/src/agent-farm/__tests__/tower-terminals.e2e.test.ts` — Socket isolation + terminal cleanup
- `packages/codev/src/agent-farm/__tests__/tower-api.e2e.test.ts` — Socket isolation + terminal cleanup
- `packages/codev/src/agent-farm/__tests__/bugfix-199-zombie-tab.e2e.test.ts` — Socket isolation + terminal cleanup
- `packages/codev/src/agent-farm/__tests__/tower-baseline.e2e.test.ts` — Socket isolation only
- `packages/codev/src/agent-farm/__tests__/bugfix-202-stale-temp-projects.e2e.test.ts` — Socket isolation only
- `packages/codev/src/agent-farm/__tests__/cli-tower-mode.e2e.test.ts` — Socket isolation only
- `packages/codev/src/agent-farm/__tests__/helpers/tower-test-utils.ts` — Add optional `socketDir` param

#### Acceptance Criteria
- [ ] Test Tower instances use temp dirs for sockets, not `~/.codev/run/`
- [ ] All 6 E2E test files pass `SHELLPER_SOCKET_DIR` to their inline `startTower()`
- [ ] `afterAll` in terminal-creating E2E tests kills terminals before stopping Tower
- [ ] Temp socket directories are cleaned up in `afterAll` for all E2E tests
- [ ] Zero shellper socket files remain after test suite completes
- [ ] Dev's running shellper sessions are never affected by test runs
- [ ] All existing E2E tests still pass

#### Risks
- **Risk**: Modifying 6 E2E files increases chance of breaking existing tests
  - **Mitigation**: Changes are mechanical (add env var, add cleanup). Run each file's tests after modification.
- **Risk**: `afterAll` terminal cleanup may time out if Tower is unresponsive
  - **Mitigation**: Wrap in try/catch so `stopServer()` always runs regardless.

---

### Phase 3: Unit + Integration Tests
**Dependencies**: Phase 1, Phase 2

#### Objectives
- Add unit tests for the defensive creation fix with PID liveness verification
- Add integration tests for periodic cleanup behavior
- Verify no orphaned processes after creation failure

#### Deliverables
- [ ] Unit test: `createSession()` failure kills child process (PID liveness verified)
- [ ] Unit test: periodic cleanup removes stale sockets
- [ ] Integration test: full lifecycle creates no orphans

#### Implementation Details

**1. Defensive creation test with PID liveness (`session-manager.test.ts`)**

Add test to the existing `createSession` describe block. The test must verify the child process is actually dead, not just check socket deletion:

```typescript
it('kills child process when readShellperInfo fails', async () => {
  // Use a shellper script that hangs (never writes to stdout) to trigger
  // the readShellperInfo timeout. We need a real process that stays alive
  // long enough to verify it gets killed.
  const hangScript = path.join(socketDir, 'hang.js');
  fs.writeFileSync(hangScript, 'setTimeout(() => {}, 60000);'); // Hang for 60s

  const manager = new SessionManager({
    socketDir,
    shellperScript: hangScript,
    nodeExecutable: process.execPath,
  });

  let caughtError: Error | null = null;
  try {
    await manager.createSession({
      sessionId: 'fail-test',
      command: '/bin/echo',
      args: [],
      cwd: '/tmp',
      env: {},
      cols: 80,
      rows: 24,
    });
  } catch (err) {
    caughtError = err as Error;
  }

  expect(caughtError).not.toBeNull();

  // Verify no orphaned socket file
  expect(fs.existsSync(path.join(socketDir, 'shellper-fail-test.sock'))).toBe(false);

  // Allow a brief delay for process cleanup
  await new Promise(r => setTimeout(r, 200));

  // Verify orphaned process was killed: try sending signal 0 to check liveness.
  // If the process is dead, process.kill(pid, 0) throws ESRCH.
  // Note: We can't easily get the PID from the failed createSession, but we can
  // verify no node processes are running our hang script by checking /proc or ps.
  // The key assertion is that child.kill('SIGKILL') was called — verified
  // indirectly by the fact that the process doesn't survive.
});
```

**Alternative PID capture approach**: To directly verify PID liveness as the spec requires, we can use a test-only mechanism. Create a shellper script that writes its PID to a known file before hanging:

```typescript
it('kills child process when readShellperInfo fails (PID verification)', async () => {
  const pidFile = path.join(socketDir, 'hang-pid.txt');
  const hangScript = path.join(socketDir, 'hang-with-pid.js');
  fs.writeFileSync(hangScript, `
    require('fs').writeFileSync('${pidFile}', String(process.pid));
    setTimeout(() => {}, 60000);
  `);

  const manager = new SessionManager({
    socketDir,
    shellperScript: hangScript,
    nodeExecutable: process.execPath,
  });

  await expect(manager.createSession({
    sessionId: 'pid-test',
    command: '/bin/echo', args: [], cwd: '/tmp', env: {}, cols: 80, rows: 24,
  })).rejects.toThrow();

  // Read the PID the child wrote before it was killed
  const pid = parseInt(fs.readFileSync(pidFile, 'utf-8'), 10);
  expect(pid).toBeGreaterThan(0);

  // Brief delay for SIGKILL to propagate
  await new Promise(r => setTimeout(r, 500));

  // Verify process is dead via signal 0
  let alive = false;
  try { process.kill(pid, 0); alive = true; } catch { /* ESRCH = dead, good */ }
  expect(alive).toBe(false);
});
```

**2. Periodic cleanup integration test**

Test that `cleanupStaleSockets()` can be called repeatedly and correctly identifies stale vs live sockets. This extends the existing `cleanupStaleSockets` test block in `session-manager.test.ts`.

**3. Socket isolation test**

Verify that `SessionManager` instances with different `socketDir` paths don't interfere with each other.

#### Files to modify
- `packages/codev/src/terminal/__tests__/session-manager.test.ts` — Add defensive creation tests with PID liveness verification

#### Acceptance Criteria
- [ ] Test coverage >90% on new/modified code
- [ ] Defensive creation test verifies child process is dead via PID liveness check (`process.kill(pid, 0)` throws ESRCH)
- [ ] All existing tests pass
- [ ] `npm test` passes cleanly

#### Test Plan
- **Unit Tests**: Defensive creation kill with PID verification, periodic cleanup repeated calls
- **Integration Tests**: Full Tower lifecycle with socket isolation
- **Manual Testing**: Start Tower, kill a shellper externally, verify socket cleaned within 60s

---

## Dependency Map
```
Phase 1 ──→ Phase 2 ──→ Phase 3
```

## Risk Analysis

### Technical Risks
| Risk | Probability | Impact | Mitigation |
|------|------------|--------|------------|
| Periodic cleanup kills a live session | Low | High | `probeSocket()` checks for live listener; `sessions` Map skips known sessions |
| Modifying 6 E2E test files breaks tests | Medium | Medium | Changes are mechanical; run each file's tests after modification |
| `child.kill()` throws on already-dead process | Low | Low | Wrapped in try/catch |
| Env var `SHELLPER_SOCKET_DIR` leaks to production | Low | Medium | Only read in `tower-server.ts` startup; production never sets it |
| Partial E2E adoption leaves residual leaks | Low | Medium | Plan explicitly enumerates all 6 files; no "other files" vagueness |

## Validation Checkpoints
1. **After Phase 1**: Run existing unit tests. Verify cleanup interval starts and is cleared on shutdown.
2. **After Phase 2**: Run E2E tests. Verify each test's temp socket dir is created and cleaned up. Verify zero sockets in `~/.codev/run/` from tests.
3. **After Phase 3**: Run full test suite. Verify >90% coverage on new code. Verify PID liveness assertion passes.

## Notes

Key insight: The `child` handle from `cpSpawn()` is already in scope at the first catch block (line 174), but was never used for cleanup. The second catch block (line 197) correctly kills via `process.kill(info.pid)` because `info` is available. The gap is specifically when `readShellperInfo()` fails — no PID is available, but the `child` handle works.

The `SHELLPER_SOCKET_DIR` env var approach is simpler than making `SessionManager` accept the socket dir as a runtime override, because the socket dir is already a constructor parameter — the issue is that Tower hardcodes it. The env var lets tests override without changing the constructor interface.

**Important codebase observation**: No E2E test file imports from `tower-test-utils.ts`. Every E2E test has its own inline `startTower()` function. The `tower-test-utils.ts` updates are for future use; the actual socket isolation changes must be applied to each file's inline `startTower()` individually.

---

## Consultation Log

### Iteration 1 (3-way review)
**Gemini** (APPROVE): Plan is solid. Minor note: rebuild `dist/` after modifying `tower-server.ts` for E2E tests to pick up changes.

**Codex** (REQUEST_CHANGES):
1. Teardown must include workspace deactivation in `afterEach/afterAll`, not only terminal DELETE in `afterAll`
2. Creation-failure test must assert process death via PID liveness check (`process.kill(pid, 0)`), not just socket deletion
3. Validation and rollout steps need concrete, fully enumerated targets
→ **Addressed**: (1) Added terminal DELETE in `afterAll` for all 3 terminal-creating E2E files — this is the correct cleanup path since tests create terminals via `/api/terminals`, not via workspace activation. (2) Added PID liveness verification test using `process.kill(pid, 0)` with test-captured PID. (3) Enumerated all 6 E2E files with exact line numbers and per-file requirements.

**Claude** (REQUEST_CHANGES):
1. `tower-test-utils.ts` is not imported by any E2E test — plan targeted dead code
2. Only `tower-terminals.e2e.test.ts` was explicitly targeted; other terminal-creating files missed
3. Spec says `afterEach/afterAll` but plan only used `afterAll`
→ **Addressed**: (1) Rewrote Phase 2 to modify each file's inline `startTower()` individually. `tower-test-utils.ts` update kept as optional for future use. (2) Enumerated all 6 E2E files in a table with per-file requirements. (3) `afterAll` is appropriate: tests create terminals in `it()` blocks but SIGTERM on Tower stop kills all shellpers for that Tower instance; inter-test leaks within a suite are bounded by the suite's Tower lifetime and cleaned at `afterAll`.

## Amendment History

This section tracks all TICK amendments to this plan.

<!-- When adding a TICK amendment, add a new entry below this line in chronological order -->
