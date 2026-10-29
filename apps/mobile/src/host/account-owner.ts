export interface AccountOwner {
  issuer: 'https://api.workos.com';
  relay: string;
  clientId: string;
  subject: string;
}

export function parseAccountOwner(input: unknown): AccountOwner | undefined {
  if (typeof input !== 'object' || input === null) return undefined;
  const value = input as Record<string, unknown>;
  if (
    value['issuer'] !== 'https://api.workos.com' ||
    typeof value['relay'] !== 'string' ||
    typeof value['clientId'] !== 'string' ||
    typeof value['subject'] !== 'string' ||
    !value['subject']
  )
    return undefined;
  return {
    issuer: value['issuer'],
    relay: value['relay'],
    clientId: value['clientId'],
    subject: value['subject'],
  };
}

export function sameAccount(a: AccountOwner | undefined, b: AccountOwner): boolean {
  return (
    a?.issuer === b.issuer &&
    a.relay === b.relay &&
    a.clientId === b.clientId &&
    a.subject === b.subject
  );
}
