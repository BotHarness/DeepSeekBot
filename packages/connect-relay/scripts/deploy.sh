#!/usr/bin/env bash
# First deploy of the hosted Connect relay: D1, migrations, Worker, secrets, smoke test.
# Usage: WORKOS_CLIENT_ID=client_… ALLOWED_USERS=user_… packages/connect-relay/scripts/deploy.sh
# Unset values are prompted for. Never prints a secret.
set -euo pipefail

ACCOUNT=332e72d480d7cb3e60ee671d3ca0cad0
CF_ENV=~/.config/deepseekbot-connect/cloudflare.env
cd "$(dirname "$0")/.."

# wrangler deploys with its OAuth login; the API token in $CF_ENV is only stored as a Worker secret
w() { env -u CLOUDFLARE_API_TOKEN CLOUDFLARE_ACCOUNT_ID="$ACCOUNT" CI=true pnpm exec wrangler "$@"; }

w whoami | grep -q "$ACCOUNT" || { echo "wrangler is not signed in to $ACCOUNT; run: pnpm exec wrangler login"; exit 1; }
[[ -r $CF_ENV ]] || { echo "missing $CF_ENV"; exit 1; }

WORKOS_CLIENT_ID=${WORKOS_CLIENT_ID:-}
ALLOWED_USERS=${ALLOWED_USERS:-}
[[ -n $WORKOS_CLIENT_ID ]] || read -rp "WorkOS client id (client_…): " WORKOS_CLIENT_ID
[[ -n $ALLOWED_USERS ]] || read -rp "Allowed WorkOS user ids (user_…, comma-separated): " ALLOWED_USERS
[[ $WORKOS_CLIENT_ID =~ ^client_[A-Za-z0-9]+$ ]] || { echo "bad client id"; exit 1; }
[[ $ALLOWED_USERS =~ ^user_[A-Za-z0-9]+(,user_[A-Za-z0-9]+)*$ ]] || { echo "explicit user ids required"; exit 1; }

d1_uuid() {
  w d1 list --json 2>/dev/null | node -e '
    let s = ""; process.stdin.on("data", (d) => (s += d)).on("end", () => {
      const d = JSON.parse(s.slice(s.indexOf("["))).find((x) => x.name === "botharness-connect-relay");
      process.stdout.write(d ? d.uuid : "");
    });'
}

echo "▸ D1"
UUID=$(d1_uuid)
[[ -n $UUID ]] || { w d1 create botharness-connect-relay >/dev/null; UUID=$(d1_uuid); }
[[ -n $UUID ]] || { echo "D1 database not found after create"; exit 1; }
sed -i.bak "s/00000000-0000-0000-0000-000000000000/$UUID/" wrangler.jsonc && rm -f wrangler.jsonc.bak
w d1 migrations apply CONNECT_DB --remote

echo "▸ Deploy"
w deploy

echo "▸ Secrets"
SECRETS=$(umask 077; mktemp)
trap 'rm -f "$SECRETS"' EXIT
(
  set -a; . "$CF_ENV"; set +a
  export WORKOS_CLIENT_ID ALLOWED_USERS
  node -e '
    const keys = ["WORKOS_CLIENT_ID", "ALLOWED_USERS", "CLOUDFLARE_API_TOKEN", "CLOUDFLARE_ACCOUNT_ID", "CLOUDFLARE_ZONE_ID"];
    const missing = keys.filter((k) => !process.env[k]);
    if (missing.length) { console.error("missing: " + missing.join(", ")); process.exit(1); }
    require("fs").writeFileSync(process.argv[1], JSON.stringify(Object.fromEntries(keys.map((k) => [k, process.env[k]]))));
  ' "$SECRETS"
)
w secret bulk "$SECRETS" >/dev/null
rm -f "$SECRETS"
if w secret list 2>/dev/null | grep -q '"CONNECT_HOST_KEY"'; then
  echo "  CONNECT_HOST_KEY kept"
else
  node -e 'process.stdout.write(require("crypto").randomBytes(32).toString("base64url"))' \
    | w secret put CONNECT_HOST_KEY >/dev/null
  echo "  CONNECT_HOST_KEY created"
fi

echo "▸ Verify (the custom-domain certificate can take a minute or two)"
CONFIG=FAILED
for _ in $(seq 1 24); do
  if curl -fsS -m 8 https://connect.botharness.ai/v1/config 2>/dev/null | grep -q "$WORKOS_CLIENT_ID"; then CONFIG=ok; break; fi
  sleep 5
done
HOSTS=$(curl -s -o /dev/null -w '%{http_code}' -m 8 https://connect.botharness.ai/v1/hosts || true)

echo
echo "D1 uuid:          $UUID (commit it in wrangler.jsonc)"
echo "/v1/config:       $CONFIG"
echo "/v1/hosts status: $HOSTS (expect 401)"
[[ $CONFIG == ok && $HOSTS == 401 ]]
