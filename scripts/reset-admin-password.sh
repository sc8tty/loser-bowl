#!/usr/bin/env bash
# Resets ADMIN_PASSWORD_HASH in .env.local.
#
# The password is read without echo and never written to disk, printed, or put
# in shell history. Only the resulting bcrypt hash is stored.
#
# Next.js expands `$` in .env files, which mangles a bcrypt hash ($2b$...), so
# the local file needs every `$` backslash-escaped. Vercel's env storage does
# NOT want the escaping — it needs the raw hash. This script writes the escaped
# form locally and prints nothing; push the raw value to Vercel separately.

set -euo pipefail

cd "$(dirname "$0")/.."

if [ ! -f .env.local ]; then
  echo "error: .env.local not found in $(pwd)" >&2
  exit 1
fi

read -rsp "New admin password: " PW
echo
read -rsp "Confirm password:   " PW2
echo

if [ "$PW" != "$PW2" ]; then
  echo "error: passwords did not match" >&2
  exit 1
fi

if [ ${#PW} -lt 12 ]; then
  echo "error: use at least 12 characters" >&2
  exit 1
fi

HASH=$(PW="$PW" node -e 'console.log(require("bcryptjs").hashSync(process.env.PW, 12))')
unset PW PW2

cp .env.local ".env.local.bak-$(date +%Y%m%d%H%M%S)"

HASH="$HASH" python3 - <<'PY'
import os, re

raw = os.environ["HASH"]
escaped = raw.replace("$", "\\$")

with open(".env.local") as fh:
    text = fh.read()

line = "ADMIN_PASSWORD_HASH=" + escaped
text, count = re.subn(
    r"^ADMIN_PASSWORD_HASH=.*$", lambda _m: line, text, count=1, flags=re.M
)

if count == 0:
    text = line + "\n" + text

with open(".env.local", "w") as fh:
    fh.write(text)

print("ADMIN_PASSWORD_HASH updated in .env.local (escaped for Next.js).")
PY
