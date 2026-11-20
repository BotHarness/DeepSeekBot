# Browser decisions

How PersonaBots browse: the managed Bot Browser, who may use it and how the Human stays in control, where it runs, and how a Bot may read or act in the Human's own Chrome. How it works lives in [the architecture](../architecture/botharness-architecture.md); terms live in [`GLOSSARY.md`](../../GLOSSARY.md); who answers an approval is in [Approval decisions](approvals.md). Each section states the current decision, the reasons a reader cannot get from the code, and what enforces it. History is in Git: this file replaces ADR-0089, 0090, 0091, 0095, 0096, 0114, 0116, 0121, 0123, 0124 and 0163, and each section lists the ADRs it absorbed.

Two rules run through every section:

- **The isolation boundary is the browser profile, never a PersonaBot.** Every tab in one Browser profile shares its cookies and sign-ins. Per-Bot tab ownership scopes what a Bot sees and does; it does not protect one Bot from another.
- **Access, Authorization and Pause are separate, and Computer stays independent.** Browser Access decides whether a Bot has the tools, Browser Authorization decides whether a call may run, and Browser Pause stops one Bot's actions. None of them grants Computer, and changing the target, driver or profile revokes what was granted before.

## 1. One managed Bot Browser per Browser profile, separate from the Human's browser

<a id="adr-0089"></a>
<a id="adr-0096"></a>
_Formerly ADR-0089 and ADR-0096._

The optional `@botharness/browser` bundle owns the whole integration through an application-defined provider; it does not use DSH's experimental browser-use service. It prefers the Chrome or Edge already installed, launched with a dedicated `--user-data-dir`, a loopback CDP endpoint and the `AutomationControlled` blink feature disabled, and installs a version-pinned Chrome for Testing when none is found. The window is headed by default so the Human can sign in once through **Open Bot Browser**; a setting makes it headless. Each runtime starts on first use, stops after 30 idle minutes (configurable) and logs launch, stop and refusals to `logs.db`; a stopped browser is a readable tool error and never blocks Host boot.

The default Browser profile (`$DSH_HOME/botharness/browser`) is shared by every Bot: sign in once and every Bot reuses it. A PersonaBot record may name another profile (letters, digits, `.`, `-`, `_`, up to 40 characters; `.`, `..` and `default` are not names), which lives under `$DSH_HOME/botharness/browser-profiles/<name>` and runs its own instance, created lazily and idle-stopped on its own. An invalid stored name falls back to the default profile. Changing a Bot's profile resets that Bot's tabs. Renaming or deleting a profile folder is left to the Human.

Why: driving the Human's everyday Chrome needs a relaunch with debugging flags or an extension with debugger rights, and one Chromium per Bot costs about 200 MB each. One shared browser with background tabs is cheap and parallel. The accepted costs are a separate sign-in and sites that reject automation.

Enforced by: `packages/browser/test/browser-authority.property.test.ts` (for any input, a profile name is the default or a valid single folder name, never `.` or `..`, and stays inside the profile folder), `runtimes.test.ts` (one runtime per profile, lazy launch, independent idle stop), `provision.test.ts`, `profile-combobox.test.ts`.

## 2. Access per Bot, Authorization per Session, Audit and Pause per Bot

<a id="adr-0090"></a>
_Formerly ADR-0090._

**Browser Access** is a per-PersonaBot preference on its record, off by default, that survives restart, export and import. When it is on, the Browser tools and guidance are registered only in that Bot's Orchestrator and Assignment Sessions; turning it off disposes them and aborts calls in flight. No other Bot and no Human Session ever sees them. Every call must come from the owning Bot's Session.

**Browser Authorization** uses the native approval card in the Bot DM before a Session's first action, with the usual one-time and Always allow answers and a Profile-level auto-allow switch (off by default) ([Approval decisions](approvals.md)). A saved rule names the tool, Browser profile and target.

**Browser Audit** records every observation and action with the Bot, Session and role and a redacted summary: URLs are capped at 160 characters, typed text is a character count, and an uploaded file is its name and size, never its Host folder. Page contents and screenshots never enter it. **Browser Pause** stops one Bot's actions and its model-facing screenshots; `browser_observe` stays available, the Human can always operate the local window, and after Resume the Bot observes again before acting. One Bot's actions run in order; different Bots act in parallel.

Why: the browser is shared, but acting in it is a per-Bot decision. Profile-wide tools would put the catalog in every prompt and blur who did what, and without Pause a Bot could keep acting while the Human drives the same window.

Enforced by: `packages/browser/test/browser-authority.property.test.ts` (for every tool, with generated values in its other arguments, the audit line never contains the typed text or the Host folder of an upload, and keeps only the first 160 characters of a URL), `browser-tools.test.ts`, `client-access.test.ts`.

## 3. Bot Tabs are background tabs

<a id="adr-0091"></a>
<a id="adr-0095"></a>
_Formerly ADR-0091 and ADR-0095; ADR-0095 replaced ADR-0091's window per Bot._

A Bot Tab is a background tab a PersonaBot owns, opened without a new window and without focus, so a Bot never steals the Human's focus. Only the Human's **Open Bot Browser** creates and focuses a window. Observation, actions, audit, Pause and admission are scoped to the Bot's own tabs by CDP target id; the Browser entry lists each Bot's tabs and previews the focused one. A Human closing a Bot's tab is normal: the Bot's next call reports the missing tab, and it lists, selects or opens another. The Human never lends a tab to the managed browser.

Why: a window per Bot stole focus and cluttered the screen. CDP has no tab-group API, so the entry's tab list carries the visibility a window title used to.

Enforced by: `packages/browser/test/browser-tools.test.ts`, `client-preview.test.ts`.

## 4. Local and Container targets share one tool surface; drivers are a trial

<a id="adr-0114"></a>
<a id="adr-0124"></a>
_Formerly ADR-0114 and ADR-0124._

**Browser Target** is a Profile setting; Local is the default. Container starts a digest-pinned LinuxServer Chrome image per Browser profile with an owner-labelled named volume, 2 CPUs, 2 GiB memory, 512 MiB shared memory and 1024 processes, and no Host home, daily browser, Docker socket or Computer mount. CDP stays inside the container behind a Host-loopback relay. The Human viewer is loopback only and served through authenticated DSH Web Host routes, with clipboard, file transfer, microphone and commands disabled; enabling Human input first pauses that Bot. Idle stop removes the process and keeps the volume. `browser_upload` copies a Host file into bounded container storage (64 MiB per file, 128 MiB per runtime). Docker absence or foreign ownership refuses explicitly.

Local and Container each choose a driver, `current` (default) or the pinned `agent-browser` native driver. The candidate attaches only to the existing owned CDP endpoint through a private IPC directory, with its own interactive stream disabled and checked. Its accessibility snapshot is read-only text; actions still need the DOM observer's nonce-stamped refs, which refuse after navigation or reload.

Changing the target, a driver or the profile opens a new authorization scope: it revokes registrations, grants and pending approvals, clears refs and tab ownership, and waits for the old runtime's disposal; a failed disposal keeps new execution closed until a later switch, idle cleanup retry or Human Stop succeeds. Already-issued input cannot be undone and is never replayed.

Why: the Human wanted an isolated browser without enabling Computer or sharing the daily profile. One tool provider over two execution worlds keeps Access, Authorization and Audit identical. The agent-browser driver is measured against the same PersonaBot, model and fixtures before any default changes (`docs/agents/browser-driver-qa.md`).

Enforced by: `packages/browser/test/container-execution.test.ts`, `container-driver.test.ts`, `agent-process.test.ts`, `target-settings.test.ts`, `runtime.test.ts`.

## 5. The Human's own Chrome: read one tab, control one document, or pair a Profile

<a id="adr-0116"></a>
<a id="adr-0121"></a>
<a id="adr-0123"></a>
_Formerly ADR-0116, ADR-0121 and ADR-0123._

Three further targets reach the Human's daily Chrome, each narrower than the managed browser and each still behind Browser Access and native Session approval:

- **Daily Browser** (`extension`, read-only). A first-party MV3 extension redeems a one-use, five-minute pairing code for one Bot over a loopback-only prefix that checks the peer address and extension origin. The Human chooses **Share current tab read-only**; only `browser_observe` is registered, and it reads bounded visible text and labels, never input values. A lease lasts at most 30 minutes and ends after 45 seconds without polling, on return, navigation, tab closure, Access removal, target change or restart.
- **Daily Chrome · Control** (`daily-control`). A per-Bot subprocess runs the pinned official Playwright extension connector, captures the one page the Human selects and gets control only after a separate Human grant. It registers `browser_observe`, ref-based `browser_type` and `browser_click`; refs are bound to the observed document, password values are never read, and navigation, closure, disconnect, Return, Pause or restart revokes the connection.
- **Daily Chrome · Entire Profile** (`profile-control`). One Chrome profile pairs persistently with the Host: the Browser Plugin keeps an origin-bound token hash and the extension keeps the credential. It registers tab list and select, open (navigate the selected tab), observe, and ref-based type and click on ordinary web pages, never browser or private pages. Selected tabs, approvals and refs are process-local, Host commands run one at a time across Bots, and Pause waits for issued work before acknowledging.

Why: the managed browser cannot reuse the Human's current sign-ins. Each step up in reach (read one tab, control one document, act across a Profile) is a separate, explicit Human choice with its own scope, so no mode silently widens another.

Enforced by: `packages/browser/test/borrow.test.ts`, `borrow-http.test.ts`, `extension-worker.test.ts`, `daily.test.ts`, `daily-document.test.ts`, `profile-control.test.ts`, `profile-worker.test.ts`.

## 6. Browser Takeover goes through the shared viewer; a Bot asks with a non-blocking Takeover Handoff

<a id="adr-0163"></a>
_Formerly ADR-0163; its blocking `browser_takeover` tool was replaced by `takeover_request` (#3379)._

The local Bot Browser is served at `/botharness-browser/viewer/local/` through the same Host prefix pattern and `remote-viewer` component as the Container and Computer viewers. In a **Browser Takeover**, Human click, scroll and keyboard input (committed text through `Input.insertText`, so IME composition happens on the Human's device) require an active Pause. Small viewports default to trackpad mode with a direct-tap toggle.

When a page asks for a login, code or CAPTCHA, the Bot calls `takeover_request` with target `browser`, a short title and one sentence, and its turn ends. The card in the conversation opens the live view; Done, Could not finish, cancel or expiry wakes the Bot through its Inbox, and it observes again before acting. Each Bot has at most one pending Takeover Handoff, which expires after 30 minutes by default and 120 at most; the Computer uses the same [Takeover Handoff](../../GLOSSARY.md). Credentials are typed only in the live view, never in chat, and the Takeover Handoff never logs the Bot's sentence.

Why: synthetic CDP input breaks IME composition, so the Human path must be the viewer. A blocking tool held the Bot's turn while the Human was away; an Inbox wake lets the Bot resume with a fresh observation.

Enforced by: `packages/core/test/takeover-handoffs.test.ts`, `cli-takeover.test.ts`, `packages/browser/test/viewer-local.test.ts`, `browser-tools.test.ts` (no blocking `browser_takeover` tool).
