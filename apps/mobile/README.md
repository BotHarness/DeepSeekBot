# DeepSeekBot mobile app

Native Expo client for the Human's own Host (hub [#1643](https://github.com/BotHarness/DeepSeekBot/issues/1643), spec [#1645](https://github.com/BotHarness/DeepSeekBot/issues/1645)). This first tracer ([#1650](https://github.com/BotHarness/DeepSeekBot/issues/1650)) logs in to an isolated Host over Tailscale HTTPS with the Host's launch token and shows the Roster of PersonaBots and group Channels with live state.

The launch-token login is **development-only**. It is replaced by the paired-device credential of ADR-0199 (#1649): the carrier sends `Authorization: Device …` to the BotHarness device gateway, with the same unary envelope and mux frames, so only `src/host/native-carrier.ts` and the login step change.

## Layout

- `src/host/` — the Host client module. One deep module owns the route, the login, unary calls, the Remote stream socket, reconnection and connection state. Screens read it through `useHostSnapshot()` and never talk HTTP. It is plain TypeScript with an injected carrier (`carrier.ts`), so it is tested in Node.
- `src/host/wire.ts` — the slice of the Host's wire shapes the app reads; `test/wire-contract.ts` checks the Host's own types against it in the root typecheck.
- `app/` — Expo Router screens: the Roster (`index.tsx`) and the development login (`connect.tsx`).
- `src/ui/` — native views. Pixel avatars are drawn from the Host's own avatar code (`packages/core/src/bots/avatar-appearance.ts`), so they match the Web Client.

Carrier decision and evidence: [ADR-0200](../../docs/adr/0200-the-mobile-app-reads-live-state-over-the-dsh-remote-stream-socket.md).

## Toolchain

Expo SDK 57 (React Native 0.86, React 19.2) inside the pnpm workspace with pnpm's default isolated linker: no `node-linker=hoisted`, no `.npmrc` change. `metro.config.js` adds one resolver rule so Metro can follow the Host sources' `.js`-suffixed TypeScript imports. Having React Native in the workspace makes pnpm link it as an optional peer of a few web packages (`morphicons`, `@tanstack/charts`); those packages only load it from their explicit React Native entry points.

```bash
pnpm install
pnpm --filter @botharness/mobile typecheck
pnpm vitest run apps/mobile                     # Host client against the recorded fake Host
MOBILE_LIVE_HOST_URL='http://127.0.0.1:<port>/?token=<token>' pnpm vitest run apps/mobile
                                                # also drives it against a live isolated Host with a PersonaBot
pnpm --filter @botharness/mobile export          # Metro bundles for iOS and Android
```

## Run the tracer on a phone

1. **Host.** Start an isolated Host and note its token URL. Put it on the tailnet with HTTPS and trust that name:

   ```bash
   node scripts/dev-instance.mjs --home <isolated-DSH_HOME> --port 3080
   tailscale serve --bg 3080                     # https://<machine>.<tailnet>.ts.net → 127.0.0.1:3080
   # restart the same Host with the tailnet name trusted (stop its exact PID first):
   node scripts/dev-instance.mjs --home <isolated-DSH_HOME> --port 3080 --trusted-host <machine>.<tailnet>.ts.net
   ```

   Without `--trusted-host` the Host answers `403` to every `/api` call from the tailnet name.

2. **Development build.** Once per machine, `npx eas-cli login` and `npx eas-cli init` in `apps/mobile` (writes the EAS project id into `app.json`). Then `pnpm --filter @botharness/mobile eas:dev -- --platform ios` (or `android`) and install the build from the link EAS prints. A local build also works: `pnpm --filter @botharness/mobile ios` / `android` with Xcode or Android Studio.

3. **Connect.** Start Metro with `pnpm --filter @botharness/mobile start`, open the development build, enter `https://<machine>.<tailnet>.ts.net` and the token from the token URL. The phone must be on the same tailnet.

4. **Check.** The Roster lists every PersonaBot with its avatar. Send the Bot a DM from the computer: its state turns to Thinking and back on the phone without a refresh. Stop the Host: the banner shows "Cannot reach your computer" with the route; start it again on the same home and the app reconnects by itself. Starting a fresh home (a new signing secret) with the old token shows "Pair again".

The token is stored only in the platform's secure storage and is never logged. The Host's session cookie lives in the app's own cookie store; unpairing forgets the token.
