# Cloud join UX: invitation first, service connection when needed

Research date: 2026-10-18. Scope: first-party Slack and Discord documentation, with proposed DeepSeekBot/TOB UX. This is documentation research, not an observation of signed-in production UI or a completed implementation. No shared device was used. Related target: [Cloud navigation and sharing](../architecture/cloud-navigation.md), [#2161](https://github.com/BotHarness/DeepSeekBot/issues/2161).

## Recommendation

Put **Create or join** in the existing channel flow. An invitation should take the recipient to a recognizable organization/channel preview, through any necessary instance sign-in, and into that destination. The service address is relevant context and a trust decision for a new service; it should not force every person through a separate server-administration journey.

Keep three different concepts clear:

- **Cloud service / instance:** official hosting or someone else's self-hosted TOB deployment. It owns its authentication boundary and organizations. Multiple saved instances do not imply federation.
- **Cloud workspace / organization:** the navigation and membership boundary inside one instance. This is closer to a Slack workspace or Discord server than the TOB instance is.
- **Channel:** a conversation. A direct channel invitation can grant access without organization membership. Showing its organization identity in navigation does not widen that grant.

These are recommendations based on the Human's confirmed model, not claims about Slack or Discord internals.

## What the official examples establish

| Example                    | Documented behavior                                                                                                                                                                                                                                                                                                             | Apply to TOB                                                                                                                                                                            |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Discord entry              | The server-list `+` offers creation and joining. A recipient can paste an invite or open it directly, review settings, then accept. [Join a Server](https://support.discord.com/hc/en-us/articles/360034842871-How-do-I-join-a-Server)                                                                                          | Put create and join together. Lead with the collaboration destination instead of a remote-service settings form.                                                                        |
| Discord channel invitation | Invitations can originate beside a channel; that channel becomes the arrival destination. The invitation still joins the server. [Invite friends](https://support.discord.com/hc/en-us/articles/204155938-How-do-I-invite-friends-to-my-server)                                                                                 | Borrow the contextual share action and arrival behavior, **not** the implication that joining a channel grants organization membership.                                                 |
| Discord share controls     | Invite creation supports copying a link; expiration/use controls and removal are managed by authorized users. [Invites 101](https://support.discord.com/hc/en-us/articles/208866998-Invites-101)                                                                                                                                | Reuse one scoped invitation for URL and QR; let the service enforce its validity.                                                                                                       |
| Slack workspace invitation | Invited people accept an invitation and establish their workspace account. The documented mobile flow starts from the invitation, not from manually configuring a server. [Join a workspace](https://slack.com/help/articles/212675257-Join-a-Slack-workspace)                                                                  | Preserve the invitation target across authentication and return there. Do not insert a compulsory workspace-creation tutorial before accepting a channel invitation.                    |
| Slack invitation scope     | Authorized inviters can send workspace invitations or, on relevant plans, invite guests to specified channels. Workspace invite links are shareable. [Invite members](https://slack.com/help/articles/201330256-Invite-new-members-to-your-workspace)                                                                           | Make organization and channel scope visible in the same invitation sheet; do not copy plan restrictions or mobile feature gaps.                                                         |
| Slack membership vs guest  | Members can browse/join public channels; guests cannot. Single-channel guests access one assigned channel; multi-channel guests access specified channels. [Join a channel](https://slack.com/help/articles/205239967-Join-a-channel), [Guest roles](https://slack.com/help/articles/202518103-Understand-guest-roles-in-Slack) | Org membership and direct channel grants must remain different authorities. A guest sees only granted channels, including on direct API/CLI requests.                                   |
| Slack Connect              | Acceptance reviews invitation details and channel settings; mobile users select their workspace. It connects collaboration across companies' existing workspaces. [Accept a Connect invitation](https://slack.com/help/articles/360049769934-Accept-a-Slack-Connect-channel-invitation)                                         | Borrow explicit preview and confirmation. Do not require recipients to choose a receiving workspace: TOB's current direct invitation is not Slack Connect or cross-instance federation. |
| Slack switching            | Mobile Home can swipe right to select a signed-in workspace; desktop uses a workspace icon/list. [Switch workspaces](https://slack.com/help/articles/1500002200741-Switch-between-workspaces)                                                                                                                                   | Reuse the native left sheet for Computers and Cloud workspaces, including guest-only org projections.                                                                                   |

**QR evidence boundary:** Discord documents QR **login** as authorizing another device, with an explicit approval step. That is a different action from accepting a channel invitation. This research did not establish a first-party Slack/Discord invitation-QR-and-save workflow. TOB's invitation QR is therefore a product recommendation: encode the same scoped invitation URL, never an account session or administrator credential. [Discord QR login](https://support.discord.com/hc/en-us/articles/360039213771-QR-Code-Login-FAQ)

The sources establish entry points and steps. Exact current pixels, animation, logged-out-to-app handoff behavior, and every failure state have not been tested in Slack/Discord; the designs below are TOB proposals rather than reproduced screens.

## One coherent entry flow

Use the existing channel-list add action, with an action sheet titled **Create or join** (`创建或加入`):

1. **Create channel** (`创建频道`). Default to the selected destination when the user can create there; otherwise show eligible local/remote destinations. A cloud workspace picker can include **Create workspace** as a secondary action. Creation opens the actual channel, then offers its existing **Invite** action without blocking chat.
2. **Join with invitation** (`通过邀请加入`). Paste invitation URL or scan QR. An external invitation URL/deep link goes straight to the same preview and skips this input page.
3. **Connect a cloud service** (`连接云服务`) as a secondary path for people who have only an address and no invitation. Official hosting is a known choice; self-hosting takes an HTTPS address or configuration QR. After instance sign-in, show the user's memberships, direct channel grants, and pending invitations. Do not expose an unrestricted organization directory or imply that knowing the address grants membership.

The native left sheet also exposes this shared entry point. Keep **Add computer** separate because pairing a DSH Host grants a different kind of connection. A pure-cloud user must be able to use these flows without first pairing any computer.

Do not simply rename every existing “server” label. The flow must preserve an invitation destination rather than making people connect, navigate back, discover an organization again, and find the channel manually.

## Recipient preview

The preview is an ordinary join page or sheet, not a configuration dashboard. Example copy for a channel invitation:

```text
[Organization icon]  Acme Design
# design-review  [cloud icon]

You are invited to this channel.
You can see and participate in this channel only.

Cloud service     chat.acme.example
Joining as        alex@example.test   Change account

[ Join channel ]
```

For an organization invitation, replace the scope with **Join Acme Design** and a clear explanation of organization membership and the available ordinary channels. Do not reuse the channel-only explanation. Names and logos are presentation supplied by the destination; the visible service domain distinguishes similarly named services.

Before authentication, show only information that the invitation service deliberately permits in its preview. If current email-bound invitations require an authenticated identity before resolving names, show a neutral “Sign in to view your invitation” card with the service domain, then resolve the full target after authentication. Do not add anonymous directory access merely to populate a prettier card. Member counts, participant emails, message snippets, and sibling channel lists are unnecessary for this first slice.

CTA progression:

| State                     | Primary action                  | After success                                                     |
| ------------------------- | ------------------------------- | ----------------------------------------------------------------- |
| Unknown service           | Continue to `chat.acme.example` | Trust/config checks and that instance's sign-in; retain target    |
| Known service, signed out | Sign in to join                 | Return to the same preview with the resolved account              |
| Correct signed-in account | Join channel / Join workspace   | Persist grant, refresh authorized navigation, open target         |
| Already joined            | Open channel / Open workspace   | Open existing target without a second grant                       |
| Wrong recipient account   | Switch account                  | Sign in to this instance with a different identity; retain target |

A first-time service trust decision may be inline on this page, with expanded service details available. Do not silently accept a new authentication issuer or forward a token from a previously connected instance to an arbitrary QR URL. Existing trusted-configuration verification remains real even when its presentation is simpler.

## Navigation after joining

- One left sheet: **Computers**, then **Cloud workspaces**. Cloud selection filters conversations independently of the current computer.
- A channel guest sees the organization icon/name, a discreet **Guest** label, and only the authorized channel(s). No empty sibling rows, organization member directory, or organization management entry.
- If full membership and direct grants both exist, show one org destination. Losing membership recomputes access from remaining grants; it does not delete still-authorized guest channels or retain org privileges.
- Identify destinations with instance identity plus organization identity; show the service domain for collisions/details. Do not merge identical names from different deployments.
- Channel list and conversation header place the cloud mark immediately after the displayed name, consistently with the current first slice.

## Sender share sheet

Creation and later sharing open the same contextual **Invite** sheet:

- Organization: **Invite to Acme Design**; channel: **Invite to #design-review**.
- State the resulting scope in one line. A channel invite does not upgrade the recipient to org membership.
- Offer **Copy invitation link**, **Show QR**, **Save QR**, and native **Share** where supported. The QR and link represent the same invitation and validity.
- For the existing email-bound invitation model, collect/retain the intended recipient and label the restriction. Forwarding a link does not make it an open enrollment link.
- A generic reusable link for anyone holding it would be a new server-owned invitation capability with its own expiry/revocation/use semantics. Do not simulate one by encoding a resource ID or removing the email check in the client.
- Existing-member deep links can simply open authorized resources. Label them as links, not invitations, and offer a real scoped invitation when access must be granted.

## Cold launch and recovery

The following are proposed acceptance behaviors, not claims that existing code already provides them:

| Event                                | Required behavior                                                                                                                                                               |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cold app, no Host                    | Route directly to pending join intent; do not redirect to computer pairing.                                                                                                     |
| External QR vs pasted URL            | Both resolve to the same preview, permissions, and acceptance operation.                                                                                                        |
| Browser authentication return        | Bind continuation to the selected instance and original invite; validate auth state/PKCE; resolve fresh invitation state before accepting. No arbitrary return URL.             |
| App interrupted while authenticating | Resume a local pending intent or allow reopening the link. If the auth transaction expired, start a new transaction; never silently switch target.                              |
| Network loss after acceptance        | Reconcile current membership/grant with the server. Retrying must not duplicate membership or create another workspace.                                                         |
| Expired/revoked invite               | Explain that the invitation is unavailable and offer opening another link/contacting the inviter. Do not auto-create an org or silently broaden scope.                          |
| Wrong account                        | Show the account mismatch without exposing another recipient's private identity; allow switching this instance's account while preserving other instance sessions.              |
| Service unavailable                  | Keep target/address and offer Retry; existing local computer navigation still works.                                                                                            |
| Service configuration changes        | Re-run trusted-configuration validation; require renewed confirmation where the existing trust contract requires it. Do not convert an invite into authority to change issuers. |
| Grant revoked while viewing          | Close or disable unauthorized content, refresh navigation, remove an org destination only when no membership/grants remain.                                                     |
| Scanner permission denied            | Keep paste-link/manual-address path available.                                                                                                                                  |

Pending invitation links may themselves confer limited authority; do not publish their raw tokens in logs, screenshots, analytics, or PR evidence. An image saved by the inviter contains the same invitation authority as the copied link, not a safer version of it.

## Suggested next tracer bullet

**A creates channel → invites B to that channel → B opens a link or scans QR on a phone with no paired computer → sees target/scope/service → signs in if necessary → confirms → lands in the channel; the left sheet shows its organization as Guest; sibling channel access fails through UI and CLI.**

First extend the existing recipient-bound invitation rather than simultaneously introducing public reusable links, org discovery, federation, or Slack Connect semantics. Keep the channel destination across auth and use the current server grant authority. Add a minimal authorized organization name/icon projection for guest navigation without granting org-directory access.

Required evidence: existing-instance and new-instance paths; cold launch; wrong-account recovery; duplicate acceptance/retry; sibling denial; revocation; screenshots of actual preview and post-join sheet; CLI parity. Native QR-save/export and both mobile platforms need their own runtime evidence; a successful URL parser or rendered mock does not qualify those behaviors.
