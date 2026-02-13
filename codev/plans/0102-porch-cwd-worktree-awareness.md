# Plan: Porch CWD / Worktree Awareness

## Metadata
- **Specification**: `codev/specs/0102-porch-cwd-worktree-awareness.md`
- **Created**: 2026-02-12

## Executive Summary

Add a `detectProjectIdFromCwd()` function to `state.ts` that extracts the project ID from the CWD path when running inside a `.builders/` worktree. Integrate it into the existing `getProjectId()` resolution chain in `index.ts`. This is a small, focused change (~30 lines of production code + ~100 lines of tests).

## Success Metrics
- [ ] All 7 acceptance criteria from spec met
- [ ] Unit tests cover all worktree naming patterns
- [ ] Unit tests cover full resolution priority chain
- [ ] Existing tests still pass
- [ ] `porch status` works without args from inside a worktree

## Phases (Machine Readable)

```json
{
  "phases": [
    {"id": "phase_1", "title": "Core detection function and unit tests"},
    {"id": "phase_2", "title": "Integration into getProjectId and verification"}
  ]
}
```

## Phase Breakdown

### Phase 1: Core Detection Function and Unit Tests
**Dependencies**: None

#### Objectives
- Implement `detectProjectIdFromCwd()` in `state.ts`
- Write comprehensive unit tests covering all worktree naming patterns

#### Deliverables
- [ ] `detectProjectIdFromCwd()` function in `state.ts`
- [ ] Unit tests in `__tests__/state.test.ts`

#### Implementation Details

Add to `packages/codev/src/commands/porch/state.ts`:

```typescript
/**
 * Detect project ID from the current working directory if inside a builder worktree.
 * Works from any subdirectory within the worktree.
 * Returns zero-padded project ID, or null if not in a recognized worktree.
 */
export function detectProjectIdFromCwd(cwd: string): string | null {
  const normalized = path.resolve(cwd).split(path.sep).join('/');
  const match = normalized.match(/\.builders\/(bugfix-(\d+)|(\d{4}))(\/|$)/);
  if (!match) return null;
  const rawId = match[2] || match[3];
  return rawId.padStart(4, '0');
}
```

#### Test Plan

Add a new `describe('detectProjectIdFromCwd')` block to `__tests__/state.test.ts`:

| Input Path | Expected Output |
|-----------|----------------|
| `/repo/.builders/0073` | `"0073"` |
| `/repo/.builders/0073/src/commands/` | `"0073"` |
| `/repo/.builders/bugfix-228` | `"0228"` |
| `/repo/.builders/bugfix-228/src/deep/path` | `"0228"` |
| `/repo/.builders/bugfix-5` | `"0005"` |
| `/repo/.builders/bugfix-12345` | `"12345"` |
| `/repo/.builders/task-aB2C` | `null` |
| `/repo/.builders/maintain-xY9z` | `null` |
| `/repo/.builders/spir-aB2C` | `null` |
| `/regular/path/no/builders` | `null` |
| `/repo/.builders/0073-extra-text/` | `null` (not a valid worktree pattern) |

#### Acceptance Criteria
- [ ] Function correctly extracts IDs from spec and bugfix worktrees
- [ ] Function returns null for task/protocol/unrecognized worktrees
- [ ] Function works from subdirectories within worktrees
- [ ] All unit tests pass

---

### Phase 2: Integration into getProjectId and Verification
**Dependencies**: Phase 1

#### Objectives
- Wire `detectProjectIdFromCwd()` into the `getProjectId()` resolution chain
- Verify the full priority chain works correctly
- Run existing test suite to ensure no regressions

#### Deliverables
- [ ] Updated `getProjectId()` in `index.ts`
- [ ] Updated help text mentioning CWD auto-detection

#### Implementation Details

Modify `getProjectId()` in `packages/codev/src/commands/porch/index.ts` (line 614). **Preserve the existing signature** `(provided?: string)` — only insert CWD detection between the explicit arg check and the filesystem scan:

```typescript
function getProjectId(provided?: string): string {
  // 1. Explicit CLI argument (highest priority)
  if (provided) return provided;

  // 2. CWD worktree detection
  const fromCwd = detectProjectIdFromCwd(process.cwd());
  if (fromCwd) {
    console.log(chalk.dim(`[auto-detected project from worktree: ${fromCwd}]`));
    return fromCwd;
  }

  // 3. Filesystem scan fallback
  const detected = detectProjectId(projectRoot);
  if (detected) {
    console.log(chalk.dim(`[auto-detected project: ${detected}]`));
    return detected;
  }

  // 4. Error — none of the detection methods succeeded
  throw new Error(
    'Cannot determine project ID. Provide it explicitly or run from a builder worktree.'
  );
}
```

Note: The existing signature `(provided?: string)` is preserved. The `provided` value already comes from `rest[0]` at each call site (e.g., `getProjectId(rest[0])`), so no call sites need changes. The `projectRoot` variable is captured from the outer `cli()` scope (line 611).

Add import of `detectProjectIdFromCwd` from `./state.js`.

Update the help text (line 680) to mention CWD auto-detection:
```
'Project ID is auto-detected from worktree path or when exactly one project exists.'
```

#### Test Plan

Add unit tests for the full resolution priority chain. Since `getProjectId()` is a closure inside `cli()`, test the priority behavior via the exported `detectProjectIdFromCwd()` function and verify integration manually:

- Test that `detectProjectIdFromCwd()` returns `null` for non-worktree paths (ensuring filesystem scan fallback kicks in)
- Test that when CWD is a task/protocol worktree, `detectProjectIdFromCwd()` returns `null` and the error path is reached (when filesystem scan also returns `null`)
- Verify `npm run build` and existing test suite pass

#### Acceptance Criteria
- [ ] Explicit arg takes precedence over CWD detection
- [ ] CWD detection takes precedence over filesystem scan
- [ ] Error message is clear when no ID can be determined (includes task/protocol worktrees)
- [ ] Existing porch tests pass with no regressions
- [ ] `npm run build` succeeds

## Dependency Map
```
Phase 1 ──→ Phase 2
```

## Risk Analysis

| Risk | Probability | Impact | Mitigation |
|------|------------|--------|------------|
| Regex doesn't match edge case | Low | Low | Comprehensive unit tests |
| Breaking existing getProjectId callers | Low | Medium | Preserving existing function signature |

## Validation Checkpoints
1. **After Phase 1**: All unit tests for `detectProjectIdFromCwd` pass
2. **After Phase 2**: Full test suite passes, `porch status` works without args from a worktree
