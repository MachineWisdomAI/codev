# Plan 422: Documentation Sweep — arch.md and lessons-learned.md

## Metadata
- **Specification**: `codev/specs/422-documentation-sweep.md`
- **Created**: 2026-02-18

## Executive Summary

Process ~121 unique spec numbers (with their associated plans and reviews, ~293 documents total) to extract architectural decisions and lessons learned into `arch.md` and `lessons-learned.md`. Uses parallel agent batches for extraction, followed by iterative refinement.

## Success Metrics
- [ ] All 121 spec number groups processed (all specs, plans, reviews read)
- [ ] arch.md updated with all architectural decisions
- [ ] lessons-learned.md updated with all generalizable wisdom
- [ ] No duplicate entries in either document
- [ ] Both documents internally consistent
- [ ] Refinement passes complete (max 7)
- [ ] Attribution preserved throughout

## Phases (Machine Readable)

```json
{
  "phases": [
    {"id": "extraction_batch_1", "title": "Extraction Batch 1 (specs 0001-0065)"},
    {"id": "extraction_batch_2", "title": "Extraction Batch 2 (specs 0066-0422 + misc)"},
    {"id": "refinement", "title": "Refinement"}
  ]
}
```

## Phase Breakdown

### Phase 1: Extraction Batch 1 (specs 0001-0065)
**Dependencies**: None

#### Objectives
- Extract architectural decisions and lessons from the first ~60 spec numbers
- Populate arch.md and lessons-learned.md with raw extraction content

#### Agent Assignments

Spawn 5 parallel agents, each reading its assigned spec/plan/review documents and writing extraction output to a file:

| Agent | Spec Range | Approx Docs | Output File |
|-------|-----------|-------------|-------------|
| 1 | 0001-0012 | ~12 specs | `extraction-0001-0012.md` |
| 2 | 0013-0031 | ~13 specs | `extraction-0013-0031.md` |
| 3 | 0032-0048 | ~13 specs | `extraction-0032-0048.md` |
| 4 | 0049-0060 | ~12 specs | `extraction-0049-0060.md` |
| 5 | 0061-0082 | ~14 specs | `extraction-0061-0082.md` |

Each agent's extraction file follows this format:
```markdown
# Extraction: Specs XXXX-YYYY

## arch.md additions

### [Section Name] (Spec XXXX)
[content]

## lessons-learned.md additions

### [Category]
- [From XXXX] [lesson]
```

After all 5 agents complete, merge all extraction files into arch.md and lessons-learned.md at once.

#### Deliverables
- [ ] 5 extraction files generated in `codev/projects/422-documentation-sweep/`
- [ ] All extraction content merged into arch.md
- [ ] All extraction content merged into lessons-learned.md
- [ ] Intermediate commit: `[Spec 422] Pass 1: extract batch 1 (specs 0001-0082)`

#### Acceptance Criteria
- [ ] Every spec/plan/review in the 0001-0082 range has been read
- [ ] Extraction files contain properly attributed content
- [ ] Merge into target docs preserves existing content

#### Rollback Strategy
Git revert the batch commit.

---

### Phase 2: Extraction Batch 2 (specs 0066-0422 + misc)
**Dependencies**: Phase 1

#### Objectives
- Extract architectural decisions and lessons from the remaining ~61 spec numbers
- Complete the raw extraction into both target documents

#### Agent Assignments

| Agent | Spec Range | Approx Docs | Output File |
|-------|-----------|-------------|-------------|
| 1 | 0083-0098 | ~13 specs | `extraction-0083-0098.md` |
| 2 | 0099-0112 | ~12 specs | `extraction-0099-0112.md` |
| 3 | 0113-0127 | ~12 specs | `extraction-0113-0127.md` |
| 4 | 0325-0403 | ~10 specs | `extraction-0325-0403.md` |
| 5 | 0422 + bugfix + 324 + 364 | ~4 specs | `extraction-misc.md` |

Same extraction file format as Phase 1. After all 5 complete, merge into target docs.

#### Deliverables
- [ ] 5 extraction files generated
- [ ] All extraction content merged into arch.md
- [ ] All extraction content merged into lessons-learned.md
- [ ] Intermediate commit: `[Spec 422] Pass 1: extract batch 2 (specs 0083-0422 + misc)`

#### Acceptance Criteria
- [ ] Every remaining spec/plan/review has been read
- [ ] Full document inventory processed (all 121 spec number groups)

#### Rollback Strategy
Git revert the batch commit.

---

### Phase 3: Refinement
**Dependencies**: Phase 2

#### Objectives
- Deduplicate, consolidate, and polish both arch.md and lessons-learned.md
- Achieve consistent terminology, formatting, and organization

#### Process
1. **Deduplication pass**: Identify and merge duplicate entries, keeping the most complete version
2. **Consistency pass**: Standardize terminology and formatting across both docs
3. **Consolidation pass**: Group related entries, merge fragmented sections
4. **Read-through passes**: Re-read end-to-end and fix remaining issues
5. Maximum 7 refinement passes total — stop earlier if a pass produces no changes

#### Deliverables
- [ ] arch.md fully deduplicated and internally consistent
- [ ] lessons-learned.md fully deduplicated and internally consistent
- [ ] Final commit: `[Spec 422] Pass 2: refinement complete`

#### Acceptance Criteria
- [ ] No duplicate entries in either document
- [ ] Consistent terminology throughout
- [ ] Consistent formatting throughout
- [ ] All cross-references valid
- [ ] No empty sections remaining

#### Rollback Strategy
Git revert the refinement commit.

## Agent Prompt Template

Each extraction agent receives a prompt like:

```
Read all spec, plan, and review documents for the following spec numbers: [LIST].
For each document, extract:
- Architectural decisions, patterns, components → format for arch.md
- Lessons learned, debugging insights, process improvements → format for lessons-learned.md

Use these attribution formats:
- arch.md: "(Spec XXXX)" in descriptions
- lessons-learned.md: "[From XXXX]" prefix

Skip content that adds nothing new. Not every doc will have extractable content.

Output a single markdown file with two sections:
## arch.md additions
## lessons-learned.md additions
```

## Risk Analysis

| Risk | Probability | Impact | Mitigation |
|------|------------|--------|------------|
| Agent context overflow on large docs | M | L | Agents handle ~12 specs each, well within limits |
| Extraction quality varies across agents | M | M | Merge step reviews all outputs; refinement phase catches issues |
| Excessive arch.md growth | L | M | Refinement phase deduplicates and consolidates |

## Validation Checkpoints
1. **After Phase 1**: Verify extraction files are well-formed, merged content is attributed
2. **After Phase 2**: Verify all 121 spec groups are covered
3. **After Phase 3**: Final quality check — no dupes, consistent formatting, all attributions present

## Notes
- This is documentation-only work — no code, no tests, no infrastructure changes
- The agent prompt template will be refined during implementation based on actual extraction quality
- Extraction files are intermediate artifacts stored in `codev/projects/422-documentation-sweep/` and not committed to the repo
