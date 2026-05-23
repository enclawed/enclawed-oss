#!/usr/bin/env bash
# Cross-LLM generalization study: run the in-vivo harness once per
# (provider, model) tuple at the same K and aggregate.
#
# Each invocation writes a tagged report and a tagged CSV under docs/.
# The orthogonal-LLM matrix is then aggregated by the companion
# Python script cross-llm-aggregate.py.
#
# Usage:
#   ENCLAWED_INVIVO_LLM_K=100 ./cross-llm-driver.sh
#
# Env (carried through):
#   ENCLAWED_LICENSE
#   ENCLAWED_INVIVO_GEMINI_KEY
#   ENCLAWED_INVIVO_GROQ_KEY
#   ENCLAWED_INVIVO_OPENROUTER_KEY
#   ENCLAWED_INVIVO_ANTHROPIC_KEY     (optional; rate-limited)
#
# Inputs:
#   ENCLAWED_INVIVO_LLM_K             (default 100) samples per cell

set -euo pipefail

K="${ENCLAWED_INVIVO_LLM_K:-100}"
HARNESS="${ENCLAWED_INVIVO_HARNESS:-$(dirname "$(readlink -f "$0")")/llm-narrative.mjs}"
NODE_BIN="${NODE_BIN:-node}"

if ! command -v "$NODE_BIN" > /dev/null 2>&1; then
  echo "node not on PATH; set NODE_BIN" >&2
  exit 2
fi

# (provider, model, tag) tuples. Tag is used as the report-suffix.
# Order: fast local first, then cloud free, then any paid.
LLMS=(
  "ollama:llama3.2:3b:ol-llama3.2-3b"
  "ollama:llama3.1:8b:ol-llama3.1-8b"
  "ollama:mistral:7b:ol-mistral-7b"
  "ollama:qwen2.5:7b:ol-qwen2.5-7b"
  "ollama:gemma2:9b:ol-gemma2-9b"
  "groq:llama-3.3-70b-versatile:gq-llama3.3-70b"
  "groq:meta-llama/llama-4-scout-17b-16e-instruct:gq-llama4-scout-17b"
  "groq:openai/gpt-oss-120b:gq-gpt-oss-120b"
  "openrouter:meta-llama/llama-3.1-70b-instruct:or-llama3.1-70b"
  "gemini:gemini-2.5-flash:ge-2.5-flash"
)

mkdir -p docs/cross-llm

for entry in "${LLMS[@]}"; do
  provider="${entry%%:*}"
  rest="${entry#*:}"
  model="${rest%:*}"
  tag="${rest##*:}"
  echo
  echo "================================================================"
  echo "[$tag] provider=$provider model=$model K=$K"
  echo "================================================================"
  # Per-provider env-var nameing.
  case "$provider" in
    ollama)     model_env=ENCLAWED_INVIVO_OLLAMA_MODEL ;;
    anthropic)  model_env=ENCLAWED_INVIVO_ANTHROPIC_MODEL ;;
    openrouter) model_env=ENCLAWED_INVIVO_OPENROUTER_MODEL ;;
    gemini)     model_env=ENCLAWED_INVIVO_GEMINI_MODEL ;;
    groq)       model_env=ENCLAWED_INVIVO_GROQ_MODEL ;;
    *) echo "unknown provider $provider"; continue ;;
  esac
  # Per-LLM audit/witness paths so concurrent template runs (e.g. a
  # 1M-sample stress test) writing to the default path never collide
  # with these per-LLM hash chains.
  audit_dir="$HOME/.enclawed-invivo-crossllm/$tag"
  mkdir -p "$audit_dir"

  # Run with dummy chat tokens (the harness STATS_ONLY skips chat post),
  # template-free legit/adversarial both from the LLM. Use `env` so the
  # provider-specific model env-var name (held in $model_env) can be
  # set dynamically; bash's prefix syntax (VAR=val cmd) does not allow
  # the LHS to be expanded from a variable.
  env \
    ENCLAWED_INVIVO_STATS_ONLY=1 \
    ENCLAWED_INVIVO_SAMPLE_SOURCE=llm \
    ENCLAWED_INVIVO_LLM_PROVIDER="$provider" \
    "$model_env=$model" \
    ENCLAWED_INVIVO_SAMPLES_PER_CATEGORY="$K" \
    ENCLAWED_INVIVO_LLM_CONCURRENCY=4 \
    ENCLAWED_INVIVO_OUT_TAG="$tag" \
    ENCLAWED_INVIVO_AUDIT_PATH="$audit_dir/audit.jsonl" \
    ENCLAWED_INVIVO_WITNESS_PATH="$audit_dir/witness.jsonl" \
    ENCLAWED_INVIVO_DISCORD_BOT_TOKEN=dummy \
    ENCLAWED_INVIVO_DISCORD_CHANNEL_ID=000 \
    "$NODE_BIN" "$HARNESS" 2>&1 | tail -20 || echo "($tag failed; continuing)"

  # Move the per-run outputs into docs/cross-llm/
  for f in docs/adversarial-in-vivo-llm-narrative-report-${tag}.md \
           docs/adversarial-in-vivo-samples-${tag}.csv.gz \
           docs/adversarial-in-vivo-samples-${tag}.csv; do
    [ -f "$f" ] && mv "$f" "docs/cross-llm/" || true
  done
done

echo
echo "================================================================"
echo "all runs complete; outputs in docs/cross-llm/"
echo "================================================================"
ls -la docs/cross-llm/ 2>&1
