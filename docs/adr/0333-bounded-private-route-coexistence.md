# ADR-0333: One private connection owner, two independently managed routes

Status: Accepted for #4079

## Context

A Host may need a temporary Quick Tunnel while retaining a Named Tunnel or an existing private HTTPS ingress. Replacing a singleton configuration loses that intent. Creating another connection authority would split pairing, credentials and revocation.

## Decision

The application-defined Devices private connection owner manages two stable slots: `quick` and `custom`. The custom slot holds either a Named Tunnel or an HTTPS ingress. Docker relay coexistence is outside this slice. Tobs Connect remains owned by its existing account service.

Both slots forward to the existing encrypted device gateway. They share the private owner's admission token and the existing Host identity; neither creates a device grant, identity or permission store. Device revocation remains target-wide in the existing pairing owner.

Add is idempotent for the same configuration. A different configuration in an occupied slot requires explicit Replace. Stop preserves configuration and persists disabled intent; Start restores that slot. Remove forgets only the selected slot. Ambiguous legacy operations without a route ID refuse instead of stopping or replacing an arbitrary route.

The existing credentials Provider and `botharness-core/private-tunnel` key retain protected configuration in a version-2 envelope: shared admission token plus at most two records containing stable ID, enabled intent and runtime configuration. Legacy singleton migration preserves its token, origin port and address and marks its route enabled. Unknown versions and failed persistence fail closed. Public lifecycle operations serialize separately from metadata writes; stale runtime callbacks cannot recreate removed slots or re-enable stopped slots. Only enabled slots restore after Host restart.

A private invitation retains exactly one primary wire `routes` entry for older phones. Its existing `privateRelay` admission may include one explicit `additionalOrigins` entry. Updated clients validate exact private HTTPS origins and retain the bounded list in their existing secure SavedHost. Older clients use only the primary route. A route-specific invitation contains only that route. Same-key rescanning replaces the list rather than accumulating stale Quick Tunnel addresses. Pinned-key checks, fingerprint approval, target-wide revocation and uncertain-write replay restrictions remain unchanged. Private-bound clients do not learn official-service or LAN fallbacks.

## Deployment and rollback

This credentials migration is **not readable by the previous Host binary**. A package/code revert alone is not a supported rollback.

Before first starting the upgraded Host:

1. Stop the exact Host and its private tunnel processes using the normal owner lifecycle.
2. Take a complete protected backup of that Profile and its credentials Provider storage, including its existing encryption/key references. Keep the backup machine-local under the same secret protection as the original. Never export tokens or decrypted credentials into Git, logs or review evidence.
3. Record the matching pre-upgrade package revision and backup location privately. Verify the backup is readable using the Provider's supported restore procedure before upgrading.

For rollback, stop the upgraded Host and all of its owned tunnel processes, restore the matching complete pre-upgrade Profile and protected credentials backup, then start the matching old packages. Do not overwrite only the credentials record while an owner is running. Configuration and grants created after the backup are lost on restore; reconcile them explicitly. There is no SQL schema downgrade or plaintext-secret export step.

A phone downgraded after saving two private routes may reject that saved entry. Use a route-specific single-origin invitation and rescan with the same Host identity; do not bypass fingerprint checks. No claim is made that an older app can manage both routes.

## Consequences and verification

The route limit is structural, not a new provider framework. One failed route does not block another connected route. Quick Tunnel addresses remain ephemeral: stopping/restarting may require a same-key rescan, and old addresses must not accumulate.

Verification covers legacy migration, failed persistence, duplicate Add/restore, independent stop/start, enabled-only restart, bounded admissions, per-origin token confinement, same-key recovery and revocation through both routes. Runtime acceptance additionally exercises a real Quick Tunnel plus private HTTPS ingress through the existing Web, CLI and phone paths. Simulator evidence does not qualify physical-device or Android behavior.
