#!/usr/bin/env bash
set -euo pipefail
extension_id="${1:-}"
model="${2:-qwen3.5:4b}"
if [[ ! "$extension_id" =~ ^[a-p]{32}$ ]]; then echo 'Usage: bash scripts/start-local-ai.sh YOUR_EXTENSION_ID [MODEL]' >&2; exit 1; fi
if [[ ! "$model" =~ ^[a-zA-Z0-9._:-]+$ || "$model" == *cloud* ]]; then echo 'Choose a local model tag.' >&2; exit 1; fi
command -v ollama >/dev/null || { echo 'Install Ollama from https://ollama.com/download first.' >&2; exit 1; }
command -v curl >/dev/null || { echo 'curl is required for readiness checks.' >&2; exit 1; }
export OLLAMA_HOST='127.0.0.1:11434'
export OLLAMA_ORIGINS="chrome-extension://$extension_id"
export OLLAMA_NO_CLOUD=1
base='http://127.0.0.1:11434'
if curl --fail --silent --max-time 2 "$base/api/tags" >/dev/null; then
  if ! curl --fail --silent --max-time 5 -H "Origin: $OLLAMA_ORIGINS" "$base/api/tags" >/dev/null; then
    echo 'Quit the existing Ollama app/service yourself, then rerun with the correct extension ID.' >&2; exit 1
  fi
else
  log_dir="${XDG_STATE_HOME:-$HOME/.local/state}/quizit"
  mkdir -p "$log_dir"
  nohup ollama serve >"$log_dir/ollama.log" 2>&1 </dev/null &
  ready=0
  for attempt in {1..60}; do
    if curl --fail --silent --max-time 2 "$base/api/tags" >/dev/null; then ready=1; break; fi
    sleep 0.5
  done
  [[ "$ready" == 1 ]] || { echo "Ollama did not become ready; see $log_dir/ollama.log" >&2; exit 1; }
fi
ollama pull "$model"
printf 'Ready. Select %s in Quizit! Preferences. Generation waits for your click.\n' "$model"
