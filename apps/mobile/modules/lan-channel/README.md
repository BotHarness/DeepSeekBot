# LAN channel

Local Expo module for the authenticated Noise carrier. New Android and iOS builds are required; Expo Go and earlier dev clients cannot supply this module.

The module accepts only RFC 1918 IPv4 and an explicit port. It fixes `/botharness-device/channel`, permits no caller headers, refuses redirects, and carries bounded Noise frames. The Host pin and device authority live in the shared TypeScript Noise and pairing owners, not in this module. The Android-only reserved hostname is mapped directly to the supplied IPv4 bytes by a private DNS adapter and is never queried on the network.

Android's `BoundedChannelInput` checks wire lengths before OkHttp assembles a message, including cumulative fragments and a fragment-count budget. iOS sets `maximumMessageSize`. Both also validate the resulting Noise frame text before passing it to JavaScript.

`with-lan-channel.js` installs the scoped Android network policy; `app.config.js` supplies iOS local-network policy. See [the LAN contract](../../../../docs/architecture/lan-phone-v1.md). Use the shared device QA queue for native compilation and runtime checks. CI runs `:lan-channel:testDebugUnitTest`; JavaScript tests alone do not qualify native behavior.
