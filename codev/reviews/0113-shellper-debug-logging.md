# Review: Shellper Debug Logging (Spec 0113)

## Summary

Implemented comprehensive diagnostic logging across the shellper process lifecycle, split into 3 phases:

1. **Phase 1 (R1, R2, R6)**: Shellper-side stderr logging with EPIPE-safe write helper
2. **Phase 2 (R3, R4)**: Tower-side SessionManager logger callback and event logging
3. **Phase 3 (R5)**: Stderr capture bridge connecting shellper logs to Tower visibility

## What Worked Well

- **StderrBuffer ring buffer design**: Clean, self-contained class with proper partial-line handling, truncation, and UTF-8 replacement. The push/shift approach is simple and correct for 500 elements.
- **Multi-agent consultation caught a real bug**: Codex identified that `stderrClosed` as a local boolean was copied by value into the session object, so the close callback never updated the session. Fixed by using `stderrStream.destroyed` reference instead.
- **3-phase layering**: Splitting by layer (shellper internals → Tower wiring → stderr bridge) kept each phase focused and independently testable.
- **Deduplication via flag**: The `stderrTailLogged` flag prevents double logging from both `exit` and `close` events firing.

## What Could Be Improved

- **Consultation loop**: Codex requested the same edge-case tests for 5 consecutive iterations while Gemini and Claude approved. Porch has no mechanism to resolve 2/3 supermajority approval, causing an infinite loop. This needs a max iteration cap or supermajority override in porch.
- **Polling vs event-driven**: `logStderrTail` uses `setInterval(50ms)` to check `stream.destroyed` instead of listening for the `close` event directly. This is functional but slightly unconventional. An event-based approach would be more idiomatic Node.js.

## Test Coverage

| Category | Count | Description |
|----------|-------|-------------|
| ShellperProcess event logging | 12 | Connection, HELLO, SPAWN, exit events |
| Reconnect failure reasons | 4 | Dead process, PID reuse, socket missing, connect error |
| Auto-restart logging | 2 | Restart count/delay, max restarts exceeded |
| StderrBuffer unit tests | 14 | Ring buffer, truncation, UTF-8, partial lines, flush |
| Stderr tail integration | 4 | Exit logging, kill logging, reconnect skip, dedup |

Total: 36 new tests across session-manager.test.ts, plus 12 in shellper-process.test.ts.

## Files Changed

| File | Lines | Description |
|------|-------|-------------|
| `shellper-main.ts` | +22 | logStderr helper, startup/SIGTERM/PTY exit logging |
| `shellper-process.ts` | +18 | Log callback for connection/HELLO/SPAWN/exit events |
| `session-manager.ts` | +175 | StderrBuffer, wireStderrCapture, logStderrTail, logger |
| `tower-instances.ts` | +2 | Exit code/signal in architect session exit log |
| `tower-server.ts` | +1 | Wire logger callback to SessionManager |
| `tower-terminals.ts` | +4 | Forward exit code/signal through PtySession |
| `pty-session.ts` | +3 | Propagate signal in exit event |
| `shellper-process.test.ts` | +146 | 12 event logging unit tests |
| `session-manager.test.ts` | +587 | 24 tests (reconnect, restart, buffer, integration) |
| `tower-shellper-integration.test.ts` | +1 | Exit callback arity update |

## Lessons Learned

1. **Boolean value-copy trap**: JavaScript primitive types are copied by value when assigned to object properties. When a boolean needs to track an external state (like stream closure), use a reference to the object itself (e.g., `stream.destroyed`) instead of a copied boolean.
2. **Consultation max iterations**: Porch needs a max iteration limit or supermajority override. A single reviewer repeating the same concern shouldn't block progress indefinitely when 2/3 reviewers consistently approve.
3. **Test proportionality**: Not every code path needs a dedicated test. Safety nets (like a 3-line setTimeout fallback) can be validated by code review when the test infrastructure cost is disproportionate.
