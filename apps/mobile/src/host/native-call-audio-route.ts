import { File, Paths } from 'expo-file-system';

import { createCallAudioPreference } from './call-audio-route';

const file = () => new File(Paths.document, 'deepseekbot-call-audio-route.json');

export const callAudioPreference = createCallAudioPreference({
  async read() {
    const stored = file();
    return stored.exists ? (JSON.parse(await stored.text()) as unknown) : undefined;
  },
  write(audio) {
    const stored = file();
    if (!stored.exists) stored.create();
    stored.writeSync(JSON.stringify(audio));
  },
});
