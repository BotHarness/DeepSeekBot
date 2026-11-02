# Cloud navigation and sharing

User-confirmed direction, issue [#2161](https://github.com/BotHarness/DeepSeekBot/issues/2161). This document describes the target UX; the first implementation only marks existing direct-cloud channel titles. UAT only; no Prod. Prior slices were merged with Human authorization; new slices retain their own acceptance gates.

## Channel identity

Place an outline cloud glyph directly after a cloud channel's displayed name in the channel list and conversation header. Keep the name as text, allow wrapping/ellipsis according to its existing surface, reserve glyph space and announce "Cloud channel" to assistive technology. Cloud identity is stable provenance, not presence, connectivity, subscription status or an unread indicator. Disconnection does not remove the mark.

A local group with mirrored external messages is still a local group. Its cloud connection can be shown separately, but neither the last author nor presence of a cloud-origin message proves remote channel ownership. Desktop list/header need the same authoritative origin projection before using the cloud-channel mark. Do not rename stored channel names or append a Unicode symbol to API data.

## One left sheet, two kinds of destination

Reuse the native app's existing left sheet. Group destinations into Computers and Cloud workspaces. Computer entries retain current Host connection/switching behavior. Cloud entries use the cloud instance and organization as their identity; selecting one filters channels through the cloud service and does not require a local Host.

A cloud organization entry may represent full membership or access to only one or more invited channels. Both show the organization name/icon. Channel guests are labeled "Guest" and see only granted channels; they cannot list other channels, members, organization settings, or create channels. An organization icon is a navigation aid, not proof of membership. Server authorization enforces this before returning data. If a user has both membership and a direct grant, show one organization entry; removing membership must recompute access from the remaining grants.

Use `(instanceId, organizationId)` keys so identical names across self-hosted services do not collide. Show the service domain in details or when names collide. Keep selected cloud destination separate from selected local Host. No channel-only guest is auto-promoted into an organization.

## Create, share, join

The primary channel-list action is **Create or join**: Create channel, Join with invitation (paste URL or scan), and a secondary Connect cloud service option for users who only have a deployment address. The service instance is not the collaboration destination and must not become a compulsory server-management step. A direct invitation carries the target through necessary instance trust and sign-in; the user then confirms and lands in that channel. A bare service address can connect an instance but cannot grant organization or channel membership.

The join preview shows organization name/icon, channel name and cloud mark, explicit organization-versus-channel-only access, service domain, current instance account, and Join/Open/Sign in as appropriate. Only disclose metadata the service authorizes; a recipient-bound invitation can show a neutral sign-in preview until verified. Keep the pending target across browser return and cold launch, without redirecting a cloud-only user to computer pairing. Wrong-account, expired/revoked and unavailable-service states preserve a clear recovery path. Registration may provision a default organization internally, but joining an invitation must not detour into creating/configuring that organization.

[Slack/Discord primary-source research](../research/2026-10-18-cloud-join-ux.md) supports combining create/join and destination-first invitation flows. Discord's channel-created invite still joins its server; TOB's channel-only access instead resembles Slack guest scope. Slack Connect is not the current non-federated design. Invitation QR display/save is our proposed representation of the same scoped URL, not a claim that both reference products provide that exact flow.

Organization creation leads to its channels and a Share organization action. Channel creation opens the conversation with Share channel. Existing destinations expose the same actions in their details/menu. Sharing uses one sheet with a visible target and scope:

| Scope        | Recipient gets                                                                   |
| ------------ | -------------------------------------------------------------------------------- |
| Organization | Organization membership and its ordinary channels, subject to role/history rules |
| Channel      | Only the selected channel; organization identity for navigation                  |

The sheet offers Copy invitation link, Show QR code and Save QR image. These are representations of the same invitation. A resource URL is not an invitation and cannot grant access. Invitation expiry, revocation and any recipient restrictions are server-owned. Existing email-bound invitations remain email-bound unless a separate scoped share-link capability is deliberately introduced; displaying an invitation ID as a URL must not bypass that rule.

The recipient opens the link/scans → sees service domain, organization/channel and access scope → trusts/selects the instance → signs in to that instance → explicitly accepts → lands in the destination. Never send existing credentials to a server solely because its address appeared in a QR code. QR content never contains administrator, WorkOS or Agent credentials. Unknown/expired/revoked/wrong-account invitations show actionable failure and do not partially join.

## Delivery order

1. Cloud name marks on actual direct-cloud list/title surfaces, with accessible name and assigned device evidence. Desktop gets the same mark only when its origin projection is authoritative.
2. Existing left sheet lists cloud organizations including channel guests. Actual user A invites B only to channel X; B sees the organization entry and X, cannot fetch sibling Y through UI or CLI. Revoke X and refresh removes that destination when no grants remain.
3. Owner creates a channel → shares an invitation URL/QR → a second account accepts → both see the same channel. Add equivalent CLI/API and retry/revocation checks. Preserve existing default join-history and local Bot execution boundaries.
4. Save/share QR natively, deep-link cold launch, long names, duplicate service names, offline states, light/dark and large text; qualify iOS and Android separately.

The current cloud collaboration goal remains active. This UX work does not claim WebSocket, organization-wide Agent membership, arbitrary local work or enterprise authorization to be complete.

## Invitation URL tracer (in progress)

Recipient-bound invitations use `https://<instance>/join?invitation=<id>`. The URL is a locator, never a membership credential. Its neutral browser landing links to the native join screen without disclosing recipient or target metadata. Mobile and CLI resolve the recipient-only preview endpoint before explicit acceptance; existing acceptance remains the sole membership write. No reusable public bearer invitation is introduced.

The app keeps one pending invitation as a device-local navigation draft across browser return and restart. New service discovery is unauthenticated and redirects are refused; the discovered server must match the URL. Trust confirmation imports the public connection configuration through the existing validation flow. An existing session can only be sent to its imported server; changed configuration requires the existing re-verification path. Wrong accounts can sign out and retry without losing the target. Accepting a channel invitation navigates to that exact channel and uses guest APIs, never organization selection.

The sender can copy/share the same invitation URL. The join screen accepts pasted links and camera QR input, and the existing create menu exposes Join with invitation. With no paired computer, the app opens this neutral entry point and retains Connect a computer. QR rendering/save remains separate unfinished work. The assigned iOS Simulator run verified recipient preview, pending/cold restart, direct guest entry, one native message, revoked access and isolated session cleanup; [the evidence record](../../.github/pr-screenshots/2161-invitation-journey/README.md) binds each capture to its source. Sender sharing, new-instance trust/Hosted AuthKit continuation, camera and Android acceptance remain open.

## Shared workspace drawer tracer

The mobile root now owns one drawer for Computers and Cloud workspaces. The directory combines current memberships with organization identity attached only to currently authorized guest channels, keyed by instance and organization. Selecting a guest workspace uses the filtered guest-channel endpoint and never selects a WorkOS organization. Reopening reloads grants; saved account/configuration changes clear the display scope, while ordinary token refresh preserves drafts.

[Batch 22 evidence](../../.github/pr-screenshots/2161-workspace-drawer/README.md) verifies native member/guest navigation, actual-session authorization readback, revocation, refresh, cold directory restore, logout/account change across restart, and three text sizes in light/dark. Computer-return navigation had no paired fixture and remains untested; pagination/error/cancellation guarantees currently have source coverage only. Android, physical camera, Human acceptance and the remaining sharing/QR flow remain separate gates. This is still a Draft UAT slice, not a completed collaboration goal.
