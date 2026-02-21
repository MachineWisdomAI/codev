# Review: Risk-Based PR Review Triage for Architect

## Summary

Implemented risk-based PR review triage as a documentation-only change. Updated the architect role document, workflow reference, and created a new risk triage guide. The architect now has a clear decision framework for choosing review depth (low/medium/high) based on PR size, scope, and subsystem — replacing the previous "always 3-way CMAP" approach.

No code changes were made. The architect uses existing tools (`gh pr diff --stat`, existing `consult` commands) with new decision guidance embedded in their role documentation.

## Spec Compliance

- [x] Risk criteria defined (lines, files, subsystem, cross-cutting) with three levels
- [x] Precedence rule: highest factor wins
- [x] Low risk: architect reads PR, summarizes, tells builder to merge ($0)
- [x] Medium risk: single-model integration review via `consult -m claude` (~$1-2)
- [x] High risk: full 3-way CMAP (Gemini + Codex + Claude in parallel) (~$4-5)
- [x] Subsystem path mappings documented (14 entries from High to Low)
- [x] Example workflows for each risk level
- [x] `codev/` and `codev-skeleton/` versions in sync

### Approach Selection

The spec offered two approaches:
1. **CLI Command** (`consult risk pr <N>`) — automated risk assessment
2. **Documentation Only** — update architect prompts and reference docs

**Approach 2 was selected** per architect feedback ("That is way overkill. It should just be enough to update the architect prompt!"). This eliminated all CLI code changes, reducing the implementation to four documentation files.

## Deviations from Plan

- **Plan was rewritten mid-project**: Original plan had CLI code changes (2 phases: Risk Assessment Engine + Documentation). After architect feedback, the plan was simplified to documentation-only with 2 new phases: Architect Prompt & Role Updates + Workflow Reference & Triage Guide.
- **No deviations from the simplified plan**: All deliverables match the approved plan exactly.

## Lessons Learned

### What Went Well
- Documentation-only approach was the right call — achieved the same goal without code complexity
- Dual-directory update pattern (codev/ + codev-skeleton/) is well-established and worked smoothly
- The "highest factor wins" precedence rule is simple and fail-safe

### Challenges Encountered
- **Pre-existing drift between codev/ and codev-skeleton/ architect.md**: Codex caught 2 extra Critical Rules lines in the skeleton that were missing from codev/. Fixed by syncing, but this was unrelated to the triage changes.
- **Medium-risk example file count mismatch**: Claude caught that the example header said "5 files" but the stat output showed 3. Cosmetic but important for a reference document.
- **Gemini consultation failure**: The first Gemini impl review for Phase 2 failed to produce an output file. Re-running succeeded.

### What Would Be Done Differently
- Would have verified example data consistency more carefully before committing — the file count mismatch was an oversight that a quick proofread would have caught
- The original CLI approach wasted spec and plan effort — should have sought architect feedback on the approach earlier (before full spec consultation)

### Methodology Improvements
- Consider adding an "approach check" step before full spec consultation, where the builder asks the architect: "CLI code or documentation-only?" This avoids wasting consultation budget on an approach that gets rejected.

## Technical Debt

None. This is a documentation-only change with no code.

## Consultation Feedback

### Specify Phase (Round 1)

#### Gemini (REQUEST_CHANGES)
- **Concern**: CLI orchestration model too complex; `--risk auto` unclear
  - **Addressed**: Redesigned to `consult risk pr <N>` as a reporter command
- **Concern**: Model selection for medium risk unspecified
  - **Addressed**: Spec explicitly states Claude for speed/cost
- **Concern**: Subsystem mapping storage unclear
  - **Addressed**: Stored in `risk-triage.md` and hardcoded in CLI

#### Codex (REQUEST_CHANGES)
- **Concern**: No deterministic decision algorithm
  - **Addressed**: Added "highest factor wins" precedence rule
- **Concern**: No behavior when `gh` unavailable
  - **Addressed**: Fail fast with clear error

#### Claude (COMMENT)
- **Concern**: `--risk auto` interaction with `-m` flag
  - **Addressed**: Redesigned to separate subcommand
- **Concern**: Edge cases (binary files, deletions-only)
  - **Addressed**: Binary excluded from line counts, deletions weighted same as additions

### Plan Phase (Round 1)

#### Gemini (APPROVE)
- No concerns raised. Implementation tips noted and incorporated.

#### Codex (REQUEST_CHANGES)
- **Concern**: Backward compatibility with `--risk` flags
  - **Rebutted**: No flags added — backwards compatibility preserved by design
- **Concern**: Doc/code subsystem mapping sync
  - **Rebutted**: Cross-referencing during doc phase is sufficient; unit tests would be over-engineering

#### Claude (COMMENT)
- **Concern**: Cross-cutting factor omitted from plan
  - **Addressed**: Added note explaining subsystem paths capture cross-cutting changes
- **Concern**: Performance testing not in test plan
  - **Rebutted**: Network-bound API calls not meaningfully testable in CI

### Implement Phase 1: architect_prompt (Round 1)

#### Gemini (APPROVE)
- No concerns raised.

#### Codex (REQUEST_CHANGES)
- **Concern**: codev/ and codev-skeleton/ architect.md not identical
  - **Addressed**: Synced 2 pre-existing extra lines from skeleton into codev/

#### Claude (COMMENT)
- **Concern**: Same pre-existing sync drift observation
  - **Addressed**: Same fix as Codex — synced the 2 lines

### Implement Phase 2: reference_docs (Round 1)

#### Gemini (APPROVE)
- No concerns raised.

#### Codex (REQUEST_CHANGES)
- **Concern**: Workflow references not in sync between codev/ and codev-skeleton/
  - **Rebutted**: Cited differences are pre-existing drift unrelated to this PR
- **Concern**: Missing quick reference card in risk-triage.md
  - **Rebutted**: Step 3 "Execute Review" table serves as the quick reference card

#### Claude (COMMENT)
- **Concern**: Medium-risk example has inconsistent file counts
  - **Addressed**: Fixed "5 files" → "3 files" and "2 files changed" → "3 files changed"

## Architecture Updates

No architecture updates needed. This was a documentation-only change with no new subsystems, data flows, or code modules. The risk triage framework lives entirely in role documentation and reference guides.

## Lessons Learned Updates

No lessons learned updates needed. The key insight (seek approach feedback early to avoid wasted consultation) is specific to this project's unique circumstance (spec offered two approaches, one was rejected). The existing lessons-learned.md already covers the general principle of checking with the architect before implementing.

## Flaky Tests

No flaky tests encountered.

## Follow-up Items

- Monitor whether the subsystem path mappings stay current as the codebase evolves (low risk — they change infrequently)
- Consider the "approach check" methodology improvement for future specs with multiple approaches
