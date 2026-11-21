import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

export interface ComputerPauseStore {
  read(): boolean;
  write(paused: boolean): void;
}

export function createComputerPauseStore(path: string): ComputerPauseStore {
  return {
    read() {
      let source: string;
      try {
        source = readFileSync(path, 'utf8');
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
        throw error;
      }
      const value: unknown = JSON.parse(source);
      if (
        typeof value !== 'object' ||
        value === null ||
        !('version' in value) ||
        value.version !== 1 ||
        !('paused' in value) ||
        typeof value.paused !== 'boolean'
      )
        throw new Error('Computer pause record is invalid');
      return value.paused;
    },
    write(paused) {
      mkdirSync(dirname(path), { recursive: true });
      const temporary = `${path}.${randomUUID()}.tmp`;
      try {
        writeFileSync(temporary, `${JSON.stringify({ version: 1, paused })}\n`, {
          encoding: 'utf8',
          mode: 0o600,
          flush: true,
        });
        renameSync(temporary, path);
      } catch (error) {
        try {
          rmSync(temporary, { force: true });
        } catch {}
        throw error;
      }
    },
  };
}
