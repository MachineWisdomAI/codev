# Review: Consolidate Shellper Session Creation

## Summary

Extracted duplicated shellper session creation defaults (cols, rows, restartOnExit) from 7 call sites across 5 files into a single `defaultSessionOptions()` factory function in `terminal/index.ts`. All call sites now import and use this function instead of independently assembling the same defaults. Pure refactor with zero behavior change.

## Spec Compliance

- [x] All shellper session creation flows through one shared function for default options
- [x] No raw `cols: DEFAULT_COLS, rows: DEFAULT_ROWS` literals outside the factory function (except `shellper-process.ts` class member defaults, which are internal state, not session creation)
- [x] Existing tests pass without modification (behavior unchanged)
- [x] `spawn-worktree.ts` uses the same constants via the factory for its HTTP body
- [x] Factory function lives in the terminal module (not scattered into server code)

## Deviations from Plan

None. Both phases were implemented exactly as planned.

## Changes by File

### New Files
- `packages/codev/src/terminal/__tests__/default-session-options.test.ts` — 6 unit tests for the factory function

### Modified Files
- `packages/codev/src/terminal/index.ts` — Added `SessionDefaults` interface and `defaultSessionOptions()` factory
- `packages/codev/src/agent-farm/servers/tower-routes.ts` — 2 call sites refactored (handleTerminalCreate, handleWorkspaceShellCreate)
- `packages/codev/src/agent-farm/servers/tower-instances.ts` — 1 call site refactored (launchInstance)
- `packages/codev/src/agent-farm/commands/spawn-worktree.ts` — 1 call site refactored (createPtySession HTTP body)
- `packages/codev/src/terminal/pty-manager.ts` — 2 call sites refactored (createSession, createSessionRaw)
- `packages/codev/src/terminal/session-manager.ts` — 1 call site refactored (reconnectSession)

## Lessons Learned

### What Went Well
- The plan correctly identified the tricky override semantics at each call site (`||` vs `??` vs spread)
- Phase separation (create factory → refactor call sites) was clean and allowed incremental verification
- All existing tests passed without modification, confirming the refactor was behavior-preserving

### Challenges Encountered
- **Codex JSONL parsing bug**: Porch's verdict parser cannot extract text from OpenAI Agent SDK JSONL format, causing every codex review to parse as REQUEST_CHANGES even when the actual verdict was APPROVE. This forced 7 iterations per phase instead of 1-2.
- **Gemini false positive on `rows`**: In iteration 6, Gemini incorrectly flagged a "regression" where `rows` was not overridden in `handleTerminalCreate`. Investigation showed the original code already hardcoded `rows: DEFAULT_ROWS` (ignoring the request's `rows` variable), so the refactored code preserved this exact behavior.

### What Would Be Done Differently
- Fix the codex JSONL parsing bug before running future consultations to avoid wasting ~12 consultation rounds on false positives

### Methodology Improvements
- Porch should have a mechanism to override/skip a known-broken reviewer after N consecutive false positives with documented rebuttals
- The spec was simplified mid-implementation (detached shellper sections removed) — this was handled cleanly by merging the updated spec

## Technical Debt
- `handleTerminalCreate` ignores the `rows` parameter for persistent sessions (pre-existing, not introduced by this refactor)

## Follow-up Items
- Fix codex JSONL verdict parsing in `usage-extractor.ts` (separate issue)
- Spec 0118 (multi-client shellper) for session persistence across Tower restarts
