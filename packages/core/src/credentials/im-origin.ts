import { HarnessError } from '@deepseek-ai/dsh-llm';

const refusals = {
  'private-source-required':
    'Select one live accepted IM source_event_id for private input. Before using this account, call ask_secret with the same account and field declaration plus the exact source_event_id of the request you are handling. A configured account reuses its references without a new input card. Then retry the operation once. If you cannot identify the request, report the ambiguity; do not retry unchanged commands or report a network outage.',
  'private-source-invalid':
    'Private input IM source is unavailable: the selector is not an accepted IM Source Event in this turn. Select the actual current request with ask_secret; never use a historical or guessed source.',
  'private-source-unavailable':
    'Private input IM capability is unavailable. Report that the Host cannot authorize this IM request; do not retry the operation or report a remote outage.',
  'private-source-ambiguous':
    'Private input IM source is ambiguous: this account is associated with different requests in this turn. Do not rebind or choose the latest source. Report the ambiguity and handle one request in a new turn.',
  'private-source-revoked':
    'Private input IM authority changed. Stop using this request and report the refusal; a later local message does not restore its authority.',
  'private-account-unavailable':
    'Credential grant is unavailable for this PersonaBot and account. The account may have been removed or replaced. Call ask_secret to check current configuration; do not retry stale references.',
  'private-input-notice-unavailable':
    'Private input IM handoff is unavailable. This account needs Owner input, but the Host has no Web notification address. Ask the Owner to configure the account in Web Chat; do not retry.',
} as const;

export class PrivateInputRefusal extends HarnessError {
  constructor(code: keyof typeof refusals) {
    super(refusals[code], code);
    this.name = 'PrivateInputRefusal';
  }
}

export interface PrivateInputOrigin {
  sourceEventId: string;
  signal: AbortSignal;
  applies(): boolean;
  current(): boolean;
}

export interface PrivateReplyAuthority {
  signal: AbortSignal;
  current(): boolean;
}
