# Decision Format

Decisions live as sections of topic documents in `docs/decisions/<topic>.md`, one document per area (for example `sessions.md`, `workspaces.md`, `tob.md`). There is no `docs/adr/` directory and no numbered ADR file: `pnpm lint` (`scripts/check-no-adr-files.mjs`) refuses any file there. Former numbered ADRs survive as section anchors such as `docs/decisions/persistence.md#adr-0041`.

Add a new section to the matching topic document, or amend the section the decision changes. If no topic fits, create a new `docs/decisions/<topic>.md` with the same header shape as its siblings.

## Template

```md
## N. {The decision, stated as a rule}

<a id="{descriptive-anchor}"></a>
_New in #{issue}._ (or _Amends section M._)

{The current decision in present tense, written as rules. Include the concrete limits, names and owners a reader needs.}

Why: {the reasons a reader cannot get from the code: the context and the trade-off.}

Enforced by: {the real test files that hold the rule}.
```

Keep it short. A section can be one rule paragraph plus its Why and Enforced by lines. History stays in Git and the PR, not in the document.

## Optional content

Only include these when they add genuine value:

- **Rejected alternatives**, inside the Why paragraph or as a short list, when the rejection is non-obvious.
- **Proposed** in the heading, with the tracking issue, for a decision that has not shipped yet. Say so in the Enforced by line too.

## Anchors

Use a descriptive anchor (`tob-memory-lease`) for a new section. Keep every existing `adr-NNNN` anchor when you move or rewrite a section, because other documents and the changelog link to them. Link to a decision by its anchor: `[Workspace decisions](../decisions/workspaces.md#adr-0356)`.

## When to record a decision

All three of these must be true:

1. **Hard to reverse**: the cost of changing your mind later is meaningful
2. **Surprising without context**: a future reader will look at the code and wonder "why on earth did they do it this way?"
3. **The result of a real trade-off**: there were genuine alternatives and you picked one for specific reasons

If a decision is easy to reverse, skip it: you'll just reverse it. If it's not surprising, nobody will wonder why. If there was no real alternative, there's nothing to record beyond "we did the obvious thing."

### What qualifies

- **Architectural shape.** "We're using a monorepo." "The write model is event-sourced, the read model is projected into Postgres."
- **Integration patterns between contexts.** "Ordering and Billing communicate via domain events, not synchronous HTTP."
- **Technology choices that carry lock-in.** Database, message bus, auth provider, deployment target. Not every library: just the ones that would take a quarter to swap out.
- **Boundary and scope decisions.** "Customer data is owned by the Customer context; other contexts reference it by ID only." The explicit no-s are as valuable as the yes-s.
- **Deliberate deviations from the obvious path.** "We're using manual SQL instead of an ORM because X." Anything where a reasonable reader would assume the opposite. These stop the next engineer from "fixing" something that was deliberate.
- **Constraints not visible in the code.** "We can't use AWS because of compliance requirements." "Response times must be under 200ms because of the partner API contract."
- **Rejected alternatives when the rejection is non-obvious.** If you considered GraphQL and picked REST for subtle reasons, record it; otherwise someone will suggest GraphQL again in six months.
