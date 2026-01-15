# Spike: Checklister Agent

**Goal**: Build an agent that enforces SPIDER protocol compliance by maintaining a checklist state and blocking progression until all required items are complete.

**Time-box**: 2-4 hours
**Status**: IN PROGRESS
**Started**: 2026-01-16

## Hypothesis

A checklister agent can enforce deterministic SPIDER compliance by:
1. Maintaining state about which checklist items are complete
2. Blocking phase transitions until prerequisites are met
3. Providing clear feedback about what's missing

## Key Questions

1. **State Management**: How should checklist state be stored?
   - Option A: In-memory (session-scoped)
   - Option B: File-based (`.spider-state.json`)
   - Option C: SQLite (like agent-farm state)

2. **Integration**: How does the checklister interact with the architect/builder?
   - Option A: Separate agent that reviews commits/PRs
   - Option B: Inline hooks in the architect/builder prompts
   - Option C: Pre-commit/post-commit git hooks
   - Option D: Claude Code skill that can be invoked

3. **Granularity**: What level of detail?
   - High-level phase gates only (S → P → I → D → E → R)
   - Per-phase detailed checklists (all items in protocol.md)
   - Hybrid: phase gates + critical items only

## SPIDER Checklist Model

Based on `codev/protocols/spider/protocol.md`:

```yaml
spider_checklist:
  # SPECIFY PHASE
  specify:
    - id: spec_draft
      label: "Initial specification draft committed"
      blocking: true
    - id: spec_consult_1
      label: "First multi-agent consultation (GPT-5 + Gemini)"
      blocking: true
    - id: spec_feedback_commit
      label: "Specification with multi-agent review committed"
      blocking: true
    - id: spec_human_review
      label: "Human review complete"
      blocking: true
    - id: spec_consult_2
      label: "Second multi-agent consultation"
      blocking: true
    - id: spec_final
      label: "Final approved specification committed"
      blocking: true

  # PLAN PHASE
  plan:
    - id: plan_draft
      label: "Initial plan draft committed"
      blocking: true
    - id: plan_consult_1
      label: "First multi-agent consultation"
      blocking: true
    - id: plan_feedback_commit
      label: "Plan with multi-agent review committed"
      blocking: true
    - id: plan_human_review
      label: "Human review complete"
      blocking: true
    - id: plan_consult_2
      label: "Second multi-agent consultation"
      blocking: true
    - id: plan_final
      label: "Final approved plan committed"
      blocking: true

  # IDE LOOP (repeated per phase)
  phase_template:
    implement:
      - id: prev_phase_committed
        label: "Previous phase committed (git log verification)"
        blocking: true
      - id: code_complete
        label: "All code for phase complete"
        blocking: true
      - id: impl_consult
        label: "Expert consultation (GPT-5 + Gemini)"
        blocking: true
      - id: impl_feedback_addressed
        label: "Expert feedback addressed"
        blocking: true

    defend:
      - id: unit_tests
        label: "Unit tests for all new functions"
        blocking: true
      - id: integration_tests
        label: "Integration tests for critical paths"
        blocking: true
      - id: tests_passing
        label: "All tests passing"
        blocking: true
      - id: defend_consult
        label: "Expert consultation on tests"
        blocking: true
      - id: overmocking_check
        label: "Overmocking check completed"
        blocking: true

    evaluate:
      - id: acceptance_criteria
        label: "All acceptance criteria met"
        blocking: true
      - id: expert_approval
        label: "Expert final approval received"
        blocking: true
      - id: user_evaluation
        label: "User evaluation discussion completed"
        blocking: true
      - id: user_approval
        label: "User explicit approval to proceed"
        blocking: true
      - id: phase_commit
        label: "Phase commit created"
        blocking: true
      - id: plan_updated
        label: "Plan document updated with phase status"
        blocking: true

  # REVIEW PHASE
  review:
    - id: all_phases_committed
      label: "All implementation phases committed"
      blocking: true
    - id: review_doc
      label: "Review document created"
      blocking: true
    - id: arch_updated
      label: "arch.md updated if needed"
      blocking: false
    - id: lessons_learned
      label: "Lessons learned documented"
      blocking: true
    - id: docs_updated
      label: "README/AGENTS.md/CLAUDE.md updated if needed"
      blocking: false
```

## Proposed Interface

### As a Claude Code Skill

```bash
# Check current state
/checklister status

# Mark item complete (with evidence)
/checklister complete spec_draft --evidence "commit abc123"

# Attempt phase transition
/checklister gate plan  # Fails if specify phase incomplete

# Reset (for testing)
/checklister reset
```

### State File Format

```json
{
  "project_id": "0069",
  "protocol": "spider",
  "current_phase": "specify",
  "completed": {
    "spec_draft": {
      "timestamp": "2026-01-16T10:00:00Z",
      "evidence": "commit abc123"
    }
  },
  "phases": {
    "phase_1_core_toggle": {
      "current_stage": "implement",
      "completed": {}
    }
  }
}
```

## Implementation Plan

### Phase 1: Minimal Viable Checklister

1. Create skill definition in `.claude/skills/checklister.md`
2. Define state file format (`.spider-state.json`)
3. Implement status command (read-only)
4. Implement complete command (mark items done)
5. Implement gate command (check phase transitions)

### Phase 2: Integration Test

1. Create test spec 0069 (tower light/dark mode)
2. Run SPIDER with checklister enforcement
3. Verify gates block correctly
4. Document friction points

### Phase 3: Refinement

1. Address friction points from test
2. Add automatic evidence detection (git commit parsing)
3. Consider CI/hook integration

## Test Case: Spec 0069 - Tower Light/Dark Mode

A minimal SPIDER task to test the checklister:

**Goal**: Add a light mode toggle to `codev tower start` dashboard

**Scope**:
- Add theme toggle button to dashboard header
- Implement light mode CSS variables
- Persist preference in localStorage
- < 200 lines of code

This is intentionally small to test the protocol overhead, not implementation complexity.

## Success Criteria

1. **PASS**: Checklister blocks phase transition when items incomplete
2. **PASS**: Checklister allows transition when all blocking items complete
3. **PASS**: State persists across sessions
4. **PASS**: Clear feedback about what's missing
5. **PASS**: Overhead feels reasonable (not annoying)

## Notes

- Start simple: file-based state, manual marking
- Don't over-engineer: this is a spike, not production
- Focus on learning what friction points exist
