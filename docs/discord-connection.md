# Connect a Bot to Discord

Use a Discord Bot application installed in a designated test server. A Discord user login and an application Client Secret are not Bot Tokens. Keep the Token in the Provider's native credentials flow, never in a chat message or repository.

## Connect and bind

1. Prepare the Bot in the [Discord Developer Portal](https://discord.com/developers/applications) and install it in the intended server through Discord's application authorization flow.
2. Give it View Channel, Read Message History and Send Messages in the selected text channel. Existing public-thread replies also need Send Messages in Threads. Do not grant Administrator merely to complete this setup.
3. Connect the Discord account in native **Settings → IM bots**. Open the PersonaBot's **Bind app** control and bind the verified Discord identity to that Bot.
4. Send a fresh mention in the designated channel. Check both the original Discord reply and the corresponding Source/Inbox/Outbox facts. A connected indicator alone is not a successful chat test.

One App belongs to one PersonaBot. Shared local Channel visibility does not authorize another Bot to send through that App. A newly bound group's default is mentions-only; ordinary collection and Channel synchronization remain separate choices.

## Which same-name mention to choose

Discord may offer the Bot user and its integration-managed role with the same name. A direct Bot-user mention is the established baseline. The #1615 candidate also recognizes the App's own role after checking its current native guild/member ownership: `managed: true`, exact `tags.bot_id`, the Bot's current role membership and an exact ID in `mention_roles`.

Other roles, even ones the Bot holds, and `@everyone`/`@here` do not address the Bot. Typing a display name without a genuine native mention does not address it either. The original text and native reply location are preserved.

Role recognition does not enable the privileged Message Content intent or bypass unavailable content. Keep the verified Bot-user path usable when the selected App cannot deliver the role-mention message. Any additional App permission needs its own authorization and native qualification.

## Verify and diagnose

Use separate unique markers for the Bot-user mention and own managed-role mention. Each admitted request should produce one source-bound reply in the original text channel or existing public thread. Test unrelated role and everyone/here negatives without an independent direct Bot mention. Ordinary collection, if separately enabled, must not reinterpret those negatives as direct requests.

The #1615 Runtime/Consumer regression is automated; this candidate's fresh native and installed-product acceptance remains pending in its [qualification record](dev/verification/discord-1615-managed-role.md). Earlier Discord evidence does not prove this new case. Do not start a second receiver for the same App; arrange an exclusive test window and restore the original receiver afterwards.

See [Discord role tags](https://docs.discord.com/developers/topics/permissions#role-object) and [native message mentions](https://docs.discord.com/developers/resources/message#message-object).
