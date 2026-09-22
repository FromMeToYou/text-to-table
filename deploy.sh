#!/usr/bin/env bash
# Deploy static export to GitHub Pages (gh-pages branch). Usage: npm run deploy
set -euo pipefail
cd "$(dirname "$0")"
BASE_PATH=/text-to-table npm run build
touch out/.nojekyll
cd out && rm -rf .git && git init -q && git checkout -q -b gh-pages && git add -A \
  && git commit -qm "deploy $(date -u +%Y-%m-%dT%H:%MZ)" \
  && git push -q -f https://github.com/FromMeToYou/text-to-table.git gh-pages:gh-pages && rm -rf .git
echo "deployed → https://frommetoyou.github.io/text-to-table/"
