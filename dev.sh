#!/usr/bin/env bash
# Runs the game server and the web client together. Ctrl+C stops both.
# First run installs everything. No OpenAI key? Try: BLY_MOCK_AI=1 ./dev.sh
set -e
cd "$(dirname "$0")"
if [ ! -d .venv ]; then
  python3 -m venv .venv
  .venv/bin/pip install -q -r server/requirements.txt
fi
[ -d web/node_modules ] || (cd web && npm install)
.venv/bin/uvicorn server.app:app --port 8000 --reload --reload-dir server &
API=$!
trap 'kill $API 2>/dev/null' EXIT
cd web && npx vite --port 5173
