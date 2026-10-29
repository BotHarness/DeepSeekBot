export const PRIVATE_INPUT_TOOLS: ReadonlySet<string> = new Set([
  'ask_secret',
  'protected_cli',
  'secret_http',
  'secret_cli',
  'secret_mcp_connect',
]);

export const PRIVATE_SOURCE_GUIDANCE =
  ' For IM work, first call ask_secret in this turn with the same account and field declaration and the exact accepted source_event_id of the request you are handling, even when reusing stored references. A configured account needs no new card. If source selection fails, follow its refusal; never retry unchanged commands, guess a source, or report a network outage. Conflicting account associations require a new turn. Web and Schedule reuse omit source_event_id.';
