#!/bin/bash
#
# Checklister Guard Hook
# Blocks Edit/Write operations based on current SPIDER phase
#
# Context detection:
#   - Builder context: In .builders/ directory, start at implement phase
#   - Architect context: In main repo, full S-P-IDE-R flow
#
# Exit codes:
#   0 - Allow the operation
#   2 - Block the operation (stderr shown to Claude)
#

set -e

# Read JSON input from stdin
INPUT=$(cat)

# Extract file path from tool input
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty')

if [ -z "$FILE_PATH" ]; then
  # No file path - allow (might be a different tool format)
  exit 0
fi

# Find the project root (where codev/ directory is)
PROJECT_ROOT="$CLAUDE_PROJECT_DIR"
if [ -z "$PROJECT_ROOT" ]; then
  PROJECT_ROOT=$(pwd)
fi

# Detect if we're in a Builder context (worktree in .builders/)
IS_BUILDER=false
if [[ "$PROJECT_ROOT" =~ \.builders/ ]]; then
  IS_BUILDER=true
fi

# Look for any active checklist
CHECKLISTS_DIR="$PROJECT_ROOT/codev/checklists"

if [ ! -d "$CHECKLISTS_DIR" ]; then
  # No checklists directory - checklister not enabled, allow everything
  exit 0
fi

# Find the most recent checklist (simple heuristic)
CHECKLIST=$(ls -t "$CHECKLISTS_DIR"/*.json 2>/dev/null | head -1)

if [ -z "$CHECKLIST" ] || [ ! -f "$CHECKLIST" ]; then
  # No checklist file - allow everything
  exit 0
fi

# Read current phase from checklist
CURRENT_PHASE=$(jq -r '.current_phase // "implement"' "$CHECKLIST")

# Normalize file path to be relative to project root
REL_PATH="${FILE_PATH#$PROJECT_ROOT/}"

# =============================================================================
# BUILDER CONTEXT RULES
# Builders are spawned by Architect after S+P phases are complete.
# They should NEVER edit specs or plans - that's Architect's domain.
# =============================================================================

if [ "$IS_BUILDER" = true ]; then
  # RULE 1: Builders can NEVER edit specs or plans
  if [[ "$REL_PATH" =~ ^codev/specs/.*\.md$ ]]; then
    echo "⚠️ BLOCKED by Checklister (Builder Context)" >&2
    echo "" >&2
    echo "Attempted to edit: $REL_PATH" >&2
    echo "" >&2
    echo "Builders cannot edit spec files - specs are the Architect's domain." >&2
    echo "If you need spec changes, notify the Architect via:" >&2
    echo "  af send architect \"Spec needs update: [reason]\"" >&2
    exit 2
  fi

  if [[ "$REL_PATH" =~ ^codev/plans/.*\.md$ ]]; then
    echo "⚠️ BLOCKED by Checklister (Builder Context)" >&2
    echo "" >&2
    echo "Attempted to edit: $REL_PATH" >&2
    echo "" >&2
    echo "Builders cannot edit plan files - plans are the Architect's domain." >&2
    echo "If the plan needs update based on implementation findings, notify the Architect:" >&2
    echo "  af send architect \"Plan needs update: [reason]\"" >&2
    exit 2
  fi

  # RULE 2: Always allow checklists and .claude config
  if [[ "$REL_PATH" =~ ^codev/checklists/ ]] || \
     [[ "$REL_PATH" =~ ^\\.claude/ ]]; then
    exit 0
  fi

  # RULE 3: Phase-based access for implementation files
  case "$CURRENT_PHASE" in
    implement|defend|evaluate)
      # In IDE phases, allow most implementation files
      # Reviews go in codev/reviews/ which is allowed
      if [[ "$REL_PATH" =~ ^codev/reviews/.*\.md$ ]]; then
        exit 0
      fi
      # Allow all other files (src/, tests/, etc.)
      exit 0
      ;;

    review)
      # In review phase, allow reviews and docs
      exit 0
      ;;

    specify|plan)
      # Builder should never be in specify/plan phase - this indicates a bug
      # Allow anyway but warn
      echo "⚠️ WARNING: Builder is in $CURRENT_PHASE phase (unexpected)" >&2
      echo "Builders should start at 'implement' phase." >&2
      echo "Allowing operation but please check your checklist state." >&2
      exit 0
      ;;

    *)
      # Unknown phase - allow
      exit 0
      ;;
  esac
fi

# =============================================================================
# ARCHITECT CONTEXT RULES (original behavior)
# Full S-P-IDE-R flow in the main repository
# =============================================================================

case "$CURRENT_PHASE" in
  specify)
    # Only allow edits to specs/*.md and codev/checklists/
    if [[ "$REL_PATH" =~ ^codev/specs/.*\.md$ ]] || \
       [[ "$REL_PATH" =~ ^codev/checklists/ ]] || \
       [[ "$REL_PATH" =~ ^\\.claude/ ]]; then
      exit 0
    else
      echo "⚠️ BLOCKED by Checklister" >&2
      echo "" >&2
      echo "Current phase: SPECIFY" >&2
      echo "Attempted to edit: $REL_PATH" >&2
      echo "" >&2
      echo "In Specify phase, you can only edit:" >&2
      echo "  - codev/specs/*.md" >&2
      echo "  - codev/checklists/*" >&2
      echo "" >&2
      echo "To proceed to Plan phase, complete all spec_* items and run:" >&2
      echo "  /checklister gate plan" >&2
      exit 2
    fi
    ;;

  plan)
    # Allow specs and plans
    if [[ "$REL_PATH" =~ ^codev/specs/.*\.md$ ]] || \
       [[ "$REL_PATH" =~ ^codev/plans/.*\.md$ ]] || \
       [[ "$REL_PATH" =~ ^codev/checklists/ ]] || \
       [[ "$REL_PATH" =~ ^\\.claude/ ]]; then
      exit 0
    else
      echo "⚠️ BLOCKED by Checklister" >&2
      echo "" >&2
      echo "Current phase: PLAN" >&2
      echo "Attempted to edit: $REL_PATH" >&2
      echo "" >&2
      echo "In Plan phase, you can only edit:" >&2
      echo "  - codev/specs/*.md" >&2
      echo "  - codev/plans/*.md" >&2
      echo "  - codev/checklists/*" >&2
      echo "" >&2
      echo "To proceed to Implement phase, complete all plan_* items and run:" >&2
      echo "  /checklister gate implement" >&2
      exit 2
    fi
    ;;

  implement|defend|evaluate)
    # In IDE phases, allow most things except maybe some protected files
    # For now, allow everything during implementation
    exit 0
    ;;

  review)
    # Allow reviews and docs
    exit 0
    ;;

  *)
    # Unknown phase - allow
    exit 0
    ;;
esac
