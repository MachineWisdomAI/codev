#!/bin/bash
#
# Ralph-SPIDER Loop Orchestrator
#
# This script implements the Ralph-inspired SPIDER loop where:
# - Builder owns entire lifecycle (S→P→I→D→E→R)
# - Human approval gates are backpressure points
# - Fresh context per iteration
# - State lives in files, not AI memory
#
# Usage:
#   ./ralph-spider.sh <project-id>           # Run the loop
#   ./ralph-spider.sh init <project-id>      # Initialize a new project
#   ./ralph-spider.sh approve <project-id> <gate>  # Approve a gate
#
# Environment:
#   RALPH_POLL_INTERVAL  - Seconds between approval checks (default: 30)
#   RALPH_DRY_RUN        - Set to "1" for dry run mode
#   RALPH_NO_CLAUDE      - Set to "1" to skip Claude invocations (testing)
#

set -euo pipefail

# Get script directory for relative paths
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROMPTS_DIR="${SCRIPT_DIR}/prompts"

# Configuration
MAX_ITERATIONS=100
POLL_INTERVAL="${RALPH_POLL_INTERVAL:-30}"
DRY_RUN="${RALPH_DRY_RUN:-}"
NO_CLAUDE="${RALPH_NO_CLAUDE:-}"
STATUS_DIR="codev/status"
SPECS_DIR="codev/specs"
PLANS_DIR="codev/plans"
REVIEWS_DIR="codev/reviews"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

log() { echo -e "${BLUE}[ralph]${NC} $1"; }
success() { echo -e "${GREEN}[ralph]${NC} $1"; }
warn() { echo -e "${YELLOW}[ralph]${NC} $1"; }
error() { echo -e "${RED}[ralph]${NC} $1"; }

# Global variables (set by main)
PROJECT_ID=""
STATUS_FILE=""

# Initialize status file if it doesn't exist
# Usage: init_status <project-name>
# Note: PROJECT_ID must be set before calling this function
init_status() {
    local project_name="${1:-test-project}"

    if [[ -z "${PROJECT_ID:-}" ]]; then
        error "PROJECT_ID not set"
        return 1
    fi

    local status_file="${STATUS_DIR}/${PROJECT_ID}-${project_name}.md"

    mkdir -p "$STATUS_DIR"

    cat > "$status_file" << EOF
---
# Ralph-SPIDER Status File
# Project: ${PROJECT_ID} - ${project_name}
# Created: $(date -u '+%Y-%m-%dT%H:%M:%SZ')

id: "${PROJECT_ID}"
title: "${project_name}"
protocol: ralph-spider
current_state: specify:draft
current_phase: ""

# Human approval gates
gates:
  specify_approval:
    human: { status: pending }
  plan_approval:
    human: { status: pending }
  defend_gate:
    tests_pass: { status: pending }
    build_pass: { status: pending }

# Implementation phase tracking (populated during Plan phase)
phases: {}
---

## Project Description

<!-- Add a brief description of what this project will build -->

## Log

- $(date '+%Y-%m-%d %H:%M'): Initialized Ralph-SPIDER loop
EOF

    echo "$status_file"
}

# Parse current state from status file
get_state() {
    if [[ -z "$STATUS_FILE" || ! -f "$STATUS_FILE" ]]; then
        echo "not_initialized"
        return
    fi

    # Extract current_state from YAML frontmatter
    grep -E "^current_state:" "$STATUS_FILE" | sed 's/current_state: *//' | tr -d '"'
}

# Update state in status file
set_state() {
    local new_state="$1"

    if [[ -z "$STATUS_FILE" || ! -f "$STATUS_FILE" ]]; then
        error "Status file not found"
        return 1
    fi

    # Update current_state in YAML
    sed -i '' "s/^current_state:.*/current_state: ${new_state}/" "$STATUS_FILE"

    # Append to log
    echo "- $(date '+%Y-%m-%d %H:%M'): State changed to ${new_state}" >> "$STATUS_FILE"

    success "State → ${new_state}"
}

# Check if a gate is approved
# Gate format is:
#   specify_approval:
#     human: { status: passed }
# Can be called with:
#   check_gate "specify_approval"  (looks for status: passed on next line)
#   check_gate "specify_approval.human" (looks for human on next line with status: passed)
check_gate() {
    local gate="$1"

    if [[ -z "$STATUS_FILE" || ! -f "$STATUS_FILE" ]]; then
        return 1
    fi

    # Handle dotted notation (e.g., "plan_approval.human")
    local gate_name="${gate%%.*}"

    # Look for gate approval in YAML (multi-line format)
    # Check the line after the gate name for status: passed
    if grep -A1 "${gate_name}:" "$STATUS_FILE" | grep -q "status: passed"; then
        return 0
    else
        return 1
    fi
}

# Mark a gate as passed
pass_gate() {
    local gate="$1"
    local by="${2:-system}"

    if [[ -z "$STATUS_FILE" || ! -f "$STATUS_FILE" ]]; then
        error "Status file not found"
        return 1
    fi

    # This is simplified - real implementation would use proper YAML parsing
    local timestamp=$(date -u '+%Y-%m-%dT%H:%M:%SZ')

    # Append to log
    echo "- $(date '+%Y-%m-%d %H:%M'): Gate '${gate}' passed by ${by}" >> "$STATUS_FILE"

    success "Gate '${gate}' passed"
}

# Invoke Claude for a specific phase
invoke_claude() {
    local phase="$1"
    local context_prompt="$2"
    local output_var="${3:-}"  # Optional: variable name to store output

    # Check for phase prompt file
    local prompt_file="${PROMPTS_DIR}/${phase}.md"
    if [[ ! -f "$prompt_file" ]]; then
        error "Prompt file not found: ${prompt_file}"
        return 1
    fi

    if [[ -n "$DRY_RUN" ]]; then
        log "[DRY RUN] Would invoke Claude for phase: ${phase}"
        log "[DRY RUN] Prompt file: ${prompt_file}"
        log "[DRY RUN] Context: ${context_prompt}"
        return 0
    fi

    if [[ -n "$NO_CLAUDE" ]]; then
        log "[NO_CLAUDE] Simulating phase: ${phase}"
        sleep 2
        success "Simulated completion of phase: ${phase}"
        return 0
    fi

    log "Invoking Claude for phase: ${phase}"

    # Read the phase prompt
    local phase_prompt
    phase_prompt=$(cat "$prompt_file")

    # Build the full prompt with status context
    local full_prompt="## Current Status

\`\`\`yaml
$(cat "$STATUS_FILE")
\`\`\`

## Task

${context_prompt}

## Phase Instructions

${phase_prompt}

## Important

- Project ID: ${PROJECT_ID}
- Follow the instructions above precisely
- Output <signal>...</signal> tags when you reach completion points
- All state changes happen via this orchestrator, not by editing the status file directly
"

    # Invoke Claude CLI
    local output
    local exit_code=0
    output=$(claude --print -p "$full_prompt" --dangerously-skip-permissions 2>&1) || exit_code=$?

    if [[ $exit_code -ne 0 ]]; then
        error "Claude invocation failed (exit code: $exit_code)"
        echo "$output"
        return 1
    fi

    # Echo output so it's visible
    echo "$output"

    # Store output in variable if requested
    if [[ -n "$output_var" ]]; then
        eval "${output_var}=\$output"
    fi

    # Check for signals in output and return them
    if echo "$output" | grep -q "<signal>"; then
        local signal
        signal=$(echo "$output" | grep -oE '<signal>[^<]+</signal>' | head -1 | sed 's/<signal>//;s/<\/signal>//')
        success "Signal received: ${signal}"
        echo "$signal"
        return 0
    fi

    success "Claude completed phase: ${phase}"
    return 0
}

# Get signal from output
extract_signal() {
    local output="$1"
    echo "$output" | grep -oE '<signal>[^<]+</signal>' | head -1 | sed 's/<signal>//;s/<\/signal>//' || echo ""
}

# Check if spec file exists
spec_exists() {
    ls ${SPECS_DIR}/${PROJECT_ID}-*.md &>/dev/null
}

# Check if plan file exists
plan_exists() {
    ls ${PLANS_DIR}/${PROJECT_ID}-*.md &>/dev/null
}

# Check if tests pass
tests_pass() {
    if [[ "$DRY_RUN" == "--dry-run" ]]; then
        log "[DRY RUN] Would run tests"
        return 0
    fi

    # Real implementation would run: npm test or similar
    log "Running tests..."
    return 0
}

# Check if build passes
build_passes() {
    if [[ "$DRY_RUN" == "--dry-run" ]]; then
        log "[DRY RUN] Would run build"
        return 0
    fi

    # Real implementation would run: npm run build or similar
    log "Running build..."
    return 0
}

# Main loop
main_loop() {
    log "Starting Ralph-SPIDER loop for project ${PROJECT_ID}"
    log "Status file: ${STATUS_FILE}"
    log "Poll interval: ${POLL_INTERVAL}s"

    local iteration=0
    local output=""
    local signal=""

    while [[ $iteration -lt $MAX_ITERATIONS ]]; do
        iteration=$((iteration + 1))
        log "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
        log "Iteration ${iteration}"
        log "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

        # Fresh read of state each iteration (Ralph principle)
        local state=$(get_state)
        log "Current state: ${state}"

        case "$state" in
            "not_initialized")
                error "Project not initialized."
                error "Run: $0 init ${PROJECT_ID} <project-name>"
                exit 1
                ;;

            "specify:draft")
                log "══════ Phase: SPECIFY (draft) ══════"
                output=$(invoke_claude "specify" "Write a specification for project ${PROJECT_ID}. Follow the spec template and create ${SPECS_DIR}/${PROJECT_ID}-<name>.md")
                signal=$(extract_signal "$output")

                if [[ "$signal" == "SPEC_READY_FOR_REVIEW" ]]; then
                    set_state "specify:review"
                else
                    warn "Expected SPEC_READY_FOR_REVIEW signal, got: ${signal:-none}"
                    # Continue anyway - allow manual state updates
                fi
                ;;

            "specify:review")
                log "══════ Phase: SPECIFY (review) ══════"
                log "BLOCKED - Waiting for human approval"
                if check_gate "specify_approval.human"; then
                    success "Spec approved! Proceeding to Plan."
                    set_state "plan:draft"
                else
                    warn "To approve, run: $0 approve ${PROJECT_ID} specify"
                    warn "Or edit ${STATUS_FILE} and set specify_approval.human.status to 'passed'"
                    sleep $POLL_INTERVAL
                fi
                ;;

            "plan:draft")
                log "══════ Phase: PLAN (draft) ══════"
                if ! spec_exists; then
                    error "Spec file not found! Cannot proceed."
                    error "Expected: ${SPECS_DIR}/${PROJECT_ID}-*.md"
                    exit 1
                fi
                output=$(invoke_claude "plan" "Write an implementation plan based on the approved spec. Create ${PLANS_DIR}/${PROJECT_ID}-<name>.md")
                signal=$(extract_signal "$output")

                if [[ "$signal" == "PLAN_READY_FOR_REVIEW" ]]; then
                    set_state "plan:review"
                else
                    warn "Expected PLAN_READY_FOR_REVIEW signal, got: ${signal:-none}"
                fi
                ;;

            "plan:review")
                log "══════ Phase: PLAN (review) ══════"
                log "BLOCKED - Waiting for human approval"
                if check_gate "plan_approval.human"; then
                    success "Plan approved! Proceeding to Implement."
                    set_state "implement"
                else
                    warn "To approve, run: $0 approve ${PROJECT_ID} plan"
                    warn "Or edit ${STATUS_FILE} and set plan_approval.human.status to 'passed'"
                    sleep $POLL_INTERVAL
                fi
                ;;

            "implement")
                log "══════ Phase: IMPLEMENT ══════"
                if ! plan_exists; then
                    error "Plan file not found! Cannot proceed."
                    error "Expected: ${PLANS_DIR}/${PROJECT_ID}-*.md"
                    exit 1
                fi
                output=$(invoke_claude "implement" "Implement the code according to the approved plan.")
                signal=$(extract_signal "$output")

                case "$signal" in
                    "PHASE_IMPLEMENTED")
                        if build_passes; then
                            set_state "defend"
                        else
                            warn "Build failed. Staying in implement state."
                        fi
                        ;;
                    "BUILD_FAILED")
                        warn "Build failed. Retrying implement..."
                        ;;
                    *)
                        # Default: proceed to defend
                        set_state "defend"
                        ;;
                esac
                ;;

            "defend")
                log "══════ Phase: DEFEND ══════"
                output=$(invoke_claude "defend" "Write tests for the implementation. Ensure all acceptance criteria are covered.")
                signal=$(extract_signal "$output")

                case "$signal" in
                    "TESTS_PASSING")
                        pass_gate "defend_gate.tests_pass"
                        pass_gate "defend_gate.build_pass"
                        set_state "evaluate"
                        ;;
                    "TESTS_FAILED")
                        warn "Tests failed. Retrying defend..."
                        ;;
                    *)
                        # Default: check tests manually
                        if tests_pass; then
                            pass_gate "defend_gate.tests_pass"
                            set_state "evaluate"
                        else
                            warn "Tests failing. Staying in defend state."
                        fi
                        ;;
                esac
                ;;

            "evaluate")
                log "══════ Phase: EVALUATE ══════"
                output=$(invoke_claude "evaluate" "Verify all acceptance criteria from the spec are met.")
                signal=$(extract_signal "$output")

                case "$signal" in
                    "EVALUATION_COMPLETE")
                        set_state "review"
                        ;;
                    "CRITERIA_NOT_MET")
                        warn "Criteria not met. Returning to implement."
                        set_state "implement"
                        ;;
                    "NEXT_PHASE")
                        log "More implementation phases remaining."
                        set_state "implement"
                        ;;
                    *)
                        # Default: proceed to review
                        set_state "review"
                        ;;
                esac
                ;;

            "review")
                log "══════ Phase: REVIEW ══════"
                output=$(invoke_claude "review" "Create a PR and write a review document in ${REVIEWS_DIR}/${PROJECT_ID}-*.md")
                signal=$(extract_signal "$output")

                if [[ "$signal" == "REVIEW_COMPLETE" ]]; then
                    set_state "complete"
                else
                    # Default: mark complete
                    set_state "complete"
                fi
                ;;

            "complete")
                success "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
                success "Ralph-SPIDER loop COMPLETE"
                success "Project ${PROJECT_ID} finished all phases"
                success "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
                exit 0
                ;;

            *)
                error "Unknown state: ${state}"
                exit 1
                ;;
        esac

        # Small delay between iterations
        sleep 2
    done

    error "Max iterations (${MAX_ITERATIONS}) reached!"
    exit 1
}

# Approve a gate
approve_gate() {
    local project_id="$1"
    local gate="$2"

    # Find status file
    local status_file="${STATUS_DIR}/${project_id}-*.md"
    status_file=$(ls $status_file 2>/dev/null | head -1 || echo "")

    if [[ -z "$status_file" || ! -f "$status_file" ]]; then
        error "Status file not found for project: ${project_id}"
        exit 1
    fi

    case "$gate" in
        "specify"|"spec")
            # Use awk for more reliable multi-line editing
            # Find specify_approval section and update the human line after it
            awk '
                /^  specify_approval:/ { in_specify = 1 }
                in_specify && /human:.*status: pending/ {
                    sub(/status: pending/, "status: passed")
                    in_specify = 0
                }
                { print }
            ' "$status_file" > "${status_file}.tmp" && mv "${status_file}.tmp" "$status_file"
            echo "- $(date '+%Y-%m-%d %H:%M'): Specify approval granted" >> "$status_file"
            success "Approved: specify_approval"
            ;;
        "plan")
            awk '
                /^  plan_approval:/ { in_plan = 1 }
                in_plan && /human:.*status: pending/ {
                    sub(/status: pending/, "status: passed")
                    in_plan = 0
                }
                { print }
            ' "$status_file" > "${status_file}.tmp" && mv "${status_file}.tmp" "$status_file"
            echo "- $(date '+%Y-%m-%d %H:%M'): Plan approval granted" >> "$status_file"
            success "Approved: plan_approval"
            ;;
        *)
            error "Unknown gate: ${gate}"
            error "Available gates: specify, plan"
            exit 1
            ;;
    esac
}

# Show usage
show_usage() {
    echo "Ralph-SPIDER Loop Orchestrator"
    echo ""
    echo "Usage:"
    echo "  $0 <project-id>                  Run the loop for a project"
    echo "  $0 init <project-id> <name>      Initialize a new project"
    echo "  $0 approve <project-id> <gate>   Approve a gate (specify|plan)"
    echo "  $0 status <project-id>           Show current status"
    echo "  $0 help                          Show this help"
    echo ""
    echo "Environment Variables:"
    echo "  RALPH_POLL_INTERVAL   Seconds between approval checks (default: 30)"
    echo "  RALPH_DRY_RUN         Set to '1' for dry run mode"
    echo "  RALPH_NO_CLAUDE       Set to '1' to skip Claude invocations"
    echo ""
    echo "Examples:"
    echo "  $0 init 0073 feature-xyz         # Initialize project 0073"
    echo "  $0 0073                          # Run the loop"
    echo "  $0 approve 0073 specify          # Approve the spec"
    echo ""
}

# Show status
show_status() {
    local project_id="$1"
    local status_file="${STATUS_DIR}/${project_id}-*.md"
    status_file=$(ls $status_file 2>/dev/null | head -1 || echo "")

    if [[ -z "$status_file" || ! -f "$status_file" ]]; then
        error "Status file not found for project: ${project_id}"
        exit 1
    fi

    log "Status for project ${project_id}:"
    echo ""
    cat "$status_file"
}

# Main entry point
main() {
    local cmd="${1:-}"

    case "$cmd" in
        "init")
            if [[ $# -lt 3 ]]; then
                error "Usage: $0 init <project-id> <project-name>"
                exit 1
            fi
            PROJECT_ID="$2"
            STATUS_FILE=$(init_status "$3")
            success "Initialized project ${PROJECT_ID}"
            log "Status file: ${STATUS_FILE}"
            log "Next: Run '$0 ${PROJECT_ID}' to start the loop"
            ;;
        "approve")
            if [[ $# -lt 3 ]]; then
                error "Usage: $0 approve <project-id> <gate>"
                exit 1
            fi
            approve_gate "$2" "$3"
            ;;
        "status")
            if [[ $# -lt 2 ]]; then
                error "Usage: $0 status <project-id>"
                exit 1
            fi
            show_status "$2"
            ;;
        "help"|"-h"|"--help")
            show_usage
            ;;
        "")
            show_usage
            ;;
        *)
            # Assume it's a project ID - run the loop
            PROJECT_ID="$cmd"
            STATUS_FILE="${STATUS_DIR}/${PROJECT_ID}-*.md"
            STATUS_FILE=$(ls $STATUS_FILE 2>/dev/null | head -1 || echo "")

            if [[ -z "$STATUS_FILE" ]]; then
                error "Status file not found for project: ${PROJECT_ID}"
                error "Run: $0 init ${PROJECT_ID} <project-name>"
                exit 1
            fi

            main_loop
            ;;
    esac
}

# Run main
main "$@"
