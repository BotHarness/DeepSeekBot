# Devices: hosted Connect section (#2387)

Isolated DSH Host (`verify-app launch`), zh locale, 1440 × 900. `before-*` is `main` at 75a9c8d.
The relay, WorkOS and `cloudflared` were local stand-ins (`DEEPSEEKBOT_CONNECT_RELAY`,
a fetch preload for `api.workos.com`, `DEEPSEEKBOT_CLOUDFLARED`), so the sign-in code, email and
hostname are fake.

- `signed-out-*`: the new section with Sign in.
- `signing-in-*`: after Sign in, the code to confirm and Open sign-in page.
- `connected-*`: after the stand-in approved the code; the Tailscale warning is gone because the
  Connect route is ready, and a new pairing offer carries no loopback-only warning.
