# AX shared default model

Use DSH's built-in `opencode-go` route for AX-launched isolated Profiles after a one-time
machine-local setup. The default model is `deepseek-v4.1-flash`; the setup script checks the model
against the catalog shipped with the worktree's pinned native adapter. This uses no additional
Provider plugin.

Test with the newest DeepSeek model in that catalog, not an earlier generation. When a newer one
ships in the pinned catalog, move `DEFAULT_GO_MODEL` in `scripts/dev-model.mjs` and this page to it.
An existing selection keeps its model: remove `~/.config/botharness/ax-model.json` and rerun setup
to pick up the new default.

## Set the key locally

Run from the worktree in a local interactive terminal:

```bash
node scripts/dev-model.mjs setup
node scripts/dev-model.mjs check
```

The prompt hides the API key. Setup writes `~/.config/botharness/ax-model.json` with mode `0600`
inside a private directory, refuses to overwrite an existing selection, and prints no key. Keep
this file on the machine. If your own script has already supplied `OPENCODE_GO_API_KEY` in its
environment, use `setup --from-env`. Use `--model <id>` to select another installed Go model.

On WSL, run setup and the launcher under the same Linux user and Node environment. Windows and
WSL have separate home directories. The script checks POSIX permissions on WSL/macOS/Linux;
on Windows, protect your user configuration directory with its existing user ACL.

## Reuse in an isolated Profile

```bash
node scripts/dev-instance.mjs --home <isolated-DSH_HOME> --port <n> --build
```

Each launch reads the shared selection, injects only `OPENCODE_GO_API_KEY` into its child Host,
and adds a final launch Patch for native `llm-pi-ai` and `agent-default-model`. The Patch contains
the credential reference, preserves other Provider configuration, and selects the requested
model without copying any Profile credential store. It retains DSH's native request attribution
and real Session handling. Existing Profiles and independently launched Hosts are untouched.

A per-run `OPENCODE_GO_API_KEY` environment override takes precedence after setup. The previous
DeepSeek setup remains the fallback when no AX selection exists. To rotate the shared selection,
inspect and remove the private file yourself, then rerun setup; active Hosts keep their inherited
environment until restarted.

### Native Go Session header on DSH 0.2.0 RC1 and RC2

OpenCode Go requires `x-opencode-session` for the actual conversation as well as request
attribution. The pinned native adapter forwards `sessionId` to its underlying SDK but omits
this header; the first real QA turn failed with HTTP 400 `MissingSessionID`.

For an opted-in AX launch, the helper installs an independent pinned CLI under the isolated
home's `ax-cli` directory (or `packaged-cli` for product-artifact qualification). It applies the
reviewed `dsh-llm-pi-ai` pnpm patch (re-keyed to `0.2.0-rc.2`, same hunk): only the Go route adds the actual
`GenerateOptions.sessionId`, removes case-insensitive collisions with a configured static
header, and retains native `User-Agent` attribution and other headers. Missing Session identity
stays missing; no fixed, random or substitute identity is supplied. Other Providers keep their
existing headers. The Go qualification refuses a different DSH version until reverified.

The helper copies the reviewed patch into that CLI's `patches/` directory and uses a relative
path in its `pnpm-workspace.yaml`. Windows pnpm otherwise resolves a drive-qualified patch path
under the runtime directory and fails with `ERR_PNPM_PATCH_NOT_FOUND`, especially when the source
worktree and isolated home are on different drives. Each launch refreshes the staged bytes from
the worktree; other workspace settings and patch entries are preserved.

RC2 status: the repository default is DSH `0.2.0-rc.2`. The RC2 adapter still omits the header,
the patch applies to it unchanged, and the adapter regression
(`scripts/test/dev-go-session.test.mjs`) passes against the patched RC2 package. On 2026-10-13 a
fresh opted-in isolated Profile on RC2 answered one real Go DM with a committed reply, so the
launcher guard now names `0.2.0-rc.2`.

This changes no global CLI or application permissions. Each opted-in AX home gets its own
runtime, while model selection and the credential reference remain launch Patches. See the
[Go request requirements](https://opencode.ai/docs/go/#where-can-i-use-it) and
[upstream DSH discussion](https://github.com/deepseek-ai/deepseek-harness/discussions/5495).
Remove this temporary patch only after the pinned upstream adapter passes the same regression
and a real DM verification. The qualification's [actual DM screenshot](../qa/ax-opencode-go-reply.png)
shows the model using `channel_send` and the committed reply in the Channel.

Open the launcher's local login URL, create/use a QA PersonaBot and obtain a real DM reply before
claiming model usability. `check` and `/api` health establish configuration and transport only.
Model access and Lark App ID/App Secret are separate credentials; Lark still uses the normal DSH
credentials flow and only one authorized QA receiver.
