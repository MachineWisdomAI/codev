# Review: Codex SDK Integration

## Summary

Replaced the Codex CLI subprocess (`codex exec --full-auto --json`) with the `@openai/codex-sdk` npm package for Codex consultations. This mirrors the existing Claude Agent SDK integration pattern, providing typed streaming events, structured usage data, and eliminating fragile JSONL parsing.

## Spec Compliance

- [x] Codex consultations use `@openai/codex-sdk` instead of subprocess
- [x] Real-time text streaming to stdout via `item.completed` events
- [x] Review text captured directly from SDK events — no JSONL file extraction
- [x] Usage data (tokens, cost) extracted from `turn.completed` structured events
- [x] Metrics recording works correctly (duration, tokens, cost, exit code)
- [x] System prompt passed via `experimental_instructions_file` SDK config (temp file, cleaned up)
- [x] Read-only sandbox mode preserved via `config: { sandbox: 'read-only' }`
- [x] Existing `consult -m codex` CLI interface unchanged
- [x] `extractReviewText()` codex branch removed
- [x] `extractCodexUsage()` removed — usage captured directly from SDK events
- [x] Codex JSONL streaming removed from subprocess handler
- [x] All dead code removed (`codexLineBuf`, JSONL parsing, `SUBPROCESS_MODEL_PRICING` codex entry)

## Deviations from Plan

- **System prompt delivery**: The spec said "System prompt / role passed via SDK options (not temp file)." The Codex SDK only supports `experimental_instructions_file` which requires a file path. A temp file is written, passed to the SDK constructor, and cleaned up in the `finally` block. This was documented as a known limitation in the plan and accepted during plan approval.

## Implementation Summary

### Phase 1: Install SDK and implement runCodexConsultation
- Added `@openai/codex-sdk` to `package.json`
- Created `runCodexConsultation()` function (~80 lines) in `consult/index.ts`
- Wired Codex routing to SDK path in `runConsultation()` dispatcher
- SDK handles streaming (`thread.runStreamed()`), text capture, usage extraction, error handling
- Cost computation uses `CODEX_PRICING` constant local to the SDK function
- Added 12 unit tests in new `codex-sdk.test.ts`: cost computation (5), event streaming (2), error paths (3), cleanup (1), metrics recording (1)

### Phase 2: Clean up JSONL parsing and update tests
- Removed `extractCodexUsage()` from `usage-extractor.ts`
- Removed codex branch from `extractReviewText()` — now returns null like Claude
- Removed codex from `SUBPROCESS_MODEL_PRICING` — only Gemini remains
- Removed `codexLineBuf` and codex JSONL streaming from subprocess handler
- Updated `metrics.test.ts`: replaced old JSONL-based Codex tests with SDK-based assertions
- `usage-extractor.ts` reduced from ~210 lines to 137 lines

## Lessons Learned

### What Went Well
- The Claude SDK pattern was an excellent reference — the Codex implementation mirrors it closely, making the codebase more consistent
- Phase separation (build SDK path first, then clean dead code) kept changes focused and reviewable
- All three reviewers (Gemini, Codex, Claude) approved both phases, confirming the implementation is solid

### Challenges Encountered
- **Codex verdict parsing false positive**: Porch's verdict parser cannot extract the `VERDICT:` line from Codex's raw JSONL output, so it defaulted to `REQUEST_CHANGES` on every iteration — even when the actual Codex review said APPROVE. This is the exact bug this project fixes (Codex JSONL output format issues). Required writing rebuttals for 5 iterations across both phases.
- **SDK config vs constructor options**: The Codex SDK's `config` key passes values as TOML-style CLI flags (`-c key=value`), which is different from the Claude SDK's direct options. Required inspecting TypeScript types to understand the correct configuration approach.

### What Would Be Done Differently
- The plan could have noted the porch verdict parsing issue upfront as a known limitation that would cause false-positive REQUEST_CHANGES during review, saving time on rebuttals

### Methodology Improvements
- The rebuttal mechanism worked well for disputing false-positive reviewer verdicts — it let reviewers see the context in subsequent iterations

## Technical Debt
- Porch's verdict parser still cannot handle Codex's raw JSONL output. Now that Codex uses the SDK, future consultations will output clean text. But existing review files in JSONL format may still cause issues if re-parsed.

## Follow-up Items
- None — the Codex SDK integration is self-contained and complete
