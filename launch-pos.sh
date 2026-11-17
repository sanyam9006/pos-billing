#!/bin/bash

# Detect Node / NVM / Homebrew path
if [ -d "$HOME/.nvm/versions/node" ]; then
  LATEST_NODE=$(ls "$HOME/.nvm/versions/node" 2>/dev/null | tail -1)
  if [ -n "$LATEST_NODE" ]; then
    export PATH="$HOME/.nvm/versions/node/$LATEST_NODE/bin:$PATH"
  fi
fi
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"

PROJECT_DIR="/Users/apple/.gemini/antigravity-ide/scratch/pos-billing"
cd "$PROJECT_DIR" || exit 1

# Check if server is already running
if ! curl -s http://localhost:3001/api/health > /dev/null 2>&1; then
  # Start servers in background
  npm run dev > "$HOME/.pos-billing.log" 2>&1 &
  
  # Wait up to 10 seconds for backend to be ready
  for i in {1..20}; do
    if curl -s http://localhost:3001/api/health > /dev/null 2>&1; then
      break
    fi
    sleep 0.5
  done
fi

# Give Vite frontend a moment
sleep 1

# Open in Brave as a dedicated App window if available, otherwise open default browser
if [ -d "/Applications/Brave Browser.app" ]; then
  open -a "/Applications/Brave Browser.app" --args --app=http://localhost:5173
elif [ -d "/Applications/Google Chrome.app" ]; then
  open -a "/Applications/Google Chrome.app" --args --app=http://localhost:5173
else
  open "http://localhost:5173"
fi
