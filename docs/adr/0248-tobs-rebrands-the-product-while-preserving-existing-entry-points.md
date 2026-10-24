---
Status: Accepted
Date: 2026-10-24
---

# Tobs rebrands the product while preserving existing entry points

The Human chose **Tobs / 托布** as the application brand replacing DeepSeekBot; **BotHarness** remains the framework and **Tob** remains the built-in Steward Bot. The canonical product site becomes `tobs.app`, and newly generated campaign links use `go.tobs.app`.

Existing website domains remain maintained and redirect to the corresponding new pages. Existing short links retain their identifiers, data and attribution. Mobile applications retain their store records and installation identities; the new `tobs` command and installation entry coexist with supported `deepseekbot` entry points, subject to verified package-name availability. Public rebranding does not itself rename storage, authentication callbacks or device-connection endpoints.

We choose continuity over replacing every legacy identifier: a coordinated identity reset would put existing installations, links, scripts and shared data at risk without being necessary to adopt the new brand. Compatibility has no automatic sunset date. Execution details, verification and rollback gates live in the [migration plan](../proposals/tobs-brand-migration.md); acceptance of this decision does not mean the migration has shipped.
