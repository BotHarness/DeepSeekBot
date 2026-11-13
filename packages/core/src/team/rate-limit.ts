import { createHash } from 'node:crypto';

export class SignInRateLimit {
  private readonly attempts = new Map<string, { count: number; until: number }>();
  constructor(private readonly now: () => number = Date.now) {}

  admit(username: string, ip: string): number {
    const now = this.now();
    for (const [key, entry] of this.attempts) if (entry.until <= now) this.attempts.delete(key);
    const keys = [`u:${username}`, `ip:${ip}`].map((key) =>
      createHash('sha256').update(key).digest('hex'),
    );
    if (keys.some((key) => !this.attempts.has(key)) && this.attempts.size >= 4096) return 60;
    let retry = 0;
    for (const [index, key] of keys.entries()) {
      const entry = this.attempts.get(key) ?? { count: 0, until: now + 60_000 };
      if (entry.count >= (index === 0 ? 5 : 20))
        retry = Math.max(retry, Math.ceil((entry.until - now) / 1000));
      this.attempts.set(key, entry);
    }
    if (retry > 0) return retry;
    for (const key of keys) this.attempts.get(key)!.count += 1;
    return 0;
  }
}
