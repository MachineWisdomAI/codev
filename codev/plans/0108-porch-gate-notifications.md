# Implementation Plan: Porch Gate Notifications via `af send`

## Overview

Replace the polling-based gate watcher with direct `af send` calls from porch when gates are set to pending. This is a two-phase change: (1) add a `notifyArchitect()` function to porch and call it from all three gate-pending paths in `next.ts`, then (2) remove the now-dead gate watcher infrastructure.

## Phases (Machine Readable)

```json
{
  "phases": [
    {"id": "phase_1", "title": "Add notifyArchitect to porch next.ts"},
    {"id": "phase_2", "title": "Remove gate watcher infrastructure"}
  ]
}
```

## Phase Breakdown

### Phase 1: Add `notifyArchitect()` to porch `next.ts`
**Dependencies**: None

#### Objectives
- Create a `notifyArchitect()` function that calls `af send architect` via `execFile`
- Call it from all three gate-pending paths in `next.ts`
- Write unit tests verifying notification is sent and failures are swallowed

#### Deliverables
- [ ] `notifyArchitect()` helper function in `next.ts` (or a new `notify.ts` if cleaner)
- [ ] Calls inserted at all three gate-pending paths
- [ ] Unit tests for the notification function

#### Implementation Details

**New function** — add to `next.ts` (bottom of file, private helper):

```typescript
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';

function resolveAfBinary(): string {
  // Same approach as gate-watcher.ts — resolve relative to this file
  const thisDir = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(thisDir, '../../../bin/af.js');
}

function notifyArchitect(projectId: string, gateName: string, worktreeDir: string): void {
  const message = [
    `GATE: ${gateName} (Builder ${projectId})`,
    `Builder ${projectId} is waiting for approval.`,
    `Run: porch approve ${projectId} ${gateName}`,
  ].join('\n');

  const afBinary = resolveAfBinary();

  execFile(
    process.execPath,
    [afBinary, 'send', 'architect', message, '--raw', '--no-enter'],
    { cwd: worktreeDir, timeout: 10_000 },
    (error) => {
      if (error) {
        console.error(`[porch] Gate notification failed: ${error.message}`);
      }
    }
  );
}
```

**Three call sites in `next.ts`**:

1. **Line ~284 (general gate-pending re-request)**: After the `if (gateStatus?.status === 'pending' && gateStatus?.requested_at)` check, call `notifyArchitect(state.id, gateName, projectRoot)` before returning.

2. **Line ~496 (max-iterations gate)**: After `state.gates[gateName] = { status: 'pending', ... }` and `writeState()`, call `notifyArchitect(state.id, gateName, projectRoot)`.

3. **Line ~624 (post-consultation gate)**: After `state.gates[gateName] = { status: 'pending', ... }` and `writeState()`, call `notifyArchitect(state.id, gateName, projectRoot)`.

**Key design decisions**:
- Fire-and-forget: `execFile` callback logs errors but never throws
- Message format matches existing gate watcher format for consistency
- `projectRoot` is passed as `cwd` — this is the worktree directory, so `af send` resolves correctly
- No deduplication needed: porch only sets gate to pending once per gate transition; the "re-request" path (line ~284) may re-notify on subsequent `porch next` calls but that's acceptable — the builder is calling `porch next` because it was told to wait, so re-notifying the architect is harmless

#### Files to modify
- `packages/codev/src/commands/porch/next.ts` — add `notifyArchitect()` + 3 call sites + imports

#### Files to create
- `packages/codev/src/commands/porch/__tests__/notify.test.ts` — unit tests

#### Test Plan
- **Unit Tests**:
  - Mock `execFile`, verify `notifyArchitect()` calls it with correct args (process.execPath, af binary path, send, architect, message, --raw, --no-enter)
  - Verify correct message format: `GATE: {gateName} (Builder {projectId})`
  - Verify `cwd` is set to worktreeDir
  - Verify timeout is 10_000
  - Verify `execFile` failure is logged to stderr but doesn't throw
  - Verify all three gate-pending paths in `next()` trigger `notifyArchitect` (integration-style tests using existing next.test.ts patterns)

#### Acceptance Criteria
- [ ] `notifyArchitect()` is called at all three gate-pending paths
- [ ] If `af send` fails, porch continues normally
- [ ] Message format: `GATE: {gateName} (Builder {projectId})`
- [ ] All tests pass

---

### Phase 2: Remove Gate Watcher Infrastructure
**Dependencies**: Phase 1

#### Objectives
- Remove the polling-based gate watcher code that is now dead
- Clean up all references from tower server and terminals

#### Deliverables
- [ ] Gate watcher files deleted
- [ ] Tower integration code cleaned up
- [ ] Existing gate watcher tests deleted
- [ ] Build and remaining tests pass

#### Implementation Details

**Files to delete**:
- `packages/codev/src/agent-farm/utils/gate-watcher.ts`
- `packages/codev/src/agent-farm/utils/gate-status.ts`
- `packages/codev/src/agent-farm/__tests__/gate-watcher.test.ts`

**Files to modify**:

1. **`packages/codev/src/agent-farm/servers/tower-terminals.ts`**:
   - Remove `import { GateWatcher } from '../utils/gate-watcher.js'`
   - Remove `import { getGateStatusForProject } from '../utils/gate-status.js'`
   - Remove `gateWatcher` module-level instance (line ~40-43)
   - Remove `gateWatcherInterval` variable (line ~44)
   - Remove `startGateWatcher()` export (lines ~492-506)
   - Remove `stopGateWatcher()` export (lines ~509-514)
   - Remove gate watcher cleanup from `shutdownTerminals()` (lines ~72-75)

2. **`packages/codev/src/agent-farm/servers/tower-server.ts`**:
   - Remove `import { startGateWatcher } from './tower-terminals.js'` (or remove from import list)
   - Remove `startGateWatcher()` call (line ~292)
   - Remove `log('INFO', 'Gate watcher started (10s poll interval)')` (line ~293)

3. **`packages/codev/src/agent-farm/servers/tower-types.ts`**:
   - Remove `import type { GateWatcher } from '../utils/gate-watcher.js'` (line ~11)
   - Remove `gateWatcher: GateWatcher` from interface (line ~28)

4. **`packages/codev/src/agent-farm/__tests__/tower-terminals.test.ts`**:
   - Remove `startGateWatcher` and `stopGateWatcher` imports
   - Remove `describe('startGateWatcher / stopGateWatcher', ...)` test block

#### Test Plan
- **Build verification**: `npm run build` passes with no errors
- **Unit tests**: `npm test` passes — deleted test files won't run, and tower-terminals tests still pass after removing gate watcher section

#### Acceptance Criteria
- [ ] `gate-watcher.ts` and `gate-status.ts` deleted
- [ ] No remaining imports or references to gate watcher in the codebase
- [ ] Build passes
- [ ] All remaining tests pass

## Risk Assessment

- **Low risk — `af send` binary resolution**: The `resolveAfBinary()` approach is proven in `gate-watcher.ts`. We're copying the same pattern.
- **Low risk — fire-and-forget semantics**: `execFile` with callback is well-understood. Errors are logged but cannot crash porch.
- **Low risk — gate watcher removal**: The watcher is isolated. Its only consumers are tower-terminals and tower-server. Removing them is straightforward dead code deletion.

## Validation Checkpoints
1. **After Phase 1**: Run `npm test` — all porch tests pass, new notify tests pass, gate watcher tests still pass (not yet removed)
2. **After Phase 2**: Run `npm run build && npm test` — clean build, all remaining tests pass, `grep -r gate-watcher` finds nothing in src/
