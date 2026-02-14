# Review: Spec 0105 — Tower Server Decomposition

**PR**: #258
**Branch**: `builder/0105-tower-server-decomposition`
**Protocol**: SPIR (strict mode)

## Summary

Decomposed `tower-server.ts` (3,400→308 lines) and `spawn.ts` (1,405→570 lines) into focused modules across 7 phases. Pure refactoring with zero behavior change, verified by 3-way consultations at each phase.

## Results

### Tower Server (Phases 1–6)

| Module | Lines | Responsibility |
|--------|-------|---------------|
| `tower-types.ts` | 87 | Shared interfaces |
| `tower-utils.ts` | 184 | MIME, file serving, CORS, security |
| `tower-tunnel.ts` | 337 | Cloudflare tunnel lifecycle |
| `tower-instances.ts` | 538 | Builder instance lifecycle |
| `tower-terminals.ts` | 715 | PTY session management |
| `tower-websocket.ts` | 194 | WebSocket upgrade + I/O relay |
| `tower-routes.ts` | 1,701 | HTTP route dispatch |
| `tower-server.ts` | 308 | Orchestrator |

### Spawn Command (Phase 7)

| Module | Lines | Responsibility |
|--------|-------|---------------|
| `spawn-roles.ts` | 343 | Template rendering, protocol/mode resolution |
| `spawn-worktree.ts` | 404 | Git worktree, sessions, collision detection |
| `spawn.ts` | 570 | Orchestrator |

### Acceptance Criteria

| Criterion | Target | Actual |
|-----------|--------|--------|
| `tower-server.ts` | ≤ 400 lines | 308 lines |
| `spawn.ts` | ≤ 600 lines | 570 lines |
| Build passes | Yes | Yes |
| All tests pass | Yes | 1,217 pass (71 files) |
| Zero behavior change | Yes | Verified by function-by-function comparison |

## Lessons Learned

1. **Porch verdict parsing bug**: Porch misclassified APPROVE verdicts as REQUEST_CHANGES multiple times (Gemini in Phase 7 iter 1, Codex in Phase 7 iter 3). The verdicts were clearly `VERDICT: APPROVE` in the output files. This caused unnecessary extra consultation iterations.

2. **Consultation timing vs commit state**: Codex consultations sometimes ran `git status` to check for uncommitted files, but the builder had already committed the files. This caused false positives in the review. Context files should include commit hashes.

3. **`return await` is critical in handler wrappers**: When a function delegates to another async function inside a try/catch, you must use `return await fn()` not `return fn()`. Without `await`, errors from the delegated function bypass the catch block. This was flagged correctly by reviewers.

4. **Extraction order matters**: Starting with leaf modules (types, utils) and progressing to more coupled ones (routes, websocket) minimized merge conflicts and kept each phase independently testable.

5. **Module boundaries should follow data flow**: The tower server's module boundaries follow the request lifecycle (routes → terminals → instances → websocket). Spawn's boundaries follow the concern axis (roles/prompts vs git/sessions).

6. **`tower-routes.ts` at 1,701 lines**: This file is larger than ideal because it contains all ~30 HTTP route handlers. A future spec could further decompose it into route groups (terminal routes, instance routes, file routes).

## Phase Consultation Summary

All 7 phases received 3-way consultations (Gemini, Codex, Claude):
- Phase 1: 2 iterations (Codex requested import cleanup)
- Phase 2: 2 iterations (Codex requested debounce tests)
- Phase 3: 5 iterations (Codex persistent concerns about startup guards)
- Phase 4: 3 iterations (Codex requested rate limiting tests)
- Phase 5: 1 iteration (all approved first round)
- Phase 6: 2 iterations (Claude flagged duplicate error handlers)
- Phase 7: 4 iterations (porch verdict parsing bug caused extra rounds)

## Recommendations

1. Fix porch verdict parsing to correctly classify APPROVE/REQUEST_CHANGES verdicts
2. Consider decomposing `tower-routes.ts` in a future spec
3. Consider adding a commit hash to consultation context files to prevent timing issues
