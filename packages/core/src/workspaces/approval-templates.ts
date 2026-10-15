import { mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export interface ApprovalTemplate {
  name: string;
  title: string;
  description: string;
  builtIn: boolean;
  text: string;
}

const CAUTIOUS = `# Cautious

You are answering tool approvals for a PersonaBot while its Human is away. Be careful: when in
doubt, send the call to the Human.

## Allow

- Reading, listing and searching files inside the Bot's working directory.
- Keeping the Bot's own plan or to-do list (for example \`todo_write\`).
- Commands that only inspect state and change nothing (\`git status\`, \`git diff\`, \`ls\`, tests
  that do not touch the network).

## Reject

- Deleting files or folders outside the working directory, or any \`rm -rf\` on a broad path.
- Rewriting Git history that others may have (\`git push --force\`, \`git reset --hard\` on a shared
  branch).
- Anything the Human said not to do in the conversation ("don't send anything yet", "don't touch
  production").

## Ask the Human

- Sending messages, posting, emailing or anything else that leaves this computer.
- Installing software, changing system settings, or using the network beyond reading public
  documentation.
- Spending money, using credentials, or touching accounts. This includes every secret tool call
  (\`secret_cli\`, \`secret_mcp_connect\`), whatever the program or account.
- Computer or Browser Authorization: letting this Session use the shared Computer or the Human's
  Browser.
- Any call this template does not clearly cover.
`;

const GET_WORK_DONE = `# Get the work done

You are answering tool approvals for a PersonaBot that is working through a long task while its
Human is away. Prefer letting the work continue, and stop only what is destructive, irreversible or
against what the Human said.

## Allow

- Reading, writing and editing files inside the Bot's working directory and its Workspace Grants.
- Keeping the Bot's own plan or to-do list (for example \`todo_write\`), and messages between the
  Bot and its own Sessions (for example \`send_message\`).
- Building, testing, linting and formatting; installing project dependencies with the project's own
  package manager.
- Local Git work: branches, commits, and pushing to a branch the Bot created.
- A secret tool call (\`secret_cli\`, \`secret_mcp_connect\`) that runs a known program with the
  account for its own service, for example \`gh\` with a GitHub account or \`npx\` starting a
  service's documented MCP server with that service's account, when the arguments fit the task.
- Browser Authorization when the Human's task needs a web page.

## Reject

- Deleting data outside the working directory, or broad destructive commands (\`rm -rf /\`,
  \`git push --force\` to a default branch, dropping a database).
- Anything the Human said not to do in the conversation.

## Ask the Human

- Publishing, deploying, releasing, or messaging people outside this Profile.
- Spending money, or changing credentials and account settings.
- A secret tool call with a program you don't recognize, an account that belongs to another
  service, or arguments that publish, delete or change the account.
- Computer Authorization: controlling the shared Computer's screen, mouse and keyboard.
- A call you cannot judge from what you were given.
`;

export const BUILT_IN_APPROVAL_TEMPLATES: readonly ApprovalTemplate[] = [
  {
    name: 'cautious',
    title: 'Cautious',
    description:
      'Allows reading and planning; sends anything that leaves the computer to the Human.',
    builtIn: true,
    text: CAUTIOUS,
  },
  {
    name: 'get-work-done',
    title: 'Get the work done',
    description: 'Lets the work continue; stops only destructive or irreversible calls.',
    builtIn: true,
    text: GET_WORK_DONE,
  },
];

export function approvalTemplate(name: string): ApprovalTemplate | undefined {
  return BUILT_IN_APPROVAL_TEMPLATES.find((template) => template.name === name);
}

export function listApprovalTemplates(): ApprovalTemplate[] {
  return BUILT_IN_APPROVAL_TEMPLATES.map((template) => ({ ...template }));
}

export const APPROVAL_TEMPLATE_TEXT_LIMIT = 32 * 1024;

const TEMPLATE_NAME = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/u;

export function isApprovalTemplateName(name: string): boolean {
  return TEMPLATE_NAME.test(name);
}

export type ApprovalTemplateWriteResult =
  | { ok: true; template: ApprovalTemplate }
  | {
      ok: false;
      reason: 'invalid-name' | 'invalid-text' | 'exists' | 'not-found' | 'built-in' | 'unavailable';
    };

export interface ApprovalTemplateLibrary {
  list(): ApprovalTemplate[];
  get(name: string): ApprovalTemplate | undefined;
  create(name: string, text: string): ApprovalTemplateWriteResult;
  update(name: string, text: string): ApprovalTemplateWriteResult;
  delete(name: string): ApprovalTemplateWriteResult;
}

function summaryOf(name: string, text: string): ApprovalTemplate {
  const lines = text.split(/\r?\n/u).map((line) => line.trim());
  const heading = lines.find((line) => /^#\s+\S/u.test(line));
  const start = lines.findIndex((line) => line !== '' && !line.startsWith('#'));
  const end = start < 0 ? -1 : lines.findIndex((line, index) => index > start && line === '');
  const body =
    start < 0
      ? undefined
      : lines
          .slice(start, end < 0 ? undefined : end)
          .filter((line) => !line.startsWith('#'))
          .join(' ');
  const clip = (value: string, limit: number) =>
    value.length > limit ? value.slice(0, limit - 1).trimEnd() + '…' : value;
  return {
    name,
    title: heading === undefined ? name : clip(heading.replace(/^#+\s*/u, ''), 80),
    description: body === undefined ? '' : clip(body.replace(/^[-*]\s+/u, ''), 200),
    builtIn: false,
    text,
  };
}

function textProblem(text: string): boolean {
  return (
    typeof text !== 'string' ||
    text.trim() === '' ||
    Buffer.byteLength(text, 'utf8') > APPROVAL_TEMPLATE_TEXT_LIMIT
  );
}

export function createApprovalTemplateLibrary(dir?: string): ApprovalTemplateLibrary {
  const file = (name: string) => join(dir!, name + '.md');
  const readCustom = (name: string): ApprovalTemplate | undefined => {
    if (dir === undefined || !isApprovalTemplateName(name) || approvalTemplate(name)) return;
    try {
      return summaryOf(name, readFileSync(file(name), 'utf8'));
    } catch {
      return undefined;
    }
  };
  const write = (name: string, text: string): ApprovalTemplate => {
    mkdirSync(dir!, { recursive: true });
    const temporary = file(name) + '.' + process.pid + '.tmp';
    writeFileSync(temporary, text, { encoding: 'utf8', mode: 0o600 });
    renameSync(temporary, file(name));
    return summaryOf(name, text);
  };
  const check = (name: string, text?: string): ApprovalTemplateWriteResult | undefined => {
    if (typeof name !== 'string' || !isApprovalTemplateName(name))
      return { ok: false, reason: 'invalid-name' };
    if (approvalTemplate(name) !== undefined) return { ok: false, reason: 'built-in' };
    if (text !== undefined && textProblem(text)) return { ok: false, reason: 'invalid-text' };
    if (dir === undefined) return { ok: false, reason: 'unavailable' };
    return undefined;
  };
  return {
    list() {
      let names: string[] = [];
      if (dir !== undefined)
        try {
          names = readdirSync(dir)
            .filter((entry) => entry.endsWith('.md'))
            .map((entry) => entry.slice(0, -3))
            .sort();
        } catch {
          names = [];
        }
      return [
        ...listApprovalTemplates(),
        ...names.flatMap((name) => {
          const template = readCustom(name);
          return template === undefined ? [] : [template];
        }),
      ];
    },
    get(name) {
      const builtIn = approvalTemplate(name);
      return builtIn === undefined ? readCustom(name) : { ...builtIn };
    },
    create(name, text) {
      const problem = check(name, text);
      if (problem !== undefined) return problem;
      if (readCustom(name) !== undefined) return { ok: false, reason: 'exists' };
      return { ok: true, template: write(name, text) };
    },
    update(name, text) {
      const problem = check(name, text);
      if (problem !== undefined) return problem;
      if (readCustom(name) === undefined) return { ok: false, reason: 'not-found' };
      return { ok: true, template: write(name, text) };
    },
    delete(name) {
      const problem = check(name);
      if (problem !== undefined) return problem;
      const template = readCustom(name);
      if (template === undefined) return { ok: false, reason: 'not-found' };
      rmSync(file(name), { force: true });
      return { ok: true, template };
    },
  };
}

const POLICY_CHANGE_PATTERNS: readonly RegExp[] = [
  /approval-template-set\b/iu,
  /approval-reviewer[\s\S]*\b(set|edit|delete|rm|remove)\b/iu,
  /approval-reviewer\.json/iu,
  /botApprovalTemplateSet|approvalReviewerModelSet|approvalTemplateUpdate|approvalTemplateDelete/u,
  /botharness\.db|persona_bots|tool_approval_rules/iu,
];

const CHANGING_SUBCOMMANDS = new Set(['set', 'edit', 'update', 'delete', 'rm', 'remove']);
const TEMPLATE_FILE = /approval-templates\/+([^\s"'`;&|)\\/]*)/giu;

export function changesApprovalPolicy(
  input: string,
  inUse: (name: string) => boolean = () => true,
): boolean {
  if (POLICY_CHANGE_PATTERNS.some((pattern) => pattern.test(input))) return true;
  for (const match of input.matchAll(TEMPLATE_FILE)) {
    const name = match[1]!.replace(/\.md$/iu, '');
    if (!isApprovalTemplateName(name) || inUse(name)) return true;
  }
  const tokens = input.split(/[\s"'=;&|(){}<>,\\]+/u).filter((token) => token !== '');
  for (let index = 0; index < tokens.length; index++) {
    if (tokens[index]!.toLowerCase() !== 'approval-template') continue;
    const subcommand = tokens[index + 1]?.toLowerCase();
    if (subcommand === undefined || !CHANGING_SUBCOMMANDS.has(subcommand)) continue;
    if (subcommand === 'set') return true;
    const operands: string[] = [];
    for (let next = index + 2; next < tokens.length; next++) {
      if (/^approval-template/iu.test(tokens[next]!)) break;
      if (!tokens[next]!.startsWith('-')) operands.push(tokens[next]!);
    }
    if (operands.length === 0) return true;
    if (operands.some((operand) => /[$`*?[\]~]/u.test(operand) || inUse(operand))) return true;
  }
  return false;
}
