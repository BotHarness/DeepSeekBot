import type { EmailCodeFlow, EmailCodeOutcome } from './connect-account';

interface Pending {
  flow: EmailCodeFlow;
  finish(outcome: EmailCodeOutcome): void;
}

let pending: Pending | undefined;

export function startEmailCodeSignIn(
  flow: EmailCodeFlow,
  present: () => void,
): Promise<EmailCodeOutcome> {
  pending?.finish({ kind: 'cancelled' });
  return new Promise<EmailCodeOutcome>((resolve) => {
    const request: Pending = {
      flow,
      finish: (outcome) => {
        if (pending === request) pending = undefined;
        resolve(outcome);
      },
    };
    pending = request;
    present();
  });
}

export function takeEmailCodeSignIn(): Pending | undefined {
  return pending;
}
