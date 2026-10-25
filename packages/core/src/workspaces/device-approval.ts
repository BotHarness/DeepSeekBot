import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { z } from 'zod';

const Target = z.object({ identity: z.string(), epoch: z.string().uuid() });

export function createDeviceApprovalScope(file: string, identity: () => string) {
  let target: z.infer<typeof Target> | undefined;
  const save = (next: z.infer<typeof Target>) => {
    mkdirSync(dirname(file), { recursive: true, mode: 0o700 });
    const temporary = file + '.' + randomUUID() + '.tmp';
    writeFileSync(temporary, JSON.stringify(next), { mode: 0o600 });
    renameSync(temporary, file);
  };
  const current = (): string => {
    if (target === undefined && existsSync(file)) {
      try {
        target = Target.parse(JSON.parse(readFileSync(file, 'utf8')));
      } catch {
        target = undefined;
      }
    }
    const selected = identity();
    const next =
      target?.identity === selected ? target : { identity: selected, epoch: randomUUID() };
    if (target !== next) {
      save(next);
      target = next;
    }
    return JSON.stringify([next.identity, next.epoch]);
  };
  return {
    current,
    invalidate(): void {
      if (target === undefined && !existsSync(file)) return;
      const next = { identity: identity(), epoch: randomUUID() };
      save(next);
      target = next;
    },
  };
}

export class DeviceCallApprovals {
  readonly #calls = new Map<symbol, () => boolean>();

  authorize(token: symbol, authorized: () => boolean): () => void {
    this.#calls.set(token, authorized);
    return () => this.#calls.delete(token);
  }

  allowed(token: symbol): boolean {
    return this.#calls.get(token)?.() === true;
  }

  clear(): void {
    this.#calls.clear();
  }
}
