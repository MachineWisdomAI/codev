# Spec 422: Documentation Sweep — arch.md and lessons-learned.md

## Problem

`codev/resources/arch.md` and `codev/resources/lessons-learned.md` are out of date. Many specs, plans, and reviews contain architectural decisions and lessons that were never extracted into these central documents.

## Solution

Sweep through all existing spec, plan, and review documents to bring both files fully up to date using a two-pass approach:

### Pass 1: Incremental Extraction
Go through every document in `codev/specs/`, `codev/plans/`, and `codev/reviews/` chronologically. For each:
- Extract architectural decisions, patterns, and component documentation → update arch.md
- Extract lessons learned, debugging insights, and process improvements → update lessons-learned.md
- Append incrementally — don't reorganize yet, just capture everything

### Pass 2: Refinement (Iterative)
Once all documents have been processed:
- Remove duplicate sections across each document
- Align inconsistencies (terminology, formatting, structure)
- Consolidate related entries
- Iterate until no more meaningful edits remain and both documents are as refined as possible

## Notes

- This is a one-off catch-up project — going forward, Spec 395 ensures every SPIR review updates these docs
- Future consideration: build this sweep into the MAINTAIN protocol for periodic reconciliation

## Acceptance Criteria

- [ ] Every spec, plan, and review document has been read and relevant content extracted
- [ ] arch.md reflects all architectural decisions from the project's history
- [ ] lessons-learned.md captures all generalizable wisdom from reviews
- [ ] No duplicate entries in either document
- [ ] Both documents are internally consistent (terminology, formatting)
- [ ] Iterative refinement complete — no more meaningful edits possible
