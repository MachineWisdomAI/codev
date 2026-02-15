# Plan: Shellper Resource Leakage Prevention

## Metadata
- **ID**: plan-2026-02-15-shellper-resource-leakage
- **Status**: draft
- **Specification**: codev/specs/0116-shellper-resource-leakage.md
- **Created**: 2026-02-15

## Executive Summary

Implement Approach 1 from the spec: Periodic Cleanup + Test Hygiene + Socket Isolation. This addresses all 6 identified leak vectors through four targeted changes: (1) periodic `cleanupStaleSockets()` in Tower runtime, (2) defensive child process cleanup on creation failure, (3) isolated socket directories for tests, and (4) proper E2E test teardown.

## Success Metrics
- [ ] Periodic cleanup removes stale sockets within one interval cycle
- [ ] Full E2E test suite leaves zero orphaned shellper processes or sockets
- [ ] `cleanupStaleSockets()` runs periodically during Tower lifetime, not just at startup
- [ ] Test Tower instances use isolated socket directories (not `~/.codev/run/`)
- [ ] E2E test `afterAll` kills shellper sessions via Tower API before stopping
- [ ] Failed `createSession()` never leaves an orphaned shellper process
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
- Add proper shellper session cleanup to E2E test teardown
- Ensure zero orphaned sockets/processes after test runs

#### Deliverables
- [ ] Test Tower instances use temp socket directories
- [ ] E2E test `afterAll` kills terminals via Tower API before stopping
- [ ] `tower-test-utils.ts` cleanup includes socket directory

#### Implementation Details

**1. Test socket isolation**

The Tower server gets its socket directory from `tower-server.ts:252`:
```typescript
const socketDir = path.join(homedir(), '.codev', 'run');
```

To isolate tests, introduce an environment variable `SHELLPER_SOCKET_DIR` that overrides this:
```typescript
const socketDir = process.env.SHELLPER_SOCKET_DIR || path.join(homedir(), '.codev', 'run');
```

Then in `tower-test-utils.ts`, `startTower()` sets this env var to a temp directory:
```typescript
// In startTower() — add SHELLPER_SOCKET_DIR to env
const socketDir = mkdtempSync(resolve(tmpdir(), 'codev-test-sockets-'));
const proc = spawn('node', [TOWER_SERVER_PATH, String(port)], {
  env: { ...process.env, NODE_ENV: 'test', AF_TEST_DB: `test-${port}.db`, SHELLPER_SOCKET_DIR: socketDir },
});
```

Return the `socketDir` path so `cleanupTestWorkspace` can remove it. This means `startTower` returns `{ proc, socketDir }` instead of just `proc`, or we track it in a module-level variable.

**2. E2E test teardown**

In E2E test files that create terminals (`tower-terminals.e2e.test.ts`), add proper cleanup in `afterAll` before stopping the Tower:

```typescript
afterAll(async () => {
  // Kill all terminals via Tower API before stopping
  const listRes = await fetch(`http://localhost:${TEST_TOWER_PORT}/api/terminals`);
  if (listRes.ok) {
    const { terminals } = await listRes.json();
    for (const t of terminals) {
      await fetch(`http://localhost:${TEST_TOWER_PORT}/api/terminals/${t.id}`, { method: 'DELETE' });
    }
  }
  await stopServer(towerProcess);
  // Clean up socket directory, DB files, etc.
});
```

For E2E tests in the `__tests__/` directory that use `tower-test-utils.ts`, the `startTower` function should return the socket dir, and `cleanupTestWorkspace` should accept it for cleanup.

**3. Update `cleanupTestWorkspace()`**

Add optional `socketDir` parameter:
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
- `packages/codev/src/agent-farm/__tests__/helpers/tower-test-utils.ts` — Create temp socket dirs, clean them up
- `packages/codev/src/agent-farm/__tests__/tower-terminals.e2e.test.ts` — Add terminal cleanup in `afterAll`
- Other E2E test files that spawn Tower (apply same pattern)

#### Acceptance Criteria
- [ ] Test Tower instances use temp dirs for sockets, not `~/.codev/run/`
- [ ] `afterAll` in E2E tests kills terminals before stopping Tower
- [ ] Zero shellper socket files remain after test suite completes
- [ ] Dev's running shellper sessions are never affected by test runs
- [ ] All existing E2E tests still pass

#### Risks
- **Risk**: E2E tests that rely on shared socket state between test files
  - **Mitigation**: Each test file already runs its own Tower instance on a unique port. Socket isolation follows the same per-test-file pattern.

---

### Phase 3: Unit + Integration Tests
**Dependencies**: Phase 1, Phase 2

#### Objectives
- Add unit tests for the defensive creation fix
- Add integration tests for periodic cleanup behavior
- Verify no orphaned processes after creation failure

#### Deliverables
- [ ] Unit test: `createSession()` failure kills child process
- [ ] Unit test: periodic cleanup removes stale sockets
- [ ] Integration test: full lifecycle creates no orphans

#### Implementation Details

**1. Defensive creation test (`session-manager.test.ts`)**

Add test to the existing `createSession` describe block:

```typescript
it('kills child process when readShellperInfo fails', async () => {
  // Spawn a real child process that does NOT write shellper info to stdout
  // (simulating a shellper that hangs or crashes before emitting PID)
  // The test verifies the child PID is dead after createSession() rejects.
  const manager = new SessionManager({
    socketDir,
    shellperScript: '/nonexistent/script.js', // Will cause child to fail
    nodeExecutable: process.execPath,
  });

  await expect(manager.createSession({
    sessionId: 'fail-test',
    command: '/bin/echo',
    args: [],
    cwd: '/tmp',
    env: {},
    cols: 80,
    rows: 24,
  })).rejects.toThrow();

  // Verify no orphaned socket file
  expect(fs.existsSync(path.join(socketDir, 'shellper-fail-test.sock'))).toBe(false);
});
```

**2. Periodic cleanup integration test**

Test that `cleanupStaleSockets()` can be called repeatedly and correctly identifies stale vs live sockets. This extends the existing `cleanupStaleSockets` test block in `session-manager.test.ts`.

**3. Socket isolation test**

Verify that `SessionManager` instances with different `socketDir` paths don't interfere with each other.

#### Files to modify
- `packages/codev/src/terminal/__tests__/session-manager.test.ts` — Add defensive creation tests
- `packages/codev/src/agent-farm/__tests__/tower-terminals.e2e.test.ts` — Verify zero orphans in existing tests

#### Acceptance Criteria
- [ ] Test coverage >90% on new/modified code
- [ ] Defensive creation test verifies child process is killed
- [ ] All existing tests pass
- [ ] `npm test` passes cleanly

#### Test Plan
- **Unit Tests**: Defensive creation kill, periodic cleanup repeated calls
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
| Test socket isolation breaks E2E tests | Medium | Medium | Each test file already runs isolated Tower; incremental migration |
| `child.kill()` throws on already-dead process | Low | Low | Wrapped in try/catch |
| Env var `SHELLPER_SOCKET_DIR` leaks to production | Low | Medium | Only read in `tower-server.ts` startup; production never sets it |

## Validation Checkpoints
1. **After Phase 1**: Run existing unit tests. Verify cleanup interval starts and is cleared.
2. **After Phase 2**: Run E2E tests. Verify no orphaned sockets in `~/.codev/run/` after tests.
3. **After Phase 3**: Run full test suite. Verify >90% coverage on new code.

## Notes

Key insight: The `child` handle from `cpSpawn()` is already in scope at the first catch block (line 174), but was never used for cleanup. The second catch block (line 197) correctly kills via `process.kill(info.pid)` because `info` is available. The gap is specifically when `readShellperInfo()` fails — no PID is available, but the `child` handle works.

The `SHELLPER_SOCKET_DIR` env var approach is simpler than making `SessionManager` accept the socket dir as a runtime override, because the socket dir is already a constructor parameter — the issue is that Tower hardcodes it. The env var lets tests override without changing the constructor interface.

---

## Amendment History

This section tracks all TICK amendments to this plan.

<!-- When adding a TICK amendment, add a new entry below this line in chronological order -->
