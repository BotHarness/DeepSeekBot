# Secrets

Open a **Bot DM → Channel settings → Secrets** (the chat header's **···** menu → **Channel settings…**). It lists the secrets this Bot asked you for through a private input card, such as API keys, tokens or sign-in credentials. Values are never shown here, not even masked.

## Read the list

Each row shows the secret's name and three labelled details:

- **Purpose**: what the Bot said when it asked, which credential it is, which service it is for and what the Bot will do with it.
- **Status**: **Active**, **Being replaced** while a replacement card is open, or **Unavailable** when the stored secret no longer matches its original request.
- **Configured**: when the values were last set. Hover for the exact time.

The field labels are listed too, with optional fields marked. **Open original request** closes the dialog and jumps to the card in the DM.

If the list cannot be read, for example because the Host's credential store is unavailable, the section says so rather than showing an empty list.

## Replace a secret

Click **Replace**. A blank card for the same secret and fields opens in the section and in the DM. Fill it in and submit; the Bot's next use picks up the new values with no change on its side. **Cancel replacement** keeps the old values. Replace is disabled when this Host has private information execution turned off.

## Remove a secret

Click **Remove** and confirm. Local use stops at once and the stored values are erased immediately. The result lists how many running uses were stopped, had already completed, or are uncertain. Removing does not revoke the token at the provider; rotate it there if it may have leaked. The Bot can ask for the same secret again later.

Deleting the Bot erases all of its secrets the same way, at once, and the deletion confirmation says so.

The same list is available from the command line with `deepseekbot ask-secret-accounts <bot-id>`; see the [CLI reference](/docs/bot-cli).
