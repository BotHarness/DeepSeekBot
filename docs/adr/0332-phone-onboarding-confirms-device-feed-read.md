# ADR-0332: Phone onboarding confirms a device Feed read

- Status: Accepted
- Date: 2026-11-13
- Delivery: [#4073](https://github.com/BotHarness/DeepSeekBot/issues/4073), within [#4069](https://github.com/BotHarness/DeepSeekBot/issues/4069)

## Decision

The optional Desktop intro phone step opens the existing Connections dialog. It creates no listener, route, login or invitation until the person chooses to connect. Closing returns to the same step; skipping continues the intro.

Every phone entry, including the Control Rail, Connections settings and intro, first shows the same installation guide inside Connections. It reuses the existing iOS and Android download instructions. The person explicitly selects “App installed, start connecting” before route preparation or invitation creation, even when a usable route already exists. Desktop does not infer installation on another device. This confirmation belongs to the current dialog journey, not a durable installation flag; Back and a fresh entry cannot bypass it.

Pairing approval is not a successful content read. The application-defined mobile Host client reports its first successfully loaded Bot and Channel roster through the existing authenticated device gateway after publishing that roster. The device-pairing owner stores `feed_read_at` in its existing operational database record. The gateway derives the device identity from admission, never from a submitted device ID. The first timestamp is idempotent; revoked grants cannot acknowledge. This is an authenticated client acknowledgement, not proof that a Human saw a screen.

The Connections dialog correlates its invitation receipt to the redeemed device, then checks that exact non-revoked device's acknowledgement through its existing bounded status poll. Unrelated devices and mere admission timestamps never complete the intro. Returning to the phone step reads the owner again. Continue remains explicit; Back and Skip do not revoke grants or stop routes.

`device-probe` uses the same mobile Host client and waits for the acknowledgement result. `devices` exposes the recorded timestamp. No parallel enrollment implementation, tutorial connection store, DSH SessionEvent or new Service Provider is introduced.

## Compatibility and cost

A newer client can still read an older Host: an unsupported acknowledgement endpoint does not block the roster. An older client does not produce a false completed state on a newer Host; the optional step remains skippable. A failed acknowledgement can retry on an ordinary Feed reload. One successful acknowledgement per client lifetime adds one bounded request and at most one durable write per device grant. Ordinary refreshes and streaming frames do not repeat it. Desktop polling exists only while its phone step or Connections dialog is mounted.

## Alternatives

Using `pairedAt` or `lastSeenAt` would confuse approval or transport admission with a content read. Observing HTTP success in the gateway would not prove that the client parsed the roster. A separate onboarding receipt would duplicate the device grant's identity and revocation authority.
