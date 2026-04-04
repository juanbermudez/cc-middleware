#!/bin/bash
# CC-Middleware Development Loop
# Run with: /loop 10m run-loop
# Or manually: bash run-loop.sh

cd "$(dirname "$0")"

PROMPT=$(cat loop-prompt.md)

claude -p "$PROMPT" \
  --allowedTools "Read,Write,Edit,Glob,Grep,Bash,Agent" \
  --output-format json \
  --permission-mode acceptEdits
