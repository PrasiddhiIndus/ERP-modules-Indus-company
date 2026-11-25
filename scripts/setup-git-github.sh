#!/usr/bin/env bash
# One-time per clone: durable GitHub (Prasiddhi) remotes through Cursor proxies.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

chmod +x scripts/git-github.sh scripts/git-push.sh

# Dead/empty url-specific proxy breaks github.com in Cursor terminals
git config --local --unset-all http.https://github.com.proxy 2>/dev/null || true

git config --local pull.rebase false
git config --local alias.fetch-gh '!bash scripts/git-github.sh fetch'
git config --local alias.pull-gh '!bash scripts/git-github.sh pull'
git config --local alias.push-gh '!bash scripts/git-github.sh push'

echo "OK — use:  git fetch-gh | git pull-gh origin staging | git push-gh origin HEAD"
echo "Or:        ./scripts/git-github.sh pull origin staging"
