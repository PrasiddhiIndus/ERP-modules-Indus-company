#!/usr/bin/env bash
# Reliable git push from Cursor or system terminals.
# Cursor often injects HTTP(S)_PROXY to 127.0.0.1; when that proxy is down, push fails.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

ARGS=("$@")
if [ "${#ARGS[@]}" -eq 0 ]; then
  ARGS=(origin HEAD)
fi

saved_http="${HTTP_PROXY-}"
saved_https="${HTTPS_PROXY-}"
saved_all="${ALL_PROXY-}"

try_push() {
  git push "${ARGS[@]}"
}

# 1) Prefer direct GitHub (ignore sandbox proxies)
export NO_PROXY="github.com,.github.com,api.github.com,raw.githubusercontent.com,objects.githubusercontent.com,gist.github.com${NO_PROXY:+,$NO_PROXY}"
export no_proxy="$NO_PROXY"
unset HTTP_PROXY HTTPS_PROXY ALL_PROXY http_proxy https_proxy all_proxy GIT_HTTP_PROXY GIT_HTTPS_PROXY 2>/dev/null || true

if try_push; then
  exit 0
fi

# 2) Fall back to a live Cursor/local proxy if one was configured
proxy="${saved_https:-${saved_http:-${saved_all:-}}}"
if [ -n "$proxy" ]; then
  echo "Direct GitHub push failed; retrying via proxy ${proxy}…" >&2
  export HTTP_PROXY="$proxy" HTTPS_PROXY="$proxy" ALL_PROXY="$proxy"
  export http_proxy="$proxy" https_proxy="$proxy" all_proxy="$proxy"
  export GIT_HTTP_PROXY="$proxy" GIT_HTTPS_PROXY="$proxy"
  unset NO_PROXY no_proxy
  try_push
  exit $?
fi

exit 1
