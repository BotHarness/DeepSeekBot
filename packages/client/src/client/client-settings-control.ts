export type ClientSettingsDomainName = 'preferences' | 'layout' | 'shortcuts';

export const CLIENT_SETTINGS_DOMAINS: readonly ClientSettingsDomainName[] = [
  'preferences',
  'layout',
  'shortcuts',
];

export class ClientSettingsError extends Error {
  constructor(
    readonly code: string,
    message = code,
  ) {
    super(message);
  }
}

export interface ClientSettingsDeadline {
  readonly expiresAt: number;
  readonly signal: AbortSignal;
}

export interface ClientSettingsDomain {
  read(): unknown;
  write(patch: unknown, deadline: ClientSettingsWrite): unknown;
}

export interface ClientSettingsWrite extends ClientSettingsDeadline {
  readonly expectedRevision: string;
  assertLive(): void;
}

export function settingsRevision(value: unknown): string {
  const text = JSON.stringify(value, (_key, entry: unknown) =>
    typeof entry === 'object' && entry !== null && !Array.isArray(entry)
      ? Object.fromEntries(
          Object.entries(entry as Record<string, unknown>).sort(([a], [b]) =>
            a < b ? -1 : a > b ? 1 : 0,
          ),
        )
      : entry,
  );
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `r${hash.toString(36)}-${text.length.toString(36)}`;
}

function object(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export class ClientSettings {
  readonly #domains = new Map<ClientSettingsDomainName, ClientSettingsDomain>();
  constructor(private readonly now: () => number = Date.now) {}

  register(name: ClientSettingsDomainName, domain: ClientSettingsDomain): () => void {
    this.#domains.set(name, domain);
    return () => {
      if (this.#domains.get(name) === domain) this.#domains.delete(name);
    };
  }

  async execute(
    raw: unknown,
    expectedRevision: unknown,
    deadline: ClientSettingsDeadline,
  ): Promise<unknown> {
    const input = object(raw);
    const name = input.domain;
    if (typeof name !== 'string' || !CLIENT_SETTINGS_DOMAINS.includes(name as never))
      throw new ClientSettingsError('client-settings-invalid-input');
    const domain = this.#domains.get(name as ClientSettingsDomainName);
    if (!domain) throw new ClientSettingsError('client-settings-unavailable');
    const assertLive = () => {
      if (deadline.signal.aborted || this.now() >= deadline.expiresAt)
        throw new ClientSettingsError('appearance-request-stale');
    };
    assertLive();
    if (input.patch === undefined) return await domain.read();
    if (typeof expectedRevision !== 'string')
      throw new ClientSettingsError('appearance-revision-required');
    return await domain.write(input.patch, { ...deadline, expectedRevision, assertLive });
  }
}

export const clientSettings = new ClientSettings();
