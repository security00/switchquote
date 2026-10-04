#!/usr/bin/env bash
# Refuse to deploy unless this checkout is the switchquote Worker in the potter account,
# pushed from security00/switchquote. Guards against deploying over another Worker after
# copying files or workflows from a sibling repo.
set -euo pipefail
grep -qx 'name = "switchquote"' wrangler.toml
grep -qx 'service = "switchquote"' wrangler.toml
grep -qx 'database_name = "switchquote"' wrangler.toml
grep -qx 'account_id = "faae494a756090f5f9c0ad7b8d1ddb88"' wrangler.toml
if [ -n "${GITHUB_REPOSITORY:-}" ]; then
  test "$GITHUB_REPOSITORY" = "security00/switchquote"
fi
echo "Worker identity OK: switchquote"
