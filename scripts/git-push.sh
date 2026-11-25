#!/usr/bin/env bash
# Backward-compatible wrapper — prefer: git push-gh / scripts/git-github.sh
exec "$(cd "$(dirname "$0")" && pwd)/git-github.sh" push "$@"
