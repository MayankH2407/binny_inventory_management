#!/usr/bin/env bash
# Rolling crash-recovery snapshot. Overwrites progress-checkpoint.md every 60s.
# Run from repo root:  bash scripts/progress-checkpoint.sh &
# Stop with: kill <pid>  (PID printed on start, also written to .progress-checkpoint.pid)

set -u

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

OUT="$REPO_ROOT/progress-checkpoint.md"
PIDFILE="$REPO_ROOT/.progress-checkpoint.pid"
INTERVAL="${CHECKPOINT_INTERVAL:-60}"

echo $$ > "$PIDFILE"
echo "[checkpoint] PID $$ writing to $OUT every ${INTERVAL}s"

write_checkpoint() {
  local ts
  ts="$(date '+%Y-%m-%d %H:%M:%S %z')"

  {
    echo "# Progress Checkpoint (auto-generated)"
    echo
    echo "**Last updated:** $ts"
    echo "**Purpose:** Rolling snapshot for crash recovery. Overwritten every ${INTERVAL}s. Read alongside progress.md."
    echo
    echo "---"
    echo
    echo "## Git status"
    echo '```'
    git status --short --branch 2>&1 || echo "(git status failed)"
    echo '```'
    echo
    echo "## Git diff --stat (working tree vs HEAD)"
    echo '```'
    git diff --stat HEAD 2>&1 | head -50 || echo "(git diff failed)"
    echo '```'
    echo
    echo "## Recently modified files (last 5 minutes)"
    echo '```'
    find . -type f \
      -not -path './node_modules/*' \
      -not -path './*/node_modules/*' \
      -not -path './.git/*' \
      -not -path './*/.next/*' \
      -not -path './*/dist/*' \
      -not -path './*/build/*' \
      -not -path './*/coverage/*' \
      -not -path './*/test-results/*' \
      -not -path './*/playwright-report/*' \
      -mmin -5 -printf '%T@ %TY-%Tm-%Td %TH:%TM  %p\n' 2>/dev/null \
      | sort -rn | head -25 | cut -d' ' -f2-
    echo '```'
    echo
    echo "## Tail of progress.md (last 40 lines)"
    echo '```markdown'
    tail -n 40 progress.md 2>&1 || echo "(progress.md not readable)"
    echo '```'
    echo
    echo "## Recent test output (most recent files in test-results / playwright-report)"
    echo '```'
    local recent
    recent=$(find . -type f \( -name '*.log' -o -name '*.txt' -o -name 'results.json' \) \
      \( -path '*/test-results/*' -o -path '*/playwright-report/*' \) \
      -mmin -30 2>/dev/null | head -5)
    if [ -n "$recent" ]; then
      for f in $recent; do
        echo "--- $f ---"
        tail -n 30 "$f" 2>/dev/null
        echo
      done
    else
      echo "(no recent test output in last 30 min)"
    fi
    echo '```'
    echo
    echo "## Background processes (node / playwright / jest)"
    echo '```'
    if command -v ps >/dev/null 2>&1; then
      ps -ef 2>/dev/null | grep -Ei 'node|playwright|jest|next|expo' | grep -v grep | head -20 || true
    else
      echo "(ps not available)"
    fi
    echo '```'
  } > "$OUT.tmp" 2>&1

  mv -f "$OUT.tmp" "$OUT"
}

trap 'rm -f "$PIDFILE"; echo "[checkpoint] stopped"; exit 0' INT TERM EXIT

while true; do
  write_checkpoint
  sleep "$INTERVAL"
done
