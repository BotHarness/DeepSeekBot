# VPS over Tailscale (AX)

The dev VPS lives on the Human's Tailscale tailnet. Per-machine values (SSH host/user) belong in the gitignored `vps.local.env` at repo root (copy `vps.local.example.env`); never commit tailnet IPs, key material, fingerprints, or tokens. Any dev machine on the tailnet (MacBook, Windows, WSL) uses the same file shape.

- Onboard a dev machine key: Human opens the cloud console into the box, runs `whoami; hostname` to confirm identity, appends the machine's ed25519 `.pub` to `~/.ssh/authorized_keys` (700/600, expect `KEY_OK`), and the agent verifies with its own `ssh <user>@<host> whoami` from that machine.
- VPS baseline: git ≥ 2.28, `gh` (Ubuntu: official github-cli apt repo), pinned Node, Docker as needed. Authenticate `gh` with a repo-scoped fine-grained PAT of the machine account, then `gh auth setup-git`. Notes from the field: `gh auth login --with-token` demands a `read:org` scope the narrow PAT lacks — hand-write `~/.config/gh/hosts.yml` (`oauth_token` + `git_protocol: https`, 0600) instead; and GitHub's git HTTPS endpoints require `Basic base64(x-access-token:<pat>)` while `Bearer` only talks to the REST API.
- Memory pushes use the machine account plus private repos (one-time PATs are revoked right after the run); per-PersonaBot author identity is repo-local `git config user.name/user.email`, settable from a Bot DM with approval, no SSH involved.
- Hands off other sessions' stacks (e.g. `/opt/botharness/bot-seo`): observe, never restart, rebuild, or reconfigure without that session's owner.
- Phone QA without tailnet: keep DSH loopback-bound and publish it with a Cloudflare quick tunnel; see [the phone QA runbook](phone-qa-tunnel.md) for trusted-host, token rotation, and stale-shell handling.
