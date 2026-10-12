# Private accounts

Open a **Bot DM → Channel settings → Private accounts** (the chat header's **···** menu → **Channel settings…**). It lists the accounts this Bot asked you for through a private input card. Values are never shown here, not even masked.

## Read the list

Each row shows the account name, the purpose the Bot gave when it asked, the field labels (optional fields are marked) and when the values were last set. The status is **Active**, **Being replaced** while a replacement card is open, or **Unavailable** when the stored account no longer matches its original request. **Open original request** closes the dialog and jumps to the card in the DM.

If the list cannot be read, for example because the Host's credential store is unavailable, the section says so rather than showing an empty list.

## Replace an account

Click **Replace**. A blank card for the same account and fields opens in the section and in the DM. Fill it in and submit; the Bot's next use picks up the new values with no change on its side. **Cancel replacement** keeps the old values. Replace is disabled when this Host has private information execution turned off.

## Remove an account

Click **Remove** and confirm. Local use stops at once and the stored values are erased immediately. The result lists how many running uses were stopped, had already completed, or are uncertain. Removing does not revoke the token at the provider; rotate it there if it may have leaked. The Bot can ask for the same account again later.

The same accounts can be listed from the command line with `deepseekbot ask-secret-accounts <bot-id>`; see the [CLI reference](/docs/bot-cli).
