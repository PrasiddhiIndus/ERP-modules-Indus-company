#!/usr/bin/env bash
# Run any git command with a direct path to GitHub (PrasiddhiIndus remotes).
#
# Cursor / some sandboxes inject HTTP(S)_PROXY → 127.0.0.1. When that local
# proxy is down, `git pull/fetch/push` fails with:
#   Failed to connect to github.com port 443 … Couldn't connect to server
#
# Usage:
#   ./scripts/git-github.sh pull origin staging
#   ./scripts/git-github.sh fetch origin
#   ./scripts/git-github.sh push origin rahul
# Or via aliases: git pull-gh / git fetch-gh / git push-gh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [ "$#" -eq 0 ]; then
  echo "Usage: $0 <git-args…>   e.g. $0 pull origin staging" >&2
  exit 2
fi

saved_http="${HTTP_PROXY-}"
saved_https="${HTTPS_PROXY-}"
saved_all="${ALL_PROXY-}"
saved_git_http="${GIT_HTTP_PROXY-}"
saved_git_https="${GIT_HTTPS_PROXY-}"

GITHUB_NO_PROXY="github.com,.github.com,api.github.com,raw.githubusercontent.com,objects.githubusercontent.com,gist.github.com,codeload.github.com"

# Never open vim/vi for merge messages in Cursor terminals (that was hanging pulls).
export GIT_MERGE_AUTOEDIT="${GIT_MERGE_AUTOEDIT:-no}"
export GIT_EDITOR="${GIT_EDITOR:-true}"
export EDITOR="${EDITOR:-true}"
export VISUAL="${VISUAL:-true}"

try_git() {
  git -c core.editor=true "$@"
}

# 1) Direct to GitHub — ignore Cursor/local dead proxies
export NO_PROXY="${GITHUB_NO_PROXY}${NO_PROXY:+,$NO_PROXY}"
export no_proxy="$NO_PROXY"
unset HTTP_PROXY HTTPS_PROXY ALL_PROXY http_proxy https_proxy all_proxy \
  GIT_HTTP_PROXY GIT_HTTPS_PROXY 2>/dev/null || true

if try_git "$@"; then
  exit 0
fi
status=$?

# 2) Fall back to a live proxy if one was configured
proxy="${saved_https:-${saved_http:-${saved_all:-${saved_git_https:-${saved_git_http:-}}}}}"
if [ -n "$proxy" ]; then
  echo "Direct GitHub failed; retrying via proxy ${proxy}…" >&2
  export HTTP_PROXY="$proxy" HTTPS_PROXY="$proxy" ALL_PROXY="$proxy"
  export http_proxy="$proxy" https_proxy="$proxy" all_proxy="$proxy"
  export GIT_HTTP_PROXY="$proxy" GIT_HTTPS_PROXY="$proxy"
  unset NO_PROXY no_proxy
  try_git "$@"
  exit $?
fi

exit "$status"
