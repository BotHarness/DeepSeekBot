import type { PrivateInputDeclaration } from './contracts.js';
import type { PrivateInputOrigin } from './im-origin.js';

const DECLINE_WINDOW_MS = 5 * 60_000;

export function declineKey(
  owner: { botSlug: string; createdAt: string },
  channelId: string,
  request: PrivateInputDeclaration,
  origin?: PrivateInputOrigin,
): string {
  return JSON.stringify([
    owner.botSlug,
    owner.createdAt,
    origin === undefined ? ['app', channelId] : ['im', origin.conversationKey],
    request.account,
    request.fields.map(({ id }) => id).sort(),
  ]);
}

export class PrivateInputDeclines {
  readonly #until = new Map<string, number>();

  has(key: string): boolean {
    return (this.#until.get(key) ?? 0) > Date.now();
  }

  remember(key: string): void {
    this.#until.set(key, Date.now() + DECLINE_WINDOW_MS);
  }

  sweep(): void {
    const now = Date.now();
    for (const [key, until] of this.#until) if (until <= now) this.#until.delete(key);
  }

  clear(): void {
    this.#until.clear();
  }
}
