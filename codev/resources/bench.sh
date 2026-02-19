#!/bin/bash
# Codev microbenchmark: same consultation prompt across 3 engines
# Usage: ./bench.sh [iterations]
# Results go to tmp/bench-results/

set -euo pipefail

ITERATIONS=${1:-3}
RESULTS_DIR="$(dirname "$0")/bench-results"
PROMPT="Please analyze the codev codebase and give me a list of potential impactful improvements."

mkdir -p "$RESULTS_DIR"
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
HOSTNAME=$(hostname -s)
OUTFILE="$RESULTS_DIR/bench-${HOSTNAME}-${TIMESTAMP}.txt"

echo "=== Codev Consultation Benchmark ===" | tee "$OUTFILE"
echo "Host: $(hostname)" | tee -a "$OUTFILE"
echo "Date: $(date)" | tee -a "$OUTFILE"
echo "CPU: $(sysctl -n machdep.cpu.brand_string 2>/dev/null || lscpu 2>/dev/null | grep 'Model name' | sed 's/.*: //' || echo 'unknown')" | tee -a "$OUTFILE"
echo "RAM: $(sysctl -n hw.memsize 2>/dev/null | awk '{printf "%.0f GB", $1/1073741824}' || free -h 2>/dev/null | awk '/Mem:/{print $2}' || echo 'unknown')" | tee -a "$OUTFILE"
echo "Iterations: $ITERATIONS" | tee -a "$OUTFILE"
echo "Prompt: $PROMPT" | tee -a "$OUTFILE"
echo "" | tee -a "$OUTFILE"

for engine in gemini codex claude; do
  echo "--- Engine: $engine ---" | tee -a "$OUTFILE"
  for i in $(seq 1 "$ITERATIONS"); do
    echo -n "  Run $i/$ITERATIONS... " | tee -a "$OUTFILE"

    # Capture wall-clock time and output
    RUN_OUT="$RESULTS_DIR/${engine}-run${i}-${TIMESTAMP}.txt"
    START=$(date +%s.%N 2>/dev/null || python3 -c 'import time; print(time.time())')

    consult -m "$engine" --prompt "$PROMPT" > "$RUN_OUT" 2>&1 || true

    END=$(date +%s.%N 2>/dev/null || python3 -c 'import time; print(time.time())')
    ELAPSED=$(python3 -c "print(f'{${END} - ${START}:.1f}')")

    echo "${ELAPSED}s" | tee -a "$OUTFILE"
  done
  echo "" | tee -a "$OUTFILE"
done

echo "=== Summary ===" | tee -a "$OUTFILE"
echo "Results saved to: $OUTFILE"
echo "Individual outputs in: $RESULTS_DIR/"
