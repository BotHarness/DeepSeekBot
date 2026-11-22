import { dmChannel, type ProfileBotRef } from './bot-profile';
import { MethodRefused, type HostClient } from '@botharness/host-client/client';
import { saveMemoryFile as saveHostMemoryFile } from '@botharness/host-client/memory';

export function memoryConflict(error: unknown): boolean {
  return error instanceof MethodRefused && error.code === 'memory-conflict';
}

let edits = 0;
export function memoryEditId(now = Date.now()): string {
  edits += 1;
  return `phone-${now.toString(36)}-${edits.toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export async function saveMemoryFile(
  client: HostClient,
  bot: ProfileBotRef,
  input: { path: string; body: string; expectedHead: string },
): Promise<string> {
  const channelId = await dmChannel(client, bot);
  const commit = await saveHostMemoryFile(client, {
    channelId,
    path: input.path,
    body: input.body,
    expectedHead: input.expectedHead,
    editId: memoryEditId(),
  });
  return commit.sha;
}
