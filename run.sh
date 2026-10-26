#!/usr/bin/env bash
# macOS / Linux
cd "$(dirname "$0")"
[ -x .venv/bin/python ] || python3 -m venv .venv
[ -f .venv/installed.flag ] || { .venv/bin/pip install -r requirements.txt && touch .venv/installed.flag; }
.venv/bin/python app.py
