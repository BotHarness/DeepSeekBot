---
Status: Accepted
Date: 2026-10-24
---

# Tobs rebrands the product while preserving existing entry points

The Human chose **Tobs / 托布** as the application brand replacing DeepSeekBot; **BotHarness** remains the framework and **Tob** remains the built-in Steward Bot. The canonical product site becomes `tobs.app`, and newly generated campaign links use `go.tobs.app`.

Existing website domains remain maintained and redirect to the corresponding new pages. Existing short links retain their identifiers, data and attribution. Mobile applications retain their store records and installation identities; the new `tobs` command and installation entry coexist with supported `deepseekbot` entry points, subject to verified package-name availability. Public rebranding does not itself rename storage, authentication callbacks or device-connection endpoints.

The npm entry `tobs` depends on the exact matching `deepseekbot` release and exposes only the `tobs` executable. The legacy package retains its executable. Both entries use the same component versions and byte-identical Bundle Patch, preserving Plugin and storage identities. Components publish first, then `deepseekbot`, then `tobs`; qualification checks both entries before publication. Separate executable ownership permits independent global uninstall without deleting the other command. Existing Profiles do not need a second Bundle or a data migration to adopt the new command.

Both product archives include the prepared desktop compatibility assets at their own stable Bundle path. Desktop setup links to that path, not a versioned pnpm store directory, so a product upgrade does not turn an owned theme link into a conflicting one.

Android applies localized launcher names through an Android-only Expo config plugin. Application IDs, schemes and signing identities remain unchanged; iOS and shared application copy are maintained separately. Generated native resources are build outputs, not another configuration authority.

We choose continuity over replacing every legacy identifier: a coordinated identity reset would put existing installations, links, scripts and shared data at risk without being necessary to adopt the new brand. Compatibility has no automatic sunset date. Execution details, verification and rollback gates live in the [migration plan](../proposals/tobs-brand-migration.md); acceptance of this decision does not mean the migration has shipped.
