import {
  LOCAL_VOICE_BASE_URL,
  LOCAL_VOICE_PACKAGES,
  LOCAL_VOICE_SCRIPT_NAME,
} from './local-kit.js';

export const LOCAL_VOICE_SKILL_NAME = 'setting-up-local-voice';

export const LOCAL_VOICE_SKILL_DESCRIPTION =
  'Deploy a free, offline speech service (SenseVoice speech-to-text and Kokoro text-to-speech) on the Host computer, macOS or Windows, and register it as a Bot voice and speech recognition Provider.';

export const LOCAL_VOICE_SKILL_WHEN_TO_USE =
  'When the Human asks for a local, offline or free voice or speech recognition for a Bot, wants a Bot to speak or take calls without a cloud key, or asks you to set up SenseVoice, Kokoro or a local speech service.';

export const LOCAL_VOICE_SKILL_INVOCATION = {
  modelInvocable: true,
  userInvocable: true,
} as const;

export const LOCAL_VOICE_SKILL_SOURCE = 'runtime';

export const LOCAL_VOICE_SKILL_PROVIDER = 'botharness-core';

export const LOCAL_VOICE_SKILL_CONTENT = `# Setting up a local speech service

The service is one Python script that runs SenseVoice (speech to text) and
Kokoro (text to speech, Chinese and English) on the CPU through sherpa-onnx.
It listens only on this computer at ${LOCAL_VOICE_BASE_URL} and speaks the
OpenAI audio API (\`/v1/audio/speech\`, \`/v1/audio/transcriptions\`).

The Host never starts, watches or restarts it. You set it up once; the Human
starts and stops it. Say that plainly when you finish.

## Before you start

Tell the Human what will happen and get a yes before installing anything:

| Part | Download | On disk |
| --- | --- | --- |
| Python packages (sherpa-onnx, numpy) | ~40 MB | ~125 MB |
| SenseVoice int8 (zh, en, ja, ko, yue) | 166 MB | 244 MB |
| Kokoro v1.1 (zh + en, 103 voices) | 365 MB | 427 MB |

Measured on a 4-core x86 machine: download ~20 s on a fast link, unpacking
~100 s, start ~7 s, about 0.9 GB memory while running. Kokoro makes 1 s of
speech in ~0.55 s of CPU time with 2 threads; SenseVoice hears 3 s of audio in
~0.25 s. Apple Silicon is faster. Any 64-bit Mac (macOS 11+) or Windows 10/11
x64 or ARM64 PC works; Linux follows the macOS steps. No GPU, Docker or account
is needed.

Every shell command below goes through the normal approval. Do not batch the
install into one opaque command: run each step so the Human can see it.

## 1. Write the script

Pick a folder the Human owns, for example \`~/BotHarness/voice\` on macOS or
\`%USERPROFILE%\\BotHarness\\voice\` on Windows (absolute path), then:

\`\`\`sh
deepseekbot voice-local-kit --dir <absolute folder>
\`\`\`

It writes \`${LOCAL_VOICE_SCRIPT_NAME}\` and prints the exact steps for macOS and
Windows. If \`deepseekbot\` is not on your PATH, ask the Human to run that
command, or to ask Tob.

## 2. Python

Python 3.9–3.14 is needed (\`python3 --version\`, on Windows \`py -3 --version\`).

- macOS: \`python3\` from python.org or Homebrew works. On a clean Mac the
  bare \`python3\` asks to install the Command Line Tools; that is fine but takes
  a few minutes, so say so.
- Windows: \`py -3\` from python.org, or \`winget install Python.Python.3.12\`.
- Without Python, \`uv\` (one small binary) can provide it: macOS
  \`curl -LsSf https://astral.sh/uv/install.sh | sh\`, Windows
  \`powershell -c "irm https://astral.sh/uv/install.ps1 | iex"\`, then
  \`uv venv --python 3.12 .venv\` and \`uv pip install --python .venv ${LOCAL_VOICE_PACKAGES}\`.

## 3. Install, download, start

macOS (in the folder):

\`\`\`sh
python3 -m venv .venv
.venv/bin/python -m pip install ${LOCAL_VOICE_PACKAGES}
.venv/bin/python ${LOCAL_VOICE_SCRIPT_NAME} download
.venv/bin/python ${LOCAL_VOICE_SCRIPT_NAME} start
.venv/bin/python ${LOCAL_VOICE_SCRIPT_NAME} selftest
\`\`\`

Windows PowerShell (in the folder):

\`\`\`powershell
py -3 -m venv .venv
.venv\\Scripts\\python -m pip install ${LOCAL_VOICE_PACKAGES}
.venv\\Scripts\\python ${LOCAL_VOICE_SCRIPT_NAME} download
.venv\\Scripts\\python ${LOCAL_VOICE_SCRIPT_NAME} start
.venv\\Scripts\\python ${LOCAL_VOICE_SCRIPT_NAME} selftest
\`\`\`

- Keep sherpa-onnx below 2: version 2 drops the espeak fallback and Kokoro
  then skips English words that are not in its lexicon.
- \`download\` prints sizes and seconds; quote them to the Human. On a slow
  link (about 530 MB at 1 MB/s is 9 minutes) run \`download --asr\` and
  \`download --tts\` as two calls. If a call is cut off or fails, run the same
  command again: it continues from the partial file. Do not fetch the
  archives by hand.
- \`start\` runs the server in the background and returns JSON with \`pid\`
  and \`log\`. \`status\` and \`stop\` do what they say. \`serve\` runs it in the
  foreground (Ctrl+C stops it).
- \`selftest\` speaks a phrase through Kokoro and transcribes it back through
  SenseVoice: \`said\` and \`heard\` should roughly match.
- Port 8790 busy: add \`--port <n>\` before the command on every call, and use
  that port in the base URL below.
- Every command prints one JSON line; \`ok: false\` carries a \`code\` and a
  \`message\` (for example \`missing-package\`, \`no-models\`, \`port-busy\`).

## 4. Register it

\`\`\`sh
deepseekbot voice-provider-add local
deepseekbot voice-provider-test <provider-id>
deepseekbot voice-set <bot-id> <provider-id> --voice zf_001
deepseekbot voice-provider-add local --kind asr --language zh
deepseekbot voice-provider-test <asr-provider-id>
deepseekbot voice-asr-set <bot-id> <asr-provider-id>
\`\`\`

- The first three lines give the Bot a voice (Kokoro); the last three let it
  hear (SenseVoice), which Bot calls need. Do both unless the Human wants only
  one. The two Providers have different ids (\`tts-…\` and \`asr-…\`).
- \`voice-provider-add local\` uses ${LOCAL_VOICE_BASE_URL}; pass
  \`--base-url http://127.0.0.1:<port>/v1\` if you changed the port. Writes ask
  the Human for approval.
- \`--language\` is the Human's main language (\`zh\`, \`en\`, \`ja\`, \`ko\`,
  \`yue\`); leave it out to let SenseVoice detect it. An ASR health check
  transcribes half a second of silence, so empty text is a pass.
- Voices: Chinese female such as \`zf_001\`, \`zf_002\`, Chinese male such as
  \`zm_009\`, \`zm_010\`, English female \`af_maple\`, \`af_sol\`, \`bf_vale\`.
  The numbers have gaps; the full list is \`GET /v1/models\`. Let the Human
  pick; offer two or three to try with
  \`voice-provider-test <provider-id> --voice <id>\`.
- If you cannot run these commands, tell the Human: Settings › Voice ›
  New Provider › "Local speech service (Kokoro)", then pick it in the Bot's
  Voice settings. Speech recognition is set up only through the CLI.

## 5. Hand over

Tell the Human, in their language:

- where the folder is;
- start: \`<python> ${LOCAL_VOICE_SCRIPT_NAME} start\` in that folder (after a
  restart of the computer the service is off until started again);
- stop: \`<python> ${LOCAL_VOICE_SCRIPT_NAME} stop\`;
- when it is off, voice messages keep their text and say "The local speech
  service … is not running", calls cannot hear, and \`voice-provider-test\`
  reports \`provider-unavailable\` with the same sentence;
- to remove it: \`deepseekbot voice-provider-remove <provider-id>\` for each of
  the two Providers, then delete the folder.

Never open the port beyond this computer. If the Human insists, the script
refuses unless \`BOTHARNESS_VOICE_KEY\` is set, and the Provider then needs that
key (added by the Human in Settings, never by you).
`;
