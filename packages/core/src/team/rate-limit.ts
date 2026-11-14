import { createHash } from 'node:crypto';

export class SignInRateLimit {
  private readonly attempts = new Map<string, { count: number; until: number }>();
  constructor(private readonly now: () => number = Date.now) {}

  admit(username: string, ip?: string): number {
    const now = this.now();
    for (const [key, entry] of this.attempts) if (entry.until <= now) this.attempts.delete(key);
    const keys = [`u:${username}`, ...(ip === undefined ? [] : [`ip:${ip}`])].map((key) =>
      createHash('sha256').update(key).digest('hex'),
    );
    let retry = 0;
    for (const [index, key] of keys.entries()) {
      const entry = this.attempts.get(key);
      if (!entry) continue;
      if (entry.count >= (index === 0 ? 5 : 20))
        retry = Math.max(retry, Math.ceil((entry.until - now) / 1000));
    }
    if (retry > 0) return retry;
    if (this.attempts.size + keys.filter((key) => !this.attempts.has(key)).length > 4096) return 60;
    for (const key of keys) {
      const entry = this.attempts.get(key) ?? { count: 0, until: now + 60_000 };
      entry.count += 1;
      this.attempts.set(key, entry);
    }
    return 0;
  }
}
