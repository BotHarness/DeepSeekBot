# TOB mobile connection owner

`client.ts` owns the fixed instance, live PKCE transaction, session rotation and admission readback. `native.ts` is the only native boundary; the UI receives a secret-free snapshot. `native-intent.ts` keeps callback credentials out of routing, including cold launch.

`instance-contract.ts` is a copy with repository-required formatting and comment removal of [TOB packages/contracts/instance.ts at 16f7bfc](https://github.com/BotHarness/tob/blob/16f7bfc/packages/contracts/instance.ts), protocol/format v1. Update both repo validators and compatibility tests together; do not fetch or trust a validator at runtime. TOB owns the public wire format. This deliberate copy avoids introducing an unpublished package dependency during the first slice. Mobile auth/session implementation is independent and does not use the Node CLI.

Run `pnpm vitest run apps/mobile/test/cloud-client.test.ts`. These injected-boundary tests do not qualify native camera, SecureStore or browser handoff. See [the native UAT checklist](../../../../docs/agents/tob-mobile-uat.md).
