#!/usr/bin/env bash
# Run the full eval suite for every agent version, then refresh the README table.
# Requires ANTHROPIC_API_KEY and DATABASE_URL_READONLY (see .env.example).
#
#   scripts/run-all-evals.sh            # v1..v4 on the default model
#   scripts/run-all-evals.sh v3 v4      # just these versions
#
# Rough cost on claude-opus-5-5: a few cents per question, so ~$5-15 per version
# for 100 questions. Each run stops starting new questions past --max-cost.
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

versions=("$@")
[ ${#versions[@]} -eq 0 ] && versions=(v1 v2 v3 v4)

pnpm -s eval:check-gold
for v in "${versions[@]}"; do
  echo "=== $v ==="
  pnpm -s eval --version "$v" --concurrency "${EVAL_CONCURRENCY:-4}" --max-cost "${EVAL_MAX_COST:-25}"
done
pnpm -s eval:report
echo "Done. Review evals/results/*.json and README.md, then commit them."
