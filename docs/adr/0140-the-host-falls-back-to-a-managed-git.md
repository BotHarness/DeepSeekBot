---
Status: Accepted
Date: 2026-10-07
---

# The Host falls back to a Managed Git

Every Memory Repository operation (Bot creation, Import from GitHub, Bot Zip import and export, Memory evolution, recovery checkpoints) runs the `git` executable on the Host's PATH. Until now BotHarness neither checked for it nor helped install it: a Host without Git only learned about it when Bot creation failed. On macOS without the Command Line Tools, `/usr/bin/git` is a stub that fails without `ENOENT`, so the Human saw a generic "memory unavailable" error. Most DeepSeekBot users cannot be expected to install or upgrade Git themselves, so the Host now falls back to a **Managed Git** that the Human installs with one click.

## Decision

- **System Git first.** On every Host start, BotHarness resolves Git: a system Git that runs and is at least 2.28 is used as is. Otherwise BotHarness uses the Managed Git if it is installed, and treats Git as unavailable if not. There is no manual switch.
- **Unavailable means not runnable or too old.** A missing executable, the macOS stub and a version below 2.28 are the same state. The minimum is 2.28 (`git init -b`). The Memory activity query keeps `--since-as-filter` on Git 2.37 and newer; on older Git, BotHarness reads the commit dates and filters them itself, so a backdated commit still does not hide newer ones.
- **Check on entering Bot mode.** Bot mode checks Git before the Human acts. While Git is unavailable it shows one **Install Git** button, plus a docs link for Humans who prefer to install system Git. Creating and importing Bots are disabled until Git is available. Other DSH features are unaffected.
- **Managed Git is a portable build in the Profile.** The button downloads a portable Git for the Host's OS and architecture (the dugite-native builds that GitHub Desktop uses) into the Profile, with no administrator rights. A headless Linux server works the same way, because the button installs on the Host, not on the browser's machine.
- **Pinned and verified.** Each deepseekbot release pins one Managed Git version and its SHA-256 per platform. Downloads try BotHarness's own mirror (`media.botharness.ai`) first, then the GitHub release, and are rejected unless the checksum matches; a corrupt or stalled download moves on to the next source. When a deepseekbot upgrade pins a new version, it is downloaded on next use.
- **Visible to Sessions.** When the Managed Git is in use, the Host prepends its directory to the DSH process PATH, so an Orchestrator Session that runs `git` in its Shell gets the same Git as BotHarness. DSH builds each Shell command's environment from the live process environment, so the change reaches Sessions without a restart. A relocated dugite-native build needs `GIT_EXEC_PATH`, `GIT_TEMPLATE_DIR` and, on Linux, its CA bundle, so on macOS and Linux the PATH entry is a small `git` shim that sets them before running the real binary; on Windows it is the build's own `cmd` launcher.
- **Settings show the resolved Git.** Settings show the Git version in use and whether it is system or managed, for diagnosis.
- **SSH imports fall back to HTTPS.** When cloning an SSH import URL (`git@host:owner/repo(.git)` or `ssh://git@host/owner/repo` without a custom port) fails, the Host converts it to `https://host/owner/repo.git`, retries once, and tells the Human it switched; the new Bot's remote is then the HTTPS URL. This works with system or Managed Git; BotHarness does not bundle SSH. If the HTTPS retry also fails (for example a private repository that only had SSH keys), the Human sees the original SSH error.

## Considered Options

- **Only guide the Human to install system Git** (`xcode-select --install`, `winget`, distro commands): rejected as the main path. Windows needs elevation, Linux needs sudo, and every OS needs a different flow. It stays as the docs link.
- **Pure-JavaScript Git (isomorphic-git)**: rejected. Bot Zip bundles, `ls-files`, recovery refs and the Orchestrator's own Shell use of Git would all need rewriting or would still need a real `git`.
- **Run without Git, with history features disabled**: rejected. A Memory Repository is a Git repository (ADR-0002); a second, history-less Memory mode would split every Memory feature in two.
- **Download only from GitHub**: rejected. GitHub release downloads are slow or unreachable for many users in China; the mirror comes first, and GitHub remains the fallback.

## Consequences

- `GLOSSARY.md` gains **Managed Git**.
- `docs/installation.md` states that Bot mode needs Git and that it can install Git itself.
- Prepending to the DSH process PATH also affects non-Bot DSH Sessions on that Host. This is intended: it only happens when the Host has no usable system Git.
