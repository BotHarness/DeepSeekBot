#!/usr/bin/env bash
# Creates the ph-launch Campaign and its go.botharness.ai short links.
# Usage: BH_LINKS_TOKEN=bhl_... bash short-links.sh   (write token from https://go.botharness.ai/admin)
# Safe to re-run: existing Campaign/links answer 409 and are left as they are.
set -u
: "${BH_LINKS_TOKEN:?set BH_LINKS_TOKEN to a write token}"
API=https://go.botharness.ai/v1
post() { curl -sS -o /tmp/bh-links.out -w '%{http_code}' -X POST "$API/$1" \
  -H "Authorization: Bearer $BH_LINKS_TOKEN" -H 'content-type: application/json' -d "$2"; }

echo "campaign ph-launch: $(post campaigns '{"slug":"ph-launch","name":"PH Launch","description":"Product Hunt / X / YouTube / Bilibili / Discord launch"}')"

# slug platform media path language
while read -r slug platform media path lang; do
  code=$(post links "{\"slug\":\"$slug\",\"campaign\":\"ph-launch\",\"platform\":\"$platform\",\"media\":\"$media\",\"path\":\"$path\",\"language\":\"$lang\"}")
  echo "$code https://go.botharness.ai/$slug"
  [ "$code" = 201 ] || [ "$code" = 409 ] || cat /tmp/bh-links.out
done <<'LINKS'
bili         bilibili    video   /                    zh
bili-docs    bilibili    video   /docs/               zh
bili-install bilibili    video   /docs/installation/  zh
bili-pin     bilibili    comment /                    zh
x            x           post    /                    en
x-docs       x           post    /docs/               en
yt           youtube     video   /                    en
yt-docs      youtube     video   /docs/               en
yt-install   youtube     video   /docs/installation/  en
yt-pin       youtube     comment /                    en
yt-pin-docs  youtube     comment /docs/               en
ph-docs      producthunt comment /docs/               en
dc           discord     post    /                    en
dc-docs      discord     post    /docs/               en
dc-zh        discord     post    /                    zh
dc-news      discord     post    /                    en
LINKS

echo
echo "check one redirect (should be 302 to the site with utm_*):"
curl -sS -o /dev/null -w '%{http_code} %{redirect_url}\n' https://go.botharness.ai/x
