# Review: Spec 0105 — Tower Server Decomposition

**Branch**: `builder/0105-tower-server-decomposition`
**Protocol**: SPIR (strict mode)

## Summary

Decomposed `tower-server.ts` (3,418→308 lines) and `spawn.ts` (1,405→570 lines) into focused modules across 7 phases. Pure refactoring with zero behavior change, verified by 3-way consultations at each phase. 28 files changed, +7,752 / -4,300 lines.

## Results

### Tower Server (Phases 1–6)

| Module | Lines | Responsibility |
|--------|-------|---------------|
| `tower-types.ts` | 87 | Shared interfaces (TowerContext, ProjectTerminals, SSEClient) |
| `tower-utils.ts` | 184 | Rate limiting, path normalization, MIME types, static file serving |
| `tower-tunnel.ts` | 337 | Cloud tunnel lifecycle, config watching, metadata refresh |
| `tower-instances.ts` | 538 | Project instance lifecycle (activate/deactivate/discover) |
| `tower-terminals.ts` | 715 | Terminal state, tmux management, reconciliation, file tabs |
| `tower-websocket.ts` | 194 | WebSocket terminal handler + upgrade routing |
| `tower-routes.ts` | 1,701 | HTTP route dispatch + 30 named handler functions |
| `tower-server.ts` | 308 | Orchestrator: CLI, server creation, lifecycle |

### Spawn Command (Phase 7)

| Module | Lines | Responsibility |
|--------|-------|---------------|
| `spawn-roles.ts` | 343 | Template rendering, prompt building, protocol/mode resolution |
| `spawn-worktree.ts` | 404 | Git worktree, GitHub integration, collision detection, sessions |
| `spawn.ts` | 570 | Orchestrator: mode-specific spawn handlers |

### Acceptance Criteria

| Criterion | Target | Actual | Status |
|-----------|--------|--------|--------|
| `tower-server.ts` | ≤ 400 lines | 308 lines | ✅ |
| `spawn.ts` | ≤ 600 lines | 570 lines | ✅ |
| No file in servers/ > 900 lines | ≤ 900 lines | `tower-routes.ts` = 1,701 | ⚠️ Deviation |
| Build passes | Yes | Yes | ✅ |
| All tests pass | Yes | 1,217 pass | ✅ |
| Each extracted module has test file | Yes | 8 new test files | ✅ |
| Zero behavior change | Yes | Verified by function-by-function comparison | ✅ |
| Security parity | Yes | CORS, rate limiting, isRequestAllowed preserved | ✅ |

### Deviation: tower-routes.ts (1,701 lines)

The HTTP request handler contained 30 inline route handlers that were tightly coupled. Converting them to named functions and adding a dispatch table added structure but not enough to split further without creating artificial module boundaries. The file has clear internal organization (dispatch table at top, handler functions grouped by concern). All 3 reviewers approved this in Phase 6, noting the spec's own exception clause: "If a module exceeds its target while preserving cohesion, document the reason."

## Phase Execution

| Phase | Iters | Key Outcome |
|-------|-------|-------------|
| Phase 1: tower-types + tower-utils | 2 | Extracted shared interfaces and utility functions |
| Phase 2: tower-tunnel | 2 | Extracted cloud tunnel lifecycle |
| Phase 3: tower-instances | 5 | Most iterations — exposed and fixed startup race condition |
| Phase 4: tower-terminals | 3 | Largest extraction (715 lines) — terminal state + tmux + reconciliation |
| Phase 5: tower-websocket | 1 | Cleanest extraction — approved on first consultation |
| Phase 6: tower-routes | 2 | Final tower extraction — server reached 308-line orchestrator |
| Phase 7: spawn decomposition | 4 | Extracted roles/worktree modules, added 42 tests |

## New Test Coverage

| Test File | Tests | Covers |
|-----------|-------|--------|
| tower-utils.test.ts | 18 | Rate limiting, path normalization, MIME types |
| tower-tunnel.test.ts | 19 | Tunnel lifecycle, config watching, metadata |
| tower-instances.test.ts | 32 | Instance lifecycle, project registration |
| tower-terminals.test.ts | 28 | Session CRUD, tmux, reconciliation, file tabs |
| tower-websocket.test.ts | 21 | WebSocket frame routing, upgrade handling |
| tower-routes.test.ts | 22 | Route dispatch, CORS, rate limiting, errors |
| spawn-roles.test.ts | 14 | Template rendering, prompt building, mode resolution |
| spawn-worktree.test.ts | 28 | Worktree creation, collision detection, slugify, resume |

## Issues Found During Implementation

| Issue | Severity | Phase | Resolution |
|-------|----------|-------|------------|
| Startup race: `getInstances` returns `[]` before init | Medium | 3 | Added startup guard, moved init before reconcile |
| `fatal()` mock throws vs production `process.exit()` | Low | 7 | Assert `fatal` was called, not `rejects.toThrow` |
| Duplicate error handlers after route extraction | Low | 6 | Removed duplicates per reviewer feedback |
| Porch misclassified APPROVE as REQUEST_CHANGES | Low | 7 | Wrote rebuttals; no code changes needed |

## Lessons Learned

1. **TowerContext pattern works well**: Passing shared state via a context object eliminated all circular dependencies. Every module takes `ctx: TowerContext` as first parameter. Clean one-way dependency flow.

2. **Extraction order matters**: Starting with leaf modules (types, utils) and progressing to more coupled ones (routes, websocket) minimized merge conflicts and kept each phase independently testable.

3. **Decomposition exposes hidden bugs**: Phase 3 reviewers caught a startup race condition where `getInstances` could return `[]` before `initInstances` completed. The original monolithic code hid this because everything shared one scope.

4. **`return await` is critical in handler wrappers**: When a function delegates to another async function inside try/catch, `return await fn()` is required, not `return fn()`. Without `await`, errors bypass the catch block.

5. **Module boundaries should follow data flow**: Tower modules follow the request lifecycle (routes → terminals → instances → websocket). Spawn modules follow the concern axis (roles/prompts vs git/sessions).

6. **`fatal()` mock behavior differs from production**: In production, `fatal()` calls `process.exit()` (not catchable). The mock throws an Error (catchable by try/catch). Tests for try/catch-wrapped code must assert `fatal` was called rather than using `rejects.toThrow`.

## Consultation Summary

21 rounds × 3 models = 63 consultation files.

### Reviewer Patterns

**Codex**: Consistently focused on test completeness — flagged missing test files, insufficient edge case coverage, untested error paths. Sometimes produced false positives (claiming tests weren't committed when they were).

**Gemini**: Focused on architectural correctness — caught the startup race in Phase 3, flagged module boundary concerns. Occasionally misclassified by porch verdict parser.

**Claude**: Most thorough line-by-line reviews with function-by-function traceability tables. Rarely blocked. Caught subtle issues like the `buildWorktreeLaunchScript` filesystem side effect.

## Recommendations

1. Consider decomposing `tower-routes.ts` (1,701 lines) into route groups in a future spec
2. Fix porch verdict parsing to correctly classify APPROVE/REQUEST_CHANGES verdicts
3. Add commit hash to consultation context files to prevent timing-related false positives
4. Document the `fatal()` mock pattern in the testing guide for future builders
