#!/bin/bash
# Wrapper: Run Vite preview (pre-built static bundle) instead of Expo dev server.
# This prevents file watching, HMR, and auto-reloads that would lose game state.
cd /app/web

# Build if no dist folder exists
if [ ! -d "dist" ]; then
  echo "Building Vite app..."
  npm run build
fi

echo "Starting Vite preview server (static bundle, no HMR, no file watching)..."
exec npx vite preview
