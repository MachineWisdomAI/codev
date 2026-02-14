# Phase 6 Iteration 1 Rebuttals

## Codex: "No route dispatch table implemented"

**Claim**: `handleRequest` uses a sequential `if` chain instead of a route dispatch table as called for in the plan.

**Rebuttal**: The plan's intent was to convert inline anonymous handlers into **named, testable functions** dispatched from a central entry point — which is exactly what was done. The phrase "route dispatch table" was used loosely in the plan to describe this extraction, not to mandate a specific data structure (e.g., `Map<RegExp, Handler>`).

A formal dispatch table would need to encode:
- Mixed HTTP methods per route (GET vs POST vs DELETE)
- Parameterized path segments (`/project/:encodedPath/api/state`)
- Compound matching conditions (base64-decoded path validation, sub-route delegation)
- Nested route hierarchies (project routes contain ~15 sub-routes)

Encoding all of this into a table structure would add abstraction complexity for zero behavioral benefit. The sequential `if/else` chain with named handler functions:
1. Is the **established pattern** from the original `tower-server.ts` — preserving it ensures behavioral parity for this zero-behavior-change refactor
2. Provides **clear, linear readability** for ~30 routes
3. Extracts every handler into a **named, independently testable function** — achieving the plan's actual goal
4. Is the standard pattern for Node.js HTTP servers without a framework (Express/Koa would provide table-based routing, but introducing a framework is out of scope)

**Resolution**: Rate limiting test gap was addressed in commit `afacd92`. Dispatch table concern is a false positive — named handler extraction fulfills the plan's intent.

## Codex: "No test coverage for activation rate limiting"

**Status**: Fixed in commit `afacd92`. Added two tests:
- `returns 429 when rate limited`
- `launches instance when not rate limited`

## Claude: "Duplicate process error handlers"

**Status**: Fixed. Removed the duplicate `process.on('uncaughtException')` and `process.on('unhandledRejection')` handlers at the bottom of `tower-server.ts`. The more complete handlers at lines 102-111 are retained.

## Claude: "Unused stopGateWatcher import"

**Status**: Fixed. Removed the unused `stopGateWatcher` import from `tower-server.ts` — `shutdownTerminals()` already handles stopping the gate watcher internally.
