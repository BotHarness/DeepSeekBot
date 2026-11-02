import { File, Paths } from 'expo-file-system';

import { createProfileTabMemory } from './profile-tabs';

const file = (): File => new File(Paths.document, 'deepseekbot-profile-tab.json');

export const profileTabMemory = createProfileTabMemory({
  async read() {
    const stored = file();
    return stored.exists ? (JSON.parse(await stored.text()) as unknown) : undefined;
  },
  write(value) {
    try {
      const stored = file();
      if (!stored.exists) stored.create();
      stored.writeSync(JSON.stringify(value));
    } catch {}
  },
});
