# Remote Host credential custody

Issue [#4201](https://github.com/BotHarness/DeepSeekBot/issues/4201) (H3). Decision: the local Host keeps the credentials this Client uses for paired Remote Hosts. The browser only holds opaque handles.

## What moves

A saved Remote Host carries three secrets:

- the device or member credential sent as `Device …`,
- the Noise XK static private key (`encryption.deviceKey`),
- the private relay admission token (`encryption.privateRelay.token`).

The Host stores these in the DSH credentials service under `botharness-private/remote-host-…`. Its `remote_host_custody` table keeps only the handle, the Owner Human id, the Remote Host id, the member flag and the routes. Browser storage keeps the same saved-Host shape, with these substitutions:

- `credential` becomes `custody.<43 base64url characters>`;
- `encryption.deviceKey` becomes the matching public key;
- `encryption.privateRelay.token` becomes its SHA-256 digest.

## Request path

`encryptedCarrier()` hands any handle to `HostCarrier.custody()` when the carrier offers it. In the browser, that carrier sends each request to the Owner-only `POST /api/botharness/remote-custody`. The Host then opens the encrypted session with the real secrets and replaces `Device <handle>` with `Device <credential>` inside the Host. Live connections use the same route to prepare a socket, then `GET /api/botharness/remote-custody/stream` to receive `open`, `message` and `closed` events. Sends start after `open` and go out in order. Avatars that carry a handle are loaded through the same request path.

Only Noise-encrypted routes, or plain routes that the Host recorded for that handle, receive a credential. Any other origin is refused with `custody-route-unknown`. A connect refusal from the Remote Host returns as `ConnectRefused` with its original code, so existing revocation handling still works.

## Authority

Both routes are registered through the DSH shared fetch gate, which refuses every Member and Admin peer before the handler runs. The Host also refuses a handle whose recorded Owner differs from the current Owner (`custody-owner-changed`). A Member page on the same origin therefore cannot read a secret or use a handle.

## Lifecycle and migration

- Each saved-Host write passes through `seal`. A new credential gets a handle. For an existing handle, the Host refreshes routes and a rotated relay token. A key that does not match is refused.
- On start, the Client seals every saved Host that still has a raw credential. It then writes the handle in the same storage write, which deletes the old value. If the Host cannot take the credential yet, the old entry is kept and sealing is tried again on the next start.
- Revoking a pairing forgets its handle afterwards. Removing a Host only from this Client forgets the handle too.

## Limits of this slice

- Pairing, Team sign-in and relationship enrollment still receive the new credential in browser memory for the moment before sealing. It is never written to browser storage.
- Plain-route pinning uses the routes the Owner's Client last saved. It guards against mistakes, not against a script already running with Owner authority.
- Mobile keeps its existing SecureStore storage. This change only applies to the browser Client served by the local Host.
