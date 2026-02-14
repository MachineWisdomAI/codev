# Phase 3 Iteration 1-2 Rebuttals

## Addressed: Startup race on getInstances (Codex, iter 1)

Fixed in iteration 2. Changed `getInstances()` from throwing `"Instances module not initialized"` to returning `[]` when called before `initInstances()`. This matches the original behavior where `getInstances()` accessed module-scope state that was always initialized (returning an empty list during the startup window before projects were reconciled).

This is the same class of issue as the Phase 2 startup race on `POST /api/tunnel/connect` — the extraction introduces an initialization dependency that didn't exist when everything was module-scope.

Updated test to verify the startup guard returns `[]` instead of throwing.

## Addressed: Startup race on launchInstance/stopInstance (Codex, iter 2)

Fixed in iteration 3. Changed `launchInstance()` and `stopInstance()` to return graceful error responses instead of throwing when called before `initInstances()`:
- `launchInstance()`: returns `{ success: false, error: 'Tower is still starting up...' }`
- `stopInstance()`: returns `{ success: false, error: 'Tower is still starting up...', stopped: [] }`

This matches the pattern applied to `getInstances()` (returns `[]`) and `handleTunnelEndpoint` (returns 503) during the startup window. Updated tests accordingly.

## Noted: execSync blocks event loop (Gemini)

Acknowledged as informational. The `execSync` call in `launchInstance()` for `npx codev adopt` preserves existing behavior. This is a refactor — changing to async would be a behavioral change outside scope.

## Noted: _deps! assertion risk in exit callbacks (Claude)

Acknowledged as informational. The `_deps!` non-null assertion in `ptySession.on('exit')` callbacks mirrors the original code's pattern (which accessed module-scope variables directly). For a zero-behavior-change refactor, this is correct. If `shutdownInstances()` is called while sessions are still running, the assertion could fail — but this matches the original behavior.
