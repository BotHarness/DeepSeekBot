import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, sep } from 'node:path';

export async function engineWorkspaceScenario(suite, engine, fullAccess, check, block) {
  if (suite.options.noSubscriptions) {
    block(
      `No test subscription supplied. On an isolated Host, run deepseekbot engine login ${engine} and rerun B4/B5.`,
    );
    return;
  }
  const status = suite.cli(['engine', 'status'], { allowFail: true });
  const account = status.engines?.find((entry) => entry.engine === engine);
  if (account?.available !== true) {
    block(
      `${engine}: ${account?.reason ?? status.error?.code ?? 'subscription unavailable'}. Sign in on this isolated Host with deepseekbot engine login ${engine} and rerun B4/B5.`,
    );
    return;
  }
  const bot = suite.cli([
    'create',
    '--name',
    `Engine permission ${randomUUID().slice(0, 8)}`,
    '--persona',
    'For this test, delegate the requested fixture task using create_assignment.',
    '--operation-key',
    randomUUID(),
  ]).bot;
  const slug = bot.id ?? bot.slug;
  const fixture = mkdtempSync(join(tmpdir(), 'bh-m15-engine-workspace-'));
  try {
    const root = join(fixture, 'granted');
    mkdirSync(root);
    const workspace = suite.cli(['workspace-create', root]).workspace;
    const grant = suite.cli(['grant-create', slug, '--workspace', workspace.workspaceId]).grant;
    check('the Workspace Grant starts read-only', grant.orchestratorWrite === false);
    if (fullAccess)
      suite.cli([
        'access-set',
        slug,
        '--mode',
        'danger-full-access',
        '--scope',
        'assignments',
        '--acknowledge-risk',
      ]);
    suite.cli(['engine', 'use', slug, engine, '--role', 'assignment']);
    const targets = fullAccess
      ? [join(fixture, 'file-tool.txt'), join(fixture, 'shell.txt')]
      : [root, fixture].flatMap((folder) => [
          join(folder, 'file-tool.txt'),
          join(folder, 'shell.txt'),
        ]);
    for (const target of targets) writeFileSync(target, 'original\n');
    const marker = randomUUID();
    const fileTool = engine === 'claude' ? 'Edit' : 'apply_patch';
    const instructions = targets.map(
      (path) =>
        `Replace the contents of ${path} with ${marker} using ${path.endsWith('shell.txt') ? 'the native shell tool' : fileTool}.`,
    );
    suite.ask(
      'delegate',
      undefined,
      slug,
      `Create one Assignment with title ${marker} and grant_id ${grant.id}. Give the Assignment these instructions verbatim, then acknowledge that it started. Do not edit the files yourself. Instructions: ${instructions.join(' ')} Use only these fixture files. If a tool is unavailable or refused, report it and move to the next check. Do not ask for approval or try another tool for that file. Report the result to the Orchestrator before ending.`,
    );
    const deadline = Date.now() + suite.options.timeout * 1000;
    let assignment;
    let transcript;
    while (Date.now() < deadline) {
      const directory = suite.cli(['assignments', slug, '--search', marker]);
      assignment = directory.assignments?.[0];
      if (assignment?.sessionId !== undefined) {
        transcript = suite.cli(['session-transcript', slug, '--session', assignment.sessionId], {
          allowFail: true,
        });
        if (transcript.items?.some((item) => item.kind === 'turn-end')) break;
      }
      await new Promise((done) => setTimeout(done, 2000));
    }
    suite.transcript('assignment', { assignment, transcript });
    check(
      'the selected Subscription Engine completed a turn',
      transcript?.engine?.engine === engine &&
        transcript.items?.some((item) => item.kind === 'turn-end' && item.state === 'done'),
    );
    check(
      'the Assignment retained the expected access preset',
      assignment?.permission?.mode === (fullAccess ? 'danger-full-access' : 'workspace-write'),
    );
    for (const target of targets)
      check(
        `${target.startsWith(root + sep) ? 'in-grant' : 'outside'} ${target.endsWith('shell.txt') ? 'shell' : 'file-tool'} fixture ${fullAccess ? 'changed' : 'unchanged'}`,
        existsSync(target) &&
          readFileSync(target, 'utf8').trim() === (fullAccess ? marker : 'original'),
      );
    if (fullAccess) {
      const tools =
        transcript?.items?.filter((item) => item.kind === 'tool' && item.status === 'done') ?? [];
      check(
        'native file edit completed',
        tools.some((item) => item.tool === fileTool),
      );
      check(
        'native shell completed',
        tools.some((item) => /^(?:bash|shell|powershell)$/iu.test(item.tool)),
      );
    }
    const approvals = suite.cli(['engine', 'approvals']).approvals;
    check('engine did not request an approval', !approvals.some((item) => item.botSlug === slug));
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
}
