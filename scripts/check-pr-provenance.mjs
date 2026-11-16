#!/usr/bin/env node

import { pathToFileURL } from 'node:url';

const AGENT_MARK =
  /Agent-Task:|Generated with \[|Co-Authored-By:[^\n]*(?:Claude|Codex|Cursor|Copilot|Gemini|opencode|DeepSeek|Kimi|Qwen|GLM)/iu;
const SOURCE = 'https://github.com/BotHarness/DeepSeekBot/issues/4296#issuecomment-6915452893';

export function provenanceErrors(body, labels) {
  if (!AGENT_MARK.test(body ?? '')) return [];
  const missing = ['harness', 'model'].filter(
    (kind) => !labels.some((label) => label.startsWith(`${kind}:`)),
  );
  return missing.map(
    (kind) =>
      `This PR was written by a coding agent but has no \`${kind}:\` label. ` +
      `Add one for every ${kind} that wrote code, for example ` +
      `${kind === 'harness' ? '`harness:claude-code`' : '`model:claude-opus-5-5`'}. [${SOURCE}]`,
  );
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const labels = JSON.parse(process.env.PR_LABELS ?? '[]').map((label) => label.name ?? label);
  const errors = provenanceErrors(process.env.PR_BODY ?? '', labels);
  if (errors.length) {
    console.error(`pr provenance:\n${errors.join('\n')}`);
    process.exitCode = 1;
  } else console.log('pr provenance: labels present or no agent marker');
}
