#!/usr/bin/env bash
# macOS / Linux
cd "$(dirname "$0")"
[ -x .venv/bin/python ] || python3 -m venv .venv
[ -f .venv/installed.flag ] || { .venv/bin/pip install -r requirements.txt && touch .venv/installed.flag; }
# HOST=0.0.0.0: cho phép các máy khác trong mạng nội bộ truy cập
HOST="${HOST:-0.0.0.0}" .venv/bin/python app.py
