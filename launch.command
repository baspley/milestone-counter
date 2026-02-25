#!/bin/bash

# ─────────────────────────────────────────────────────────────
# Milestone Counter — Launch Script (Mac)
#
# Double-click this file in Finder to:
#   1. Start a local web server on port 8080
#   2. Open the app in your default browser automatically
#
# Requirements: Python 3 (pre-installed on all modern Macs)
#
# To stop the server: close the Terminal window that opens,
# or press Ctrl+C inside it.
# ─────────────────────────────────────────────────────────────

# Change to the folder this script lives in.
# This means the script works correctly no matter which Mac
# or which folder you copy the project to.
cd "$(dirname "$0")"

PORT=8080

# Check Python 3 is available (it always is on macOS 10.15+)
if ! command -v python3 &> /dev/null; then
  osascript -e 'display alert "Python 3 not found" message "Please install Python 3 from python.org to run Milestone Counter locally."'
  exit 1
fi

# Check if port 8080 is already in use (e.g. server already running)
if lsof -Pi :$PORT -sTCP:LISTEN -t &> /dev/null; then
  # Server already running — just open the browser
  open "http://localhost:$PORT"
  exit 0
fi

# Start the server in the background, redirect output to a log file
python3 -m http.server $PORT > /tmp/milestone-server.log 2>&1 &
SERVER_PID=$!

# Wait briefly for the server to start before opening the browser
sleep 0.8

# Open the app in the default browser
open "http://localhost:$PORT"

# Keep this script running so the Terminal window stays open.
# When the user closes the Terminal window, the server stops.
echo "──────────────────────────────────────"
echo "  Milestone Counter is running"
echo "  http://localhost:$PORT"
echo ""
echo "  Press Ctrl+C or close this window to stop."
echo "──────────────────────────────────────"

# Wait for the server process — this keeps the script alive
wait $SERVER_PID
