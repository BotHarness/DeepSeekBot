import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import {
  chmodSync,
  lstatSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
  unlinkSync,
} from 'node:fs';
import { basename, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { parseArgs } from 'node:util';
import { isMap, isScalar, parseDocument } from 'yaml';
import { parseCredentialsDocument } from '@deepseek-ai/dsh-credentials-local';

import { dmChannelId } from '../channels/channel.js';
import { createSqliteChannelStore } from '../channels/sqlite-store.js';
import { createBotPairing } from '../messaging/pairing.js';
import {
  BotScheduleError,
  createBotScheduleStore,
  previewBotScheduleTrigger,
  type BotSchedule,
  type BotScheduleFiring,
  type BotScheduleTrigger,
} from '../schedules/bot-schedules.js';
import {
  createWorkspaceGrantStore,
  WorkspaceGrantError,
  type WorkspaceGrant,
} from '../workspaces/grants.js';
import { BOT_HARNESS_SCHEMA_PLAN } from '../database/schema-plan.js';
import {
  attachOperationalModule,
  mountOperationalDatabase,
  OperationalDatabaseError,
  type OperationalDatabaseOwner,
} from '../database/owner.js';
import { resolveDshHome } from '../im/config-store.js';
import { cloneMemoryRepository, parseMemoryGitUrl, type HttpsFallback } from '../memory/clone.js';
import { ensureMemoryRepository } from '../memory/repository.js';
import {
  MemoryAcceptError,
  type MemoryAcceptedCommit,
  type MemoryAcceptedSnapshot,
} from '../memory/accepted.js';
import { MemoryFileError } from '../memory/file-actions.js';
import { MemoryPathError } from '../memory/jail.js';
import { createMemoryService, type MemoryService } from '../memory/service.js';
import { createSessionOwnership } from '../sessions/ownership.js';
import {
  createModelPresetStore,
  type ModelPreset,
  type ModelRoute,
  type PersonaBotModelPlan,
} from '../models/presets.js';
import {
  BOT_DESCRIPTOR_PATH,
  MAX_DESCRIPTOR_BIO_LENGTH,
  MAX_DESCRIPTOR_TAG_LENGTH,
  MAX_DESCRIPTOR_TAGS,
  parseBotDescriptor,
  type BotDescriptor,
} from '../marketplace/descriptor.js';
import { syncBotDescriptor } from './bot-descriptor-sync.js';
import {
  bundleBotHistory,
  readBotZip,
  BOT_ZIP_MAX_BYTES,
  BOT_ZIP_MAX_ENTRIES,
  BOT_ZIP_HISTORY_PATH,
} from './bot-zip.js';
import type { PersonaBotRecord } from './persona-bot.js';
import { createPersonaBotRegistry, type PersonaBotRegistry } from './registry.js';
import { ZipArchiveError, writeZip, type ZipEntry } from './zip-archive.js';
import { INBOX_HOST_COMMANDS } from './cli-inbox.js';
import { CliLiveError, LIVE_COMMANDS, LIVE_OPTIONS, runLiveCli } from './cli-live.js';
import { PROFILE_ONLINE_COMMANDS } from './cli-profile.js';
import {
  isScheduleCommand,
  scheduleToggleFromFlags,
  scheduleTriggerFromFlags,
} from './cli-schedules.js';
import {
  DIAGNOSTIC_COMMANDS,
  LIFECYCLE_COMMANDS,
  ONLINE_MANAGEMENT_COMMANDS,
  runOnlineManagement,
} from './cli-management.js';

export interface BotCreateCliIo {
  env: NodeJS.ProcessEnv;
  stdout: (text: string) => void;
  stderr: (text: string) => void;
  readStdin?: () => Promise<string>;
}

export interface BotCreateStep {
  name: string;
  status: 'ok' | 'deferred';
  code?: string;
  detail?: string;
}

export interface BotCreateResult {
  bot: { id: string; name: string };
  dm: { channelId: string };
  dataDir: string;
  steps: BotCreateStep[];
  next: string[];
  httpsFallback?: { from: string; to: string; reason: string };
}

export interface BotCreateFailure {
  error: { code: string; message: string };
  steps?: BotCreateStep[];
  bot?: { id: string; name: string };
}

export const BOT_CREATE_HELP = `deepseekbot: create PersonaBots without clicking

Usage:
  deepseekbot create --name <name> [--persona <text> | --persona-stdin]
                    [--description <text>] [--role <tag> ...]
                    [--preset <model-preset-id>] [--memory-location <absolute-dir>]
                    [--home <dsh-home>]
  deepseekbot create --name <name> --from-git <url | owner/repo> [...]
  deepseekbot create [--name <name>] --from-zip <file> [...]
  deepseekbot create [--name <name>] --from-dir <directory> [...]
  deepseekbot list [--home <dsh-home>]
  deepseekbot show <id> [--home <dsh-home>]
  deepseekbot model-presets [--home <dsh-home>]
  deepseekbot model-preset-create --name <preset> --orchestrator-provider <p> --orchestrator-model <m>
                                  [--orchestrator-effort <e>] --assignment-provider <p>
                                  --assignment-model <m> [--assignment-effort <e>] [--home <dsh-home>]
  deepseekbot model-preset-apply <id> --preset <preset-id> [--home <dsh-home>]
  deepseekbot model-plan <id> [--home <dsh-home>]
  deepseekbot pause <id> [--home <dsh-home>]
  deepseekbot resume <id> [--home <dsh-home>]
  deepseekbot update <id> [--name <name>] [--description <text>] [--role <tag> ...] [--home <dsh-home>]
  deepseekbot human-name-set (--name <text> | --clear) [--home <dsh-home>]
  deepseekbot channel-human-name-set <channel> (--nickname <text> | --clear) [--home <dsh-home>]
  deepseekbot memory-snapshot <id> [--home <dsh-home>]
  deepseekbot memory-file <id> --path <file> [--home <dsh-home>]
  deepseekbot memory-history <id> [--limit <n>] [--home <dsh-home>]
  deepseekbot memory-diff <id> --sha <commit> [--home <dsh-home>]
  deepseekbot memory-save <id> --path <file> (--body <text> | --body-stdin)
                             [--expected-head <sha>] [--edit-id <id>] [--home <dsh-home>]
  deepseekbot channels [--home <dsh-home>]
  deepseekbot channel-messages <channel> [--limit <n>] [--before <id>] [--home <dsh-home>]
  deepseekbot grants <id> [--home <dsh-home>]
  deepseekbot grant-revoke <id> --grant <grant> [--home <dsh-home>]   online: add --confirm
  deepseekbot grant-write-set <id> --grant <grant> (--enabled | --disabled) [--home <dsh-home>]
  deepseekbot schedules <id> [--home <dsh-home>]
  deepseekbot schedule-create <id> --title <t> --prompt <p> (--every <s> | --daily <HH:MM> |
                                  --weekly <HH:MM> --weekdays <0-6,..> | --once-date <d> --once-time <t> |
                                  --cron <expr>) [--timezone <tz>] [--enabled|--disabled] [--locked] [--home <dsh-home>]
  deepseekbot schedule-update <id> --sid <schedule> [--title ...] [--prompt ...] [trigger ...] [--home <dsh-home>]
  deepseekbot schedule-delete <id> --sid <schedule> [--confirm] [--home <dsh-home>]
  deepseekbot schedule-history <id> --sid <schedule> [--home <dsh-home>]
  deepseekbot schedule-run-now <id> --sid <schedule> [--home <dsh-home>]
  deepseekbot schedule-preview (--every <s> | --daily ... | ...) [--home <dsh-home>]
  deepseekbot pairings <id> [--home <dsh-home>]
  deepseekbot secret-put <NAME> [--home <dsh-home>]            secret value arrives on stdin only
  deepseekbot secret-list [--home <dsh-home>]                  names, sources, writability; never values
  deepseekbot secret-unset <NAME> [--home <dsh-home>]
  deepseekbot search <words>                                   find commands by words
  deepseekbot send <id> (--body <text> | --body-stdin) [--message-id human-<UUID>] [--timeout <seconds>]
  deepseekbot send-status <id> --message-id <Human-message-id>
  deepseekbot tool-approval-status <channel> --message-id <card-id>
  deepseekbot tool-approval-decide <channel> --message-id <card-id> --outcome allowed-once|rejected
  deepseekbot user-question-status <channel> --message-id <card-id>
  deepseekbot user-question-answer <channel> --message-id <card-id> --answer-stdin
  deepseekbot ask-secret-status <channel> --message-id <card-id>
  deepseekbot ask-secret-submit <channel> --message-id <card-id> --values-stdin
  deepseekbot ask-secret-cancel <channel> --message-id <card-id>
  deepseekbot ask-secret-account-status <channel> --message-id <configured-card-id>
  deepseekbot ask-secret-replace <channel> --message-id <configured-card-id>
  deepseekbot ask-secret-revoke <channel> --message-id <configured-card-id>
  deepseekbot ask-secret-accounts <id>
  deepseekbot release-info [--since <version>]
  deepseekbot release-check
  deepseekbot release-install <version> --confirm
  deepseekbot release-restart --confirm
  deepseekbot marketplace-list [--query <words>] [--topic <topic>] [--sort updated|stars] [--cursor <c>]
  deepseekbot marketplace-topics
  deepseekbot marketplace-detail <owner/repo>
  deepseekbot marketplace-submit <github-repo-url>
  deepseekbot marketplace-report <owner/repo> [--reason <text>]
  deepseekbot telemetry-status
  deepseekbot telemetry-set (--enabled | --disabled)
  deepseekbot git-status
  deepseekbot git-install
  deepseekbot pairing-list <id>
  deepseekbot pairing-review <id> <pairing-id> --decision approve|reject|revoke [--role <role-id> | --capability <c> ...] [--confirm]
  deepseekbot workspace-options
  deepseekbot grant-create <id> --workspace <workspace-id>
  deepseekbot browser-access-set <id> (--enabled | --disabled)
  deepseekbot computer-access-set <id> (--enabled | --disabled)
  deepseekbot access <id>
  deepseekbot access-set <id> --mode workspace-write|danger-full-access [--scope chat|assignments] [--acknowledge-risk]
  deepseekbot settings <namespace>
  deepseekbot settings-set <namespace> --patch-stdin
  deepseekbot workspace-create <absolute-path>
  deepseekbot group-create <name> --member <bot-id> [--member <bot-id> ...]
  deepseekbot im-app-add <discord|slack|qq|dingtalk|wecom|matrix> --credentials-stdin
  deepseekbot im-app-status <platform>
  deepseekbot im-app-remove <platform> --app <app-id>
  deepseekbot im-bind <id> --app <app-id>
  deepseekbot im-unbind <id> --app <app-id>
  deepseekbot im-status <id>
  deepseekbot channel-connect <channel> --bot <id> --conversation <external-id> [--app <app-id>]
  deepseekbot channel-ingests <channel>
  deepseekbot browser-open <id>
  deepseekbot browser-frame <id> --out <absolute-file>
  deepseekbot browser-takeover <id> (--enabled | --disabled)
  deepseekbot browser-input <id> --args-stdin
  deepseekbot browser-stop <id>
  deepseekbot computer-start [--target local|container]
  deepseekbot computer-status
  deepseekbot computer-stop
  deepseekbot browser-tools
  deepseekbot browser-tool <id> <tool> [--args-stdin] [--out <absolute-file>]
  deepseekbot memory-file-target|memory-graph|memory-commit-diff|memory-changes <id> [...]
  deepseekbot memory-working-diff <id> --path <file> --kind staged|unstaged|untracked|current
  deepseekbot memory-checkpoints|memory-versions <id>
  deepseekbot memory-restore <id> --checkpoint <id> --expected-current <id>
  deepseekbot memory-restore-commit <id> --sha <commit> --expected-head <commit> [--name <version>]
  deepseekbot memory-version-name <id> --sha <commit> --name <version>
  deepseekbot memory-version-unname <id> --tag <version>
  deepseekbot memory-repair <id> --expected-head <commit>
  deepseekbot memory-move <id> (--memory-location <absolute-dir> | --default-location)
  deepseekbot model-catalog
  deepseekbot model-plan-set <id> --plan-stdin [--expected-revision <n>]
  deepseekbot model-plan-customize <id> --orchestrator-provider <p> --orchestrator-model <m> [--orchestrator-effort <e>]
  deepseekbot model-plan-inherit <id> [--expected-revision <n>]
  deepseekbot model-plan-assignments-set <id> --plan-stdin [--expected-revision <n>]
  deepseekbot model-preset-update <preset-id> [--name <n>] [--orchestrator-provider/-model/-effort ...]
                                  [--assignment-provider/-model/-effort ...] [--plan-stdin] [--expected-revision <n>]
  deepseekbot overview-usage [--period today|week] [--after <bot-cursor>]
  deepseekbot overview-memory [--after <bot-cursor>]
  deepseekbot activity-overview
  deepseekbot channel-activity-today
  deepseekbot bot-usage <id> --start <YYYY-MM-DD> --end <YYYY-MM-DD> [--model <m>] [--provider <p>]
                        [--purpose orchestrator|assignment|subagent]
  deepseekbot bot-session-usage <id>
  deepseekbot bot-activity-history <id> [--before <YYYY-MM-DD>] [--weeks <1-104>]
  deepseekbot group-activity <channel>
  deepseekbot bot-trace <id> [--turns <1-20>] [--session <session-id>|direct]
  deepseekbot bot-tools
  deepseekbot bot-tool <id> <tool> [--args-stdin]
  deepseekbot computer-tools
  deepseekbot computer-tool <id> <tool> [--args-stdin] [--out <absolute-file>]
  deepseekbot todos
  deepseekbot todo-add --title <text>
  deepseekbot todo-update <todo-id> [--title <text>] [--done | --not-done]
  deepseekbot todo-remove <todo-id>
  deepseekbot todo-tools
  deepseekbot todo-tool <id> <tool> [--args-stdin]
  deepseekbot bot-attention <id> [--limit <1-100>] [--cursor <source-id>] [--state <state>]
  deepseekbot bot-sessions <id> [--limit <1-100>]
  deepseekbot bot-activity <id> [--limit <1-100>]
  deepseekbot inbox [--category action|info|unread|replies|handled] [--bot <id>] [--channel <id>]
                    [--limit <1-100>] [--cursor <cursor>] [--sort newest|oldest] [--snoozed]
  deepseekbot inbox-status
  deepseekbot inbox-dismiss <item-id> [--source-key <source-event-id>]
  deepseekbot inbox-snooze <item-id> [--source-key <source-event-id>] (--until <ISO time> | --clear)
  deepseekbot inbox-ignore <source-event-id>
  deepseekbot assignment-context <id> --session <session-id> --source <source-event-id>
  deepseekbot channel-assignments <group-channel>
  deepseekbot channel-assign <channel> (--section <section-id> | --unsectioned) [--index <n>]
  deepseekbot session-ids
  deepseekbot session-owner <session-id>
  deepseekbot session-archive-set <id> --session <session-id> (--archived | --unarchived)
  deepseekbot tool-approval-rules <id>
  deepseekbot tool-approval-rule-revoke <id> --rule <rule-id> --confirm
  deepseekbot private-mcp-set <id> --server <name> (--enabled | --disabled)
  deepseekbot private-mcp-remove <id> --server <name> --confirm
  deepseekbot bot-delete-preview <id>
  deepseekbot bot-delete-confirm <id> --confirmation-stdin
  deepseekbot bot-delete-retry <id>
  deepseekbot bot-avatar-set|bot-banner-set <id> (--file <image> | --clear)
  deepseekbot bot-banner-set|bot-appearance-set <id> --recipe-stdin
  deepseekbot bot-primary-color-set <id> (--color <#rrggbb> | --automatic)
  deepseekbot bot-source-policies <id>
  deepseekbot bot-source-policy-set <id> --source-class <class> [--wake <w>] [--delivery steer|turn]
                                    [--digest-count <n> --digest-interval <seconds>]
  deepseekbot bot-source-policy-reset <id> --source-class <class>
  deepseekbot bot-standing-limits-set <id> --soul <n> --core-memory <n>
  deepseekbot developer-mode-set (--enabled | --disabled)
  deepseekbot roster | human-identity | part-library
  deepseekbot roster-batch pin|unpin|hide|move <channel>... [--section <section-id>]
  deepseekbot roster-pins-set|roster-hidden-set [<channel>...]
  deepseekbot roster-section-create <name>
  deepseekbot roster-section-rename <section-id> --name <text>
  deepseekbot roster-section-remove <section-id> --confirm
  deepseekbot roster-section-reorder <section-id>...
  deepseekbot roster-top-reorder section:<id>|channel:<id>...
  deepseekbot part-library-add --part-stdin [--name <text>] [--parent <part-id>]
  deepseekbot part-library-import --file <png|zip>
  deepseekbot part-library-import-image --file <png> --slot <slot> --colors <n> [--name <text>]
  deepseekbot part-library-export --out <absolute-file> [--part-id <id> | --part-stdin]
  deepseekbot im-apps
  deepseekbot im-authorize <feishu|weixin>
  deepseekbot im-credentials <attempt-id> --credentials-stdin
  deepseekbot im-verify <attempt-id> --verification-stdin
  deepseekbot pairing-status <attempt-id> [--wait] [--timeout <seconds>]
  deepseekbot im-cancel <attempt-id>
  deepseekbot --help | deepseekbot create --help

Output:
  stdout carries JSON, pretty by default; --compact condenses it to one line
  for agents. Human-readable lines go to stderr only.

Sources (exactly one per create):
  (none)       blank bot; --preset applies a model preset, otherwise the model
               step reports no-model-yet and activation stays a Settings task
  --from-git   clone a Git repository as Memory (HTTPS, SSH, or owner/repo
               shorthand for https://github.com/owner/repo.git)
  --from-zip   import a bot bundle zip (same shape as the bot-zip export)
  --from-dir   import a bot bundle directory (same shape as the bot-zip export;
               a .git subtree is skipped as files but packed as history)

Machine contract:
  stdout carries exactly one JSON document. Success exits 0 with the bot id,
  DM channel, data directory, per-step statuses, and next actions. Failure
  exits non-zero with {"error": {"code", "message"}} using a stable code
  (usage, secret-in-argv, bad-zip, bad-bundle, bad-ref, unknown-preset,
  unknown-bot, unknown-channel, duplicate-preset, git-not-found, git-clone-failed, git-clone-timeout,
  memory-unavailable, lease-unavailable, bad-credentials, invalid-input). Human-readable lines go to stderr only.
  Stop the Host before offline database commands: the writer lease is exclusive.

Live Host:
  Require --host <loopback-origin|tailnet-HTTPS-origin> or DEEPSEEKBOT_HOST.
  Auth: DEEPSEEKBOT_HOST_TOKEN or --token-file <private-file>, never a token in argv.
  Login is fresh per call; cookies stay in memory. --timeout defaults to 120 seconds (max 600).
  send returns its receipt and exact committed replies. Inspect send-status on timeout
  before retrying; send never automatically resubmits. channel-messages also accepts --host.
  create (blank, Git, Zip and directory), list/show, model-presets/create/apply/plan,
  channels and the schedule* commands use the Host when --host or DEEPSEEKBOT_HOST is set. Do not combine
  --home with an online target; failures never fall back to local database access.
  Zip/directory uploads contain local bytes; Git cloning uses the Host environment.
  Creation errors retain known bot/steps; outcome unknown means inspect before retrying.
  Bot diagnostics are bounded summaries, not full execution logs or live streams.
  grant-revoke and grant-write-set use the Host when it is targeted; revokes and removals
  (grant, tool approval rule, private MCP server) need --confirm, like the Web UI.
  Deletion requires preview then stdin {"token":"<preview.token>"}; Memory is retained.
  Question stdin: {"answers":[{"id":"question-id","selected":["option"],"custom":"optional"}]}
  Private input stdin: {"field_id":"confidential value",...}; only declared fields.
  Private input commands return status/acceptance only and never retry a submission.

Models:
  model-presets lists the profile presets; model-preset-create mints one from
  explicit provider/model routes; model-preset-apply and model-plan read and
  write through the Host when selected, otherwise directly offline. Routes are shape-checked plus
  provider-existence-checked offline; catalog liveness and readiness
  inspection stay Host-side, and model-plan reports readiness deferred.

Memory:
  memory-snapshot/file/history/diff read the bot memory store; memory-save
  writes one file and commits it. --expected-head defaults to the current
  HEAD (pass it explicitly for compare-and-swap); --edit-id defaults to a
  fresh UUID and makes repeat submissions idempotent. Conflicts, missing
  files, and bad shas fail coded (memory-conflict, not-found,
  memory-unknown-commit).

Identity:
  The bot name is a label. Every create mints a new bot id, so reusing a name
  always returns a second bot and still exits 0.

Secrets:
  Never pass secrets as arguments: any --api-key/--token/--secret/--password
  style flag is a hard error (secret-in-argv). Model keys and tokens travel in
  the environment (for example DEEPSEEK_API_KEY, GITHUB_TOKEN) or a stdin pipe
  (--persona-stdin); result JSON never contains secret values.

Home:
  --home points at the target DSH_HOME (a fresh directory works with zero
  clicks); without it, DSH_HOME from the environment is used.
`;

const STATIC_CATALOG_PROVIDER_IDS: ReadonlySet<string> = new Set([
  'amazon-bedrock',
  'ant-ling',
  'anthropic',
  'azure-openai-responses',
  'baseten',
  'cerebras',
  'cloudflare-ai-gateway',
  'cloudflare-workers-ai',
  'deepseek',
  'deepseek-account',
  'deepseek-official',
  'fireworks',
  'github-copilot',
  'google',
  'google-vertex',
  'groq',
  'huggingface',
  'kimi-coding',
  'minimax',
  'minimax-cn',
  'mistral',
  'moonshotai',
  'moonshotai-cn',
  'nvidia',
  'openai',
  'openai-codex',
  'opencode',
  'opencode-go',
  'openrouter',
  'qwen-token-plan',
  'qwen-token-plan-cn',
  'qwen-token-plan-individual',
  'together',
  'vercel-ai-gateway',
  'xai',
  'xiaomi',
  'xiaomi-token-plan-ams',
  'xiaomi-token-plan-cn',
  'xiaomi-token-plan-sgp',
  'zai',
  'zai-coding-cn',
]);

function assertKnownProvider(
  provider: string,
  carry?: { steps: BotCreateStep[]; bot?: { id: string; name: string } },
): void {
  if (!STATIC_CATALOG_PROVIDER_IDS.has(provider)) {
    throw new CliFailure(
      'invalid-input',
      `Unknown provider: ${provider}. Check the spelling; purely dynamic providers validate at the Host.`,
      1,
      carry?.steps ?? [],
      carry?.bot,
    );
  }
}

const SECRET_ARGV = new Set([
  'api-key',
  'apikey',
  'api_key',
  'token',
  'secret',
  'password',
  'passwd',
  'credential',
  'credentials',
  'private-key',
  'privatekey',
  'auth-token',
  'access-token',
  'client-secret',
  'session-token',
  'verify-code',
  'verification-code',
]);

const CREATE_OPTIONS = {
  name: { type: 'string' },
  persona: { type: 'string' },
  'persona-stdin': { type: 'boolean' },
  description: { type: 'string' },
  role: { type: 'string', multiple: true },
  preset: { type: 'string' },
  'from-zip': { type: 'string' },
  'from-dir': { type: 'string' },
  'from-git': { type: 'string' },
  'memory-location': { type: 'string' },
  home: { type: 'string' },
  'orchestrator-provider': { type: 'string' },
  'orchestrator-model': { type: 'string' },
  'orchestrator-effort': { type: 'string' },
  'assignment-provider': { type: 'string' },
  'assignment-model': { type: 'string' },
  'assignment-effort': { type: 'string' },
  nickname: { type: 'string' },
  clear: { type: 'boolean' },
  path: { type: 'string' },
  body: { type: 'string' },
  'body-stdin': { type: 'boolean' },
  'expected-head': { type: 'string' },
  'edit-id': { type: 'string' },
  limit: { type: 'string' },
  sha: { type: 'string' },
  before: { type: 'string' },
  cursor: { type: 'string' },
  state: { type: 'string' },
  'confirmation-stdin': { type: 'boolean' },
  grant: { type: 'string' },
  enabled: { type: 'boolean' },
  disabled: { type: 'boolean' },
  locked: { type: 'boolean' },
  unlocked: { type: 'boolean' },
  title: { type: 'string' },
  prompt: { type: 'string' },
  sid: { type: 'string' },
  every: { type: 'string' },
  daily: { type: 'string' },
  weekly: { type: 'string' },
  weekdays: { type: 'string' },
  'once-date': { type: 'string' },
  'once-time': { type: 'string' },
  cron: { type: 'string' },
  timezone: { type: 'string' },
  ...LIVE_OPTIONS,
  compact: { type: 'boolean' },
  help: { type: 'boolean', short: 'h' },
} as const;

export type CreateValues = ReturnType<
  typeof parseArgs<{ options: typeof CREATE_OPTIONS; allowPositionals: true }>
>['values'];

class CliFailure extends Error {
  readonly code: string;
  readonly exitCode: number;
  readonly steps: BotCreateStep[];
  readonly bot: { id: string; name: string } | undefined;

  constructor(
    code: string,
    message: string,
    exitCode: number,
    steps: BotCreateStep[] = [],
    bot?: { id: string; name: string },
  ) {
    super(message);
    this.name = 'CliFailure';
    this.code = code;
    this.exitCode = exitCode;
    this.steps = steps;
    this.bot = bot;
  }
}

function rejectSecretArgv(argv: readonly string[]): void {
  for (const entry of argv) {
    if (!entry.startsWith('-')) continue;
    const bare = entry.replace(/^-+/, '').split('=')[0]?.toLowerCase() ?? '';
    if (
      SECRET_ARGV.has(bare) ||
      /(?:^|[-_])(?:secret|token|password|credential|api[-_]key)$/u.test(bare)
    ) {
      const flag = entry.split('=')[0];
      throw new CliFailure(
        'secret-in-argv',
        `Refusing ${flag}: secrets travel in the environment or a stdin pipe, never in arguments.`,
        2,
      );
    }
  }
}

function usageError(message: string): CliFailure {
  return new CliFailure('usage', `${message} Run deepseekbot create --help for usage.`, 2);
}

function trimmed(value: string | undefined): string | undefined {
  const next = value?.trim();
  return next !== undefined && next.length > 0 ? next : undefined;
}

function mintSlug(): string {
  return `bot-${randomUUID().replaceAll('-', '')}`;
}

function expandGitHubRef(value: string): string | undefined {
  const raw = value.trim();
  if (raw.length === 0) return undefined;
  const shorthand = raw.replace(/^github\.com\//iu, '').replace(/\.git$/iu, '');
  if (/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/u.test(shorthand)) {
    return `https://github.com/${shorthand}.git`;
  }
  return raw;
}

function zipStem(path: string): string | undefined {
  const stem = path
    .split(/[\\/]/u)
    .at(-1)
    ?.replace(/\.zip$/iu, '')
    .trim();
  return stem !== undefined && stem.length > 0 ? [...stem].slice(0, 60).join('') : undefined;
}

const SKIPPED_BASENAMES = new Set(['.DS_Store', 'Thumbs.db', 'desktop.ini']);

interface BundleDirectory {
  files: ZipEntry[];
  descriptor: BotDescriptor | undefined;
  history: Buffer | undefined;
  historySkipped: boolean;
}

function readBundleDirectory(root: string): BundleDirectory {
  let absolute: string;
  try {
    absolute = resolve(root);
    if (!lstatSync(absolute).isDirectory()) throw new Error('not-a-directory');
  } catch {
    throw new CliFailure('bad-bundle', `Cannot read bundle directory: ${root}`, 1);
  }
  const files: ZipEntry[] = [];
  let total = 0;
  let gitPresent = false;
  const walk = (directory: string): void => {
    const entries = readdirSync(directory, { withFileTypes: true }).sort((left, right) =>
      left.name.localeCompare(right.name),
    );
    for (const entry of entries) {
      const full = join(directory, entry.name);
      const relativePath = relative(absolute, full).split(sep).join('/');
      if (relativePath === '.git' || relativePath.startsWith('.git/')) {
        gitPresent = true;
        continue;
      }
      const top = relativePath.split('/')[0]!;
      if (top === '__MACOSX' || SKIPPED_BASENAMES.has(entry.name)) continue;
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) {
        walk(full);
        continue;
      }
      if (!entry.isFile()) continue;
      let data: Buffer;
      try {
        data = readFileSync(full);
      } catch {
        throw new CliFailure('bad-bundle', `Cannot read bundle file: ${relativePath}`, 1);
      }
      total += data.length;
      if (files.length + 1 > BOT_ZIP_MAX_ENTRIES || total > BOT_ZIP_MAX_BYTES) {
        throw new CliFailure('bad-bundle', 'The bundle directory is too large to import', 1);
      }
      files.push({ path: relativePath, data });
    }
  };
  walk(absolute);
  if (files.length === 0) {
    throw new CliFailure('bad-bundle', 'The bundle directory has no files to import', 1);
  }
  const descriptorFile = files.find((file) => file.path === BOT_DESCRIPTOR_PATH);
  const descriptor =
    descriptorFile === undefined
      ? undefined
      : parseBotDescriptor(descriptorFile.data.toString('utf8'));
  let history: Buffer | undefined;
  let historySkipped = false;
  if (gitPresent) {
    try {
      history = bundleBotHistory(absolute);
    } catch {
      historySkipped = true;
    }
  }
  return { files, descriptor, history, historySkipped };
}

function resolveHome(values: CreateValues, io: BotCreateCliIo): string {
  return trimmed(values.home) ?? trimmed(io.env['DSH_HOME']) ?? resolveDshHome(io.env);
}

function openRegistry(dshHome: string): {
  owner: OperationalDatabaseOwner;
  registry: PersonaBotRegistry;
} {
  let owner: OperationalDatabaseOwner;
  try {
    owner = mountOperationalDatabase({ dshHome, schemaPlan: BOT_HARNESS_SCHEMA_PLAN });
  } catch (error) {
    if (error instanceof OperationalDatabaseError) {
      throw new CliFailure(error.code, error.message, 1);
    }
    throw error;
  }
  if (owner.mode !== 'ready') {
    const recovery = owner.recovery;
    owner.close();
    throw new CliFailure(
      recovery?.code ?? 'recovery-mode',
      recovery?.message ?? 'The operational database is unavailable.',
      1,
    );
  }
  const registry = createPersonaBotRegistry({
    rootDir: join(dshHome, 'botharness', 'bots'),
    database: owner,
    cloneMemory: (destination, url) => cloneMemoryRepository({ destination, url }),
    initializeMemory: (memoryDir) => {
      const repository = ensureMemoryRepository({ memoryDir });
      return repository.ok
        ? { ok: true }
        : {
            ok: false,
            ...(repository.code === 'git-not-found' ? { code: 'git-not-found' as const } : {}),
            message: `${repository.code}: ${repository.message}`,
          };
    },
    syncDescriptor: (memoryDir, record, sync) => {
      try {
        syncBotDescriptor(memoryDir, record, sync);
      } catch {}
    },
  });
  return { owner, registry };
}

function failureOf(reason: string, detail?: string): CliFailure {
  switch (reason) {
    case 'invalid-git-url':
      return new CliFailure(
        'bad-ref',
        'Provide a Git URL (https://, ssh://, or git@host:path) or a GitHub owner/repo.',
        1,
      );
    case 'git-not-found':
      return new CliFailure('git-not-found', 'A usable Git (2.28 or newer) is missing on PATH.', 1);
    case 'git-clone-failed':
      return new CliFailure(
        'git-clone-failed',
        'The Git repository could not be cloned. Check the ref and network access.',
        1,
      );
    case 'git-clone-timeout':
      return new CliFailure('git-clone-timeout', 'Cloning the Git repository timed out.', 1);
    case 'invalid-zip':
      return new CliFailure('bad-zip', 'The zip file could not be unpacked.', 1);
    case 'memory-unavailable':
      return new CliFailure(
        'memory-unavailable',
        detail === undefined
          ? 'The Bot memory could not be initialized.'
          : `The Bot memory could not be initialized: ${detail}`,
        1,
      );
    case 'invalid-memory-dir':
      return new CliFailure(
        'invalid-memory-dir',
        'The Memory location must be an existing absolute folder that does not already hold this Bot.',
        1,
      );
    case 'duplicate':
      return new CliFailure('invalid-input', 'The minted bot id collided. Retry the command.', 1);
    default:
      return new CliFailure(
        'invalid-input',
        detail === undefined ? 'The bot could not be created.' : detail,
        1,
      );
  }
}

export interface ValidatedCreate {
  displayName: string | undefined;
  persona: string | undefined;
  roles: string[] | undefined;
  description: string | undefined;
  presetId: string | undefined;
  memoryLocation?: string;
  source:
    | { kind: 'blank' }
    | { kind: 'git'; gitUrl: string }
    | { kind: 'zip'; path: string }
    | { kind: 'dir'; path: string };
}

async function validatedCreate(
  values: CreateValues,
  readStdin: () => Promise<string>,
): Promise<ValidatedCreate> {
  const zip = trimmed(values['from-zip']);
  const dir = trimmed(values['from-dir']);
  const git = trimmed(values['from-git']);
  const selected =
    (zip === undefined ? 0 : 1) + (dir === undefined ? 0 : 1) + (git === undefined ? 0 : 1);
  if (selected > 1) {
    throw usageError('Pass exactly one of --from-zip, --from-dir, or --from-git.');
  }
  const name = trimmed(values.name);
  const persona = trimmed(values.persona);
  const personaStdin = values['persona-stdin'] === true;
  if (persona !== undefined && personaStdin) {
    throw usageError('Pass --persona or --persona-stdin, not both.');
  }
  const description = trimmed(values.description);
  const roles =
    values.role === undefined
      ? undefined
      : values.role.map((role) => role.trim()).filter((role) => role.length > 0);
  const presetId = trimmed(values.preset);
  const memoryLocation = trimmed(values['memory-location']);
  if (memoryLocation !== undefined) {
    if (zip !== undefined || dir !== undefined || git !== undefined) {
      throw usageError('--memory-location applies to blank bots only.');
    }
    if (!isAbsolute(memoryLocation)) {
      throw new CliFailure('invalid-input', '--memory-location must be an absolute path.', 1);
    }
  }
  if (git !== undefined) {
    if (persona !== undefined || personaStdin) {
      throw usageError('The persona comes from the Git repository, not --persona.');
    }
    if (name === undefined) throw usageError('--name is required with --from-git.');
    const expanded = expandGitHubRef(git);
    if (expanded === undefined || parseMemoryGitUrl(expanded) === undefined) {
      throw new CliFailure(
        'bad-ref',
        'Provide a Git URL (https://, ssh://, or git@host:path) or a GitHub owner/repo.',
        1,
      );
    }
    return {
      displayName: name,
      persona: undefined,
      roles,
      description,
      presetId,
      source: { kind: 'git', gitUrl: expanded },
    };
  }
  if (zip !== undefined) {
    if (persona !== undefined || personaStdin) {
      throw usageError('The persona comes from the bundle, not --persona.');
    }
    return {
      displayName: name,
      persona: undefined,
      roles,
      description,
      presetId,
      source: { kind: 'zip', path: resolve(zip) },
    };
  }
  if (dir !== undefined) {
    if (persona !== undefined || personaStdin) {
      throw usageError('The persona comes from the bundle, not --persona.');
    }
    return {
      displayName: name,
      persona: undefined,
      roles,
      description,
      presetId,
      source: { kind: 'dir', path: resolve(dir) },
    };
  }
  if (name === undefined) throw usageError('--name is required for a blank bot.');
  const piped = personaStdin === true ? (await readStdin()).trim() : '';
  return {
    displayName: name,
    persona: personaStdin === true ? (piped.length > 0 ? piped : undefined) : persona,
    roles,
    description,
    presetId,
    ...(memoryLocation === undefined ? {} : { memoryLocation }),
    source: { kind: 'blank' },
  };
}

function nextActions(
  channelId: string,
  name: string,
  slug: string,
  modelDeferred: boolean,
): string[] {
  const actions = [`Open DM ${channelId} in the DSH web client to talk to ${name}.`];
  if (modelDeferred) {
    actions.push(
      `Authorize a model in Bot-mode Settings, then message ${name} to verify a live reply.`,
    );
  } else {
    actions.push(`Message ${name} in DM ${channelId} to verify a live reply.`);
  }
  actions.push(`Run \`deepseekbot show ${slug}\` to inspect this bot again.`);
  return actions;
}

async function runCreate(
  values: CreateValues,
  io: BotCreateCliIo,
  readStdin: () => Promise<string>,
): Promise<BotCreateResult> {
  const validated = await validatedCreate(values, readStdin);
  const dshHome = resolveHome(values, io);
  const steps: BotCreateStep[] = [{ name: 'validate', status: 'ok' }];
  const { owner, registry } = openRegistry(dshHome);
  try {
    if (validated.presetId !== undefined) {
      const presets = createModelPresetStore({
        rootDir: join(dshHome, 'botharness'),
        database: owner,
      });
      const preset = presets.get(validated.presetId);
      if (preset === undefined) {
        throw new CliFailure(
          'unknown-preset',
          `Unknown model preset: ${validated.presetId}`,
          1,
          steps,
        );
      }
      assertKnownProvider(preset.orchestrator.provider, { steps });
      assertKnownProvider(preset.assignmentDefault.provider, { steps });
    }
    let slug = mintSlug();
    steps.push({ name: 'allocate-id', status: 'ok' });
    const base = {
      ...(validated.roles === undefined ? {} : { roles: validated.roles }),
      ...(validated.description === undefined ? {} : { description: validated.description }),
    };
    if (validated.source.kind === 'blank') {
      const attempt = (candidate: string): ReturnType<PersonaBotRegistry['create']> =>
        registry.create({
          slug: candidate,
          displayName: validated.displayName!,
          ...(validated.persona === undefined ? {} : { persona: validated.persona }),
          ...(validated.memoryLocation === undefined
            ? {}
            : { memoryLocation: validated.memoryLocation }),
          ...base,
        });
      let created = attempt(slug);
      if (!created.ok && created.reason === 'duplicate') {
        slug = mintSlug();
        created = attempt(slug);
      }
      if (!created.ok) throw failureOf(created.reason, created.detail);
      steps.push({ name: 'create-bot', status: 'ok' });
      return finishCreate(
        owner,
        registry,
        dshHome,
        slug,
        created.record,
        steps,
        validated.presetId,
      );
    }
    if (validated.source.kind === 'git') {
      const gitUrl = validated.source.gitUrl;
      const attempt = (
        candidate: string,
      ): Promise<Awaited<ReturnType<PersonaBotRegistry['createFromGit']>>> =>
        registry.createFromGit({
          slug: candidate,
          displayName: validated.displayName!,
          gitUrl,
          ...base,
        });
      let created = await attempt(slug);
      if (!created.ok && created.reason === 'duplicate') {
        slug = mintSlug();
        created = await attempt(slug);
      }
      if (!created.ok) throw failureOf(created.reason, created.detail);
      steps.push({ name: 'clone', status: 'ok' });
      steps.push({ name: 'create-bot', status: 'ok' });
      const httpsFallback: HttpsFallback | undefined = created.httpsFallback;
      const result = await finishCreate(
        owner,
        registry,
        dshHome,
        slug,
        created.record,
        steps,
        validated.presetId,
      );
      if (httpsFallback !== undefined) {
        steps.push({
          name: 'clone-fallback',
          status: 'ok',
          detail: `SSH failed (${httpsFallback.reason}); retried over HTTPS.`,
        });
        return {
          ...result,
          httpsFallback: {
            from: httpsFallback.from,
            to: httpsFallback.to,
            reason: httpsFallback.reason,
          },
        };
      }
      return result;
    }
    let bundle: {
      files: ZipEntry[];
      descriptor: BotDescriptor | undefined;
      history: Buffer | undefined;
      historySkipped: boolean;
    };
    if (validated.source.kind === 'zip') {
      bundle = readZipBundle(validated.source.path);
    } else if (validated.source.kind === 'dir') {
      bundle = readDirBundle(validated.source.path);
    } else {
      throw failureOf('invalid-input', 'Select a bundle with --from-zip or --from-dir.');
    }
    const displayName =
      validated.displayName ??
      bundle.descriptor?.name?.trim() ??
      (validated.source.kind === 'zip' ? zipStem(validated.source.path) : undefined) ??
      'Bot';
    const roles = validated.roles ?? bundle.descriptor?.tags;
    const botDescription = validated.description ?? bundle.descriptor?.bio;
    const attempt = (
      candidate: string,
    ): Promise<Awaited<ReturnType<PersonaBotRegistry['createFromFiles']>>> =>
      registry.createFromFiles({
        slug: candidate,
        displayName,
        files: bundle.files,
        ...(bundle.history === undefined ? {} : { history: bundle.history }),
        ...(roles === undefined ? {} : { roles }),
        ...(botDescription === undefined ? {} : { description: botDescription }),
      });
    let created = await attempt(slug);
    if (!created.ok && created.reason === 'duplicate') {
      slug = mintSlug();
      created = await attempt(slug);
    }
    if (!created.ok) throw failureOf(created.reason, created.detail);
    steps.push({
      name: 'read-bundle',
      status: 'ok',
      ...(bundle.historySkipped
        ? { detail: 'Git history was unavailable; imported files only.' }
        : {}),
    });
    steps.push({ name: 'create-bot', status: 'ok' });
    return finishCreate(owner, registry, dshHome, slug, created.record, steps, validated.presetId);
  } finally {
    owner.close();
  }
}

function readZipBundle(path: string): {
  archive: Buffer;
  files: ZipEntry[];
  descriptor: BotDescriptor | undefined;
  history: Buffer | undefined;
  historySkipped: boolean;
} {
  let archive: Buffer;
  try {
    if (statSync(path).size > BOT_ZIP_MAX_BYTES) throw new Error('too-large');
    archive = readFileSync(path);
  } catch {
    throw new CliFailure('bad-zip', `Cannot read zip file: ${path}`, 1);
  }
  try {
    const contents = readBotZip(archive);
    return {
      archive,
      files: contents.files,
      descriptor: contents.descriptor,
      history: contents.history,
      historySkipped: false,
    };
  } catch (error) {
    if (error instanceof ZipArchiveError) {
      throw new CliFailure('bad-zip', error.message, 1);
    }
    throw new CliFailure('bad-zip', `Cannot read zip file: ${path}`, 1);
  }
}

function readDirBundle(path: string): {
  files: ZipEntry[];
  descriptor: BotDescriptor | undefined;
  history: Buffer | undefined;
  historySkipped: boolean;
} {
  const bundle = readBundleDirectory(path);
  return {
    files: bundle.files,
    descriptor: bundle.descriptor,
    history: bundle.history,
    historySkipped: bundle.historySkipped,
  };
}

async function finishCreate(
  owner: OperationalDatabaseOwner,
  registry: PersonaBotRegistry,
  dshHome: string,
  slug: string,
  record: PersonaBotRecord,
  steps: BotCreateStep[],
  presetId: string | undefined,
): Promise<BotCreateResult> {
  if (presetId !== undefined) {
    const presets = createModelPresetStore({
      rootDir: join(dshHome, 'botharness'),
      database: owner,
    });
    const preset = presets.get(presetId);
    if (preset === undefined) {
      throw new CliFailure('unknown-preset', `Unknown model preset: ${presetId}`, 1, steps, {
        id: slug,
        name: record.displayName,
      });
    }
    const minted = { id: slug, name: record.displayName };
    assertKnownProvider(preset.orchestrator.provider, { steps, bot: minted });
    assertKnownProvider(preset.assignmentDefault.provider, { steps, bot: minted });
    const applied = registry.applyModelPreset(slug, preset);
    if (!applied.ok) {
      throw new CliFailure('unknown-preset', `Unknown model preset: ${presetId}`, 1, steps, {
        id: slug,
        name: record.displayName,
      });
    }
    steps.push({ name: 'model', status: 'ok', detail: `Applied model preset "${preset.name}".` });
  } else {
    steps.push({
      name: 'model',
      status: 'deferred',
      code: 'no-model-yet',
      detail: 'No model preset applied; authorize a model in Bot-mode Settings.',
    });
  }
  const dataDir =
    registry.memoryDirFor(slug) ?? join(dshHome, 'botharness', 'bots', slug, 'memory');
  const channelId = dmChannelId(slug);
  const deferred = steps.some((step) => step.code === 'no-model-yet');
  return {
    bot: { id: slug, name: record.displayName },
    dm: { channelId },
    dataDir,
    steps,
    next: nextActions(channelId, record.displayName, slug, deferred),
  };
}

function runList(
  values: CreateValues,
  io: BotCreateCliIo,
): { bots: Array<{ id: string; name: string; createdAt: string }> } {
  const dshHome = resolveHome(values, io);
  const { owner, registry } = openRegistry(dshHome);
  try {
    return {
      bots: registry.list().map((record) => ({
        id: record.slug,
        name: record.displayName,
        createdAt: record.createdAt,
      })),
    };
  } finally {
    owner.close();
  }
}

function runShow(id: string, values: CreateValues, io: BotCreateCliIo): BotCreateResult {
  const slug = id.trim();
  if (slug.length === 0) throw usageError('show needs a bot id.');
  const dshHome = resolveHome(values, io);
  const { owner, registry } = openRegistry(dshHome);
  try {
    const record = registry.get(slug);
    if (record === undefined) {
      throw new CliFailure('unknown-bot', `Unknown bot: ${slug}`, 1);
    }
    const channelId = dmChannelId(slug);
    return {
      bot: { id: slug, name: record.displayName },
      dm: { channelId },
      dataDir: registry.memoryDirFor(slug) ?? join(dshHome, 'botharness', 'bots', slug, 'memory'),
      steps: [{ name: 'show', status: 'ok' }],
      next: nextActions(
        channelId,
        record.displayName,
        slug,
        record.modelPlan === undefined && record.model === undefined,
      ),
    };
  } finally {
    owner.close();
  }
}

function modelStore(dshHome: string, owner: OperationalDatabaseOwner) {
  return createModelPresetStore({ rootDir: join(dshHome, 'botharness'), database: owner });
}

function runModelPresets(values: CreateValues, io: BotCreateCliIo): { presets: ModelPreset[] } {
  const dshHome = resolveHome(values, io);
  const { owner } = openRegistry(dshHome);
  try {
    return { presets: modelStore(dshHome, owner).list() };
  } finally {
    owner.close();
  }
}

function parseRoute(values: CreateValues, prefix: 'orchestrator' | 'assignment'): ModelRoute {
  const provider = trimmed(values[`${prefix}-provider`]);
  const model = trimmed(values[`${prefix}-model`]);
  const effort = trimmed(values[`${prefix}-effort`]);
  if (provider === undefined || model === undefined) {
    throw usageError(`--${prefix}-provider and --${prefix}-model are required.`);
  }
  return { provider, model, ...(effort === undefined ? {} : { reasoningEffort: effort }) };
}

function runModelPresetCreate(values: CreateValues, io: BotCreateCliIo): { preset: ModelPreset } {
  const name = trimmed(values.name);
  if (name === undefined) throw usageError('--name is required for a model preset.');
  const orchestrator = parseRoute(values, 'orchestrator');
  const assignmentDefault = parseRoute(values, 'assignment');
  assertKnownProvider(orchestrator.provider);
  assertKnownProvider(assignmentDefault.provider);
  const dshHome = resolveHome(values, io);
  const { owner } = openRegistry(dshHome);
  try {
    try {
      const preset = modelStore(dshHome, owner).create({ name, orchestrator, assignmentDefault });
      io.stderr(`deepseekbot: created model preset ${preset.id} ("${preset.name}")`);
      return { preset };
    } catch (error) {
      if (error instanceof Error && error.message.includes('already exists')) {
        throw new CliFailure('duplicate-preset', `Model preset already exists: ${name}`, 1);
      }
      throw new CliFailure(
        'invalid-input',
        error instanceof Error ? error.message : 'The model preset could not be created.',
        1,
      );
    }
  } finally {
    owner.close();
  }
}

function runModelPresetApply(
  id: string,
  values: CreateValues,
  io: BotCreateCliIo,
): { bot: { id: string; name: string }; plan: PersonaBotModelPlan | null } {
  const slug = id.trim();
  if (slug.length === 0) throw usageError('model-preset-apply needs exactly one bot id.');
  const presetId = trimmed(values.preset);
  if (presetId === undefined) throw usageError('--preset is required to apply a model preset.');
  const dshHome = resolveHome(values, io);
  const { owner, registry } = openRegistry(dshHome);
  try {
    const record = registry.get(slug);
    if (record === undefined) throw new CliFailure('unknown-bot', `Unknown bot: ${slug}`, 1);
    const preset = modelStore(dshHome, owner).get(presetId);
    if (preset === undefined) {
      throw new CliFailure('unknown-preset', `Unknown model preset: ${presetId}`, 1);
    }
    assertKnownProvider(preset.orchestrator.provider);
    assertKnownProvider(preset.assignmentDefault.provider);
    const applied = registry.applyModelPreset(slug, preset);
    if (!applied.ok) {
      throw new CliFailure('unknown-preset', `Unknown model preset: ${presetId}`, 1);
    }
    io.stderr(`deepseekbot: applied model preset "${preset.name}" to ${slug}`);
    return {
      bot: { id: slug, name: applied.record.displayName },
      plan: applied.record.modelPlan ?? null,
    };
  } finally {
    owner.close();
  }
}

const SHA_RE = /^[0-9a-f]{40}$/u;

function callMemory<T>(run: () => T): T {
  try {
    return run();
  } catch (error) {
    if (error instanceof MemoryAcceptError || error instanceof MemoryFileError) {
      throw new CliFailure(error.code, error.message, 1);
    }
    if (error instanceof MemoryPathError) {
      throw new CliFailure('invalid-input', error.message, 1);
    }
    throw error;
  }
}

interface MemoryScope {
  owner: OperationalDatabaseOwner;
  registry: PersonaBotRegistry;
  record: PersonaBotRecord;
  memory: MemoryService;
}

function openMemory(id: string, values: CreateValues, io: BotCreateCliIo): MemoryScope {
  const slug = id.trim();
  if (slug.length === 0) throw usageError('A bot id is required.');
  const dshHome = resolveHome(values, io);
  const { owner, registry } = openRegistry(dshHome);
  try {
    const record = registry.get(slug);
    if (record === undefined) {
      throw new CliFailure('unknown-bot', `Unknown bot: ${slug}`, 1);
    }
    const ownership = createSessionOwnership(attachOperationalModule(owner, 'session-ownership'));
    const memory = createMemoryService({ registry, ownership, database: owner });
    return { owner, registry, record, memory };
  } catch (error) {
    owner.close();
    throw error;
  }
}

function memoryBot(record: PersonaBotRecord): { id: string; name: string } {
  return { id: record.slug, name: record.displayName };
}

function runMemorySnapshot(
  id: string,
  values: CreateValues,
  io: BotCreateCliIo,
): { bot: { id: string; name: string }; snapshot: MemoryAcceptedSnapshot } {
  const opened = openMemory(id, values, io);
  try {
    return {
      bot: memoryBot(opened.record),
      snapshot: callMemory(() => opened.memory.snapshot(opened.record.slug)),
    };
  } finally {
    opened.owner.close();
  }
}

function runMemoryFile(
  id: string,
  values: CreateValues,
  io: BotCreateCliIo,
): {
  bot: { id: string; name: string };
  file: { path: string; body: string; head: string; binary: boolean | undefined } | null;
} {
  const path = trimmed(values.path);
  if (path === undefined) throw usageError('--path is required for memory-file.');
  const opened = openMemory(id, values, io);
  try {
    const file = callMemory(() => opened.memory.readAccepted(opened.record.slug, path));
    return {
      bot: memoryBot(opened.record),
      file:
        file === undefined
          ? null
          : { path: file.path, body: file.body, head: file.head, binary: file.binary },
    };
  } finally {
    opened.owner.close();
  }
}

function runMemoryHistory(
  id: string,
  values: CreateValues,
  io: BotCreateCliIo,
): { bot: { id: string; name: string }; commits: MemoryAcceptedCommit[] } {
  const rawLimit = trimmed(values.limit);
  let limit: number | undefined;
  if (rawLimit !== undefined) {
    if (!/^[0-9]+$/u.test(rawLimit) || Number(rawLimit) < 1) {
      throw usageError('--limit must be a positive whole number.');
    }
    limit = Number(rawLimit);
  }
  const opened = openMemory(id, values, io);
  try {
    return {
      bot: memoryBot(opened.record),
      commits: callMemory(() => opened.memory.history(opened.record.slug, limit)),
    };
  } finally {
    opened.owner.close();
  }
}

function runMemoryDiff(
  id: string,
  values: CreateValues,
  io: BotCreateCliIo,
): { bot: { id: string; name: string }; sha: string; diff: string } {
  const sha = trimmed(values.sha);
  if (sha === undefined || !SHA_RE.test(sha)) {
    throw new CliFailure(
      'invalid-input',
      'A 40-character lowercase commit sha is required for memory-diff.',
      1,
    );
  }
  const opened = openMemory(id, values, io);
  try {
    const result = callMemory(() => opened.memory.diff(opened.record.slug, sha));
    return { bot: memoryBot(opened.record), sha: result.sha, diff: result.diff };
  } finally {
    opened.owner.close();
  }
}

function currentHead(dataDir: string): string {
  try {
    return execFileSync('git', ['-C', dataDir, 'rev-parse', 'HEAD'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    }).trim();
  } catch {
    throw new CliFailure('memory-unavailable', 'The Bot memory history could not be read.', 1);
  }
}

async function runMemorySave(
  id: string,
  values: CreateValues,
  io: BotCreateCliIo,
  readStdin: () => Promise<string>,
): Promise<{ bot: { id: string; name: string }; commit: MemoryAcceptedCommit }> {
  const path = trimmed(values.path);
  if (path === undefined) throw usageError('--path is required for memory-save.');
  const body = values.body;
  const bodyStdin = values['body-stdin'] === true;
  if (body !== undefined && bodyStdin) {
    throw usageError('Pass --body or --body-stdin, not both.');
  }
  if (body === undefined && !bodyStdin) {
    throw usageError('Pass --body or --body-stdin for memory-save.');
  }
  const text = bodyStdin ? await readStdin() : body!;
  const expectedHead = trimmed(values['expected-head']);
  if (expectedHead !== undefined && !SHA_RE.test(expectedHead)) {
    throw new CliFailure(
      'invalid-input',
      'A 40-character lowercase commit sha is required for --expected-head.',
      1,
    );
  }
  const editId = trimmed(values['edit-id']) ?? randomUUID();
  if (editId.length > 100) {
    throw new CliFailure('invalid-input', '--edit-id must be at most 100 characters.', 1);
  }
  const opened = openMemory(id, values, io);
  try {
    const dataDir =
      opened.registry.memoryDirFor(opened.record.slug) ??
      join(resolveHome(values, io), 'botharness', 'bots', opened.record.slug, 'memory');
    const head = expectedHead ?? currentHead(dataDir);
    const commit = callMemory(() =>
      opened.memory.saveHuman({
        botSlug: opened.record.slug,
        path,
        body: text,
        expectedHead: head,
        editId,
      }),
    );
    io.stderr(
      `deepseekbot: committed ${path} as ${commit.sha.slice(0, 7)} for ${opened.record.slug}`,
    );
    return { bot: memoryBot(opened.record), commit };
  } finally {
    opened.owner.close();
  }
}

function runModelPlan(
  id: string,
  values: CreateValues,
  io: BotCreateCliIo,
): {
  bot: { id: string; name: string };
  plan: PersonaBotModelPlan | null;
  revision: number;
  readiness: { status: 'deferred'; code: string; detail: string };
} {
  const slug = id.trim();
  if (slug.length === 0) throw usageError('model-plan needs exactly one bot id.');
  const dshHome = resolveHome(values, io);
  const { owner, registry } = openRegistry(dshHome);
  try {
    const record = registry.get(slug);
    if (record === undefined) throw new CliFailure('unknown-bot', `Unknown bot: ${slug}`, 1);
    return {
      bot: { id: slug, name: record.displayName },
      plan: record.modelPlan ?? null,
      revision: record.modelPlan?.revision ?? record.modelPlanRevision ?? 0,
      readiness: {
        status: 'deferred',
        code: 'host-only',
        detail: 'Model readiness inspection needs a running Host.',
      },
    };
  } finally {
    owner.close();
  }
}

function openChannels(
  dshHome: string,
  owner: OperationalDatabaseOwner,
  registry: PersonaBotRegistry,
) {
  return createSqliteChannelStore({
    database: attachOperationalModule(owner, 'messaging'),
    rootDir: join(dshHome, 'botharness', 'channels'),
    botDisplayName: (botSlug) => registry.getHistorical(botSlug)?.displayName,
  });
}

function runPause(
  id: string,
  paused: boolean,
  values: CreateValues,
  io: BotCreateCliIo,
): { bot: { id: string; name: string; paused: boolean } } {
  const slug = id.trim();
  if (slug.length === 0) throw usageError('pause and resume need exactly one bot id.');
  const dshHome = resolveHome(values, io);
  const { owner, registry } = openRegistry(dshHome);
  try {
    const result = registry.setPaused(slug, paused);
    if (!result.ok) throw new CliFailure('unknown-bot', `Unknown bot: ${slug}`, 1);
    io.stderr(`deepseekbot: ${paused ? 'paused' : 'resumed'} ${slug}`);
    return {
      bot: {
        id: slug,
        name: result.record.displayName,
        paused: result.record.paused === true,
      },
    };
  } finally {
    owner.close();
  }
}

function runUpdate(
  id: string,
  values: CreateValues,
  io: BotCreateCliIo,
): { bot: { id: string; name: string; roles: string[]; description?: string } } {
  const slug = id.trim();
  if (slug.length === 0) throw usageError('update needs exactly one bot id.');
  const displayName = trimmed(values.name);
  const description = trimmed(values.description);
  const roles =
    values.role === undefined
      ? undefined
      : values.role.map((role) => role.trim()).filter((role) => role.length > 0);
  if (displayName === undefined && description === undefined && roles === undefined) {
    throw usageError('update needs at least one of --name, --description, or --role.');
  }
  if (
    (roles !== undefined &&
      (roles.length > MAX_DESCRIPTOR_TAGS ||
        roles.some((tag) => [...tag].length > MAX_DESCRIPTOR_TAG_LENGTH))) ||
    (description !== undefined && [...description].length > MAX_DESCRIPTOR_BIO_LENGTH)
  ) {
    throw new CliFailure('invalid-input', 'Tags or bio exceed the profile limits.', 1);
  }
  const dshHome = resolveHome(values, io);
  const { owner, registry } = openRegistry(dshHome);
  try {
    const result = registry.update(slug, {
      ...(displayName === undefined ? {} : { displayName }),
      ...(roles === undefined ? {} : { roles }),
      ...(description === undefined ? {} : { description }),
    });
    if (!result.ok) {
      throw result.reason === 'not-found'
        ? new CliFailure('unknown-bot', `Unknown bot: ${slug}`, 1)
        : new CliFailure('invalid-input', 'The bot could not be updated.', 1);
    }
    io.stderr(`deepseekbot: updated ${slug}`);
    return {
      bot: {
        id: slug,
        name: result.record.displayName,
        roles: result.record.roles ?? [],
        ...(result.record.description === undefined
          ? {}
          : { description: result.record.description }),
      },
    };
  } finally {
    owner.close();
  }
}

function runHumanNameSet(
  values: CreateValues,
  io: BotCreateCliIo,
): { human: { humanId: string; displayName: string } } {
  const name = trimmed(values.name);
  const clear = values.clear === true;
  if ((name === undefined) === !clear) {
    throw usageError('human-name-set needs --name or --clear, not both or neither.');
  }
  const dshHome = resolveHome(values, io);
  const { owner, registry } = openRegistry(dshHome);
  try {
    const channels = openChannels(dshHome, owner, registry);
    try {
      const identity = channels.setHumanDefaultName(clear ? null : name!);
      io.stderr(`deepseekbot: set the Human display name`);
      return { human: { humanId: identity.humanId, displayName: identity.displayName } };
    } catch (error) {
      throw new CliFailure(
        'invalid-input',
        error instanceof Error ? error.message : 'The Human display name is invalid.',
        1,
      );
    }
  } finally {
    owner.close();
  }
}

function runChannelHumanNameSet(
  id: string,
  values: CreateValues,
  io: BotCreateCliIo,
): { channel: { id: string }; nickname: string | null } {
  const channelId = id.trim();
  if (channelId.length === 0)
    throw usageError('channel-human-name-set needs exactly one channel id.');
  const nickname = trimmed(values.nickname);
  const clear = values.clear === true;
  if ((nickname === undefined) === !clear) {
    throw usageError('channel-human-name-set needs --nickname or --clear, not both or neither.');
  }
  const dshHome = resolveHome(values, io);
  const { owner, registry } = openRegistry(dshHome);
  try {
    const channels = openChannels(dshHome, owner, registry);
    if (channels.get(channelId) === undefined) {
      throw new CliFailure('unknown-channel', `Unknown channel: ${channelId}`, 1);
    }
    try {
      channels.setHumanNickname(channelId, clear ? null : nickname!);
    } catch (error) {
      throw new CliFailure(
        'invalid-input',
        error instanceof Error ? error.message : 'The Human nickname is invalid.',
        1,
      );
    }
    io.stderr(`deepseekbot: set the Human nickname in ${channelId}`);
    return { channel: { id: channelId }, nickname: channels.humanNickname(channelId) ?? null };
  } finally {
    owner.close();
  }
}

function openSchedules(owner: OperationalDatabaseOwner, registry: PersonaBotRegistry) {
  return createBotScheduleStore({
    database: attachOperationalModule(owner, 'bot-schedules'),
    isBotActive: (botSlug) => {
      const bot = registry.get(botSlug);
      return bot !== undefined && bot.paused !== true;
    },
    onAdmitted: () => {},
  });
}

function openGrants(owner: OperationalDatabaseOwner) {
  return createWorkspaceGrantStore({
    database: attachOperationalModule(owner, 'workspace-grants'),
    workspaces: () => undefined,
  });
}

function scheduleFailure(error: unknown): never {
  if (error instanceof BotScheduleError) {
    if (error.code === 'not-found') {
      throw new CliFailure('unknown-schedule', error.message, 1);
    }
    throw new CliFailure(error.code, error.message, 1);
  }
  throw error;
}

function grantFailure(error: unknown): never {
  if (error instanceof WorkspaceGrantError) {
    throw new CliFailure(error.code, error.message, 1);
  }
  throw error;
}

function requireBotRecord(registry: PersonaBotRegistry, slug: string): PersonaBotRecord {
  const record = registry.get(slug.trim());
  if (record === undefined) {
    throw new CliFailure('unknown-bot', `Unknown bot: ${slug.trim()}`, 1);
  }
  return record;
}

function runChannels(
  values: CreateValues,
  io: BotCreateCliIo,
): { channels: Array<{ id: string; type: string; name: string; botSlug?: string }> } {
  const dshHome = resolveHome(values, io);
  const { owner, registry } = openRegistry(dshHome);
  try {
    const channels = openChannels(dshHome, owner, registry);
    return {
      channels: channels.list().map((channel) => ({
        id: channel.id,
        type: channel.type,
        name: channel.name,
        ...(channel.botSlug === undefined ? {} : { botSlug: channel.botSlug }),
      })),
    };
  } finally {
    owner.close();
  }
}

function runChannelMessages(
  id: string,
  values: CreateValues,
  io: BotCreateCliIo,
): { channel: { id: string }; messages: unknown[] } {
  const channelId = id.trim();
  if (channelId.length === 0) throw usageError('channel-messages needs exactly one channel id.');
  const rawLimit = trimmed(values.limit);
  let limit: number | undefined;
  if (rawLimit !== undefined) {
    if (!/^[0-9]+$/u.test(rawLimit) || Number(rawLimit) < 1) {
      throw usageError('--limit must be a positive whole number.');
    }
    limit = Number(rawLimit);
  }
  const before = trimmed(values.before);
  const dshHome = resolveHome(values, io);
  const { owner, registry } = openRegistry(dshHome);
  try {
    const channels = openChannels(dshHome, owner, registry);
    if (channels.get(channelId) === undefined) {
      throw new CliFailure('unknown-channel', `Unknown channel: ${channelId}`, 1);
    }
    return {
      channel: { id: channelId },
      messages: channels.readMessages(channelId, {
        ...(limit === undefined ? {} : { limit }),
        ...(before === undefined ? {} : { before }),
      }),
    };
  } finally {
    owner.close();
  }
}

function runGrants(
  id: string,
  values: CreateValues,
  io: BotCreateCliIo,
): { bot: { id: string; name: string }; grants: WorkspaceGrant[] } {
  const slug = id.trim();
  if (slug.length === 0) throw usageError('grants needs exactly one bot id.');
  const dshHome = resolveHome(values, io);
  const { owner, registry } = openRegistry(dshHome);
  try {
    const record = requireBotRecord(registry, slug);
    return {
      bot: memoryBot(record),
      grants: openGrants(owner).list(record.slug),
    };
  } finally {
    owner.close();
  }
}

function runGrantRevoke(
  id: string,
  values: CreateValues,
  io: BotCreateCliIo,
): { bot: { id: string; name: string }; grant: WorkspaceGrant } {
  const slug = id.trim();
  if (slug.length === 0) throw usageError('grant-revoke needs exactly one bot id.');
  const grantId = trimmed(values.grant);
  if (grantId === undefined) throw usageError('--grant is required for grant-revoke.');
  const dshHome = resolveHome(values, io);
  const { owner, registry } = openRegistry(dshHome);
  try {
    const record = requireBotRecord(registry, slug);
    try {
      const grant = openGrants(owner).revoke(record.slug, grantId);
      io.stderr(`deepseekbot: revoked grant ${grantId} for ${record.slug}`);
      return { bot: memoryBot(record), grant };
    } catch (error) {
      grantFailure(error);
    }
  } finally {
    owner.close();
  }
}

function runGrantWriteSet(
  id: string,
  values: CreateValues,
  io: BotCreateCliIo,
): { bot: { id: string; name: string }; grant: WorkspaceGrant } {
  const slug = id.trim();
  if (slug.length === 0) throw usageError('grant-write-set needs exactly one bot id.');
  const grantId = trimmed(values.grant);
  if (grantId === undefined) throw usageError('--grant is required for grant-write-set.');
  const enabled = values.enabled === true;
  const disabled = values.disabled === true;
  if (enabled === disabled) {
    throw usageError('grant-write-set needs --enabled or --disabled, not both or neither.');
  }
  const dshHome = resolveHome(values, io);
  const { owner, registry } = openRegistry(dshHome);
  try {
    const record = requireBotRecord(registry, slug);
    try {
      const grant = openGrants(owner).setOrchestratorWrite(record.slug, grantId, enabled);
      io.stderr(
        `deepseekbot: set orchestrator write ${enabled ? 'on' : 'off'} for grant ${grantId}`,
      );
      return { bot: memoryBot(record), grant };
    } catch (error) {
      grantFailure(error);
    }
  } finally {
    owner.close();
  }
}

function parseTrigger(values: CreateValues): BotScheduleTrigger | undefined {
  return scheduleTriggerFromFlags(values, usageError);
}

function enabledFlag(
  values: CreateValues,
  on: 'enabled' | 'locked',
  off: 'disabled' | 'unlocked',
): boolean | undefined {
  return scheduleToggleFromFlags(values, on, off, usageError);
}

function runSchedules(
  id: string,
  values: CreateValues,
  io: BotCreateCliIo,
): { bot: { id: string; name: string }; schedules: BotSchedule[] } {
  const slug = id.trim();
  if (slug.length === 0) throw usageError('schedules needs exactly one bot id.');
  const dshHome = resolveHome(values, io);
  const { owner, registry } = openRegistry(dshHome);
  try {
    const record = requireBotRecord(registry, slug);
    return {
      bot: memoryBot(record),
      schedules: openSchedules(owner, registry).list(record.slug),
    };
  } finally {
    owner.close();
  }
}

function runScheduleCreate(
  id: string,
  values: CreateValues,
  io: BotCreateCliIo,
): { bot: { id: string; name: string }; schedule: BotSchedule } {
  const slug = id.trim();
  if (slug.length === 0) throw usageError('schedule-create needs exactly one bot id.');
  const title = trimmed(values.title);
  const prompt = trimmed(values.prompt);
  if (title === undefined || prompt === undefined) {
    throw usageError('--title and --prompt are required for schedule-create.');
  }
  const trigger = parseTrigger(values);
  if (trigger === undefined) throw usageError('schedule-create needs a trigger flag.');
  const enabled = enabledFlag(values, 'enabled', 'disabled');
  const locked = enabledFlag(values, 'locked', 'unlocked');
  const dshHome = resolveHome(values, io);
  const { owner, registry } = openRegistry(dshHome);
  try {
    const record = requireBotRecord(registry, slug);
    try {
      const schedule = openSchedules(owner, registry).create(
        record.slug,
        {
          title,
          prompt,
          trigger,
          ...(enabled === undefined ? {} : { enabled }),
          ...(locked === undefined ? {} : { locked }),
        },
        'human',
      );
      io.stderr(`deepseekbot: created schedule ${schedule.id} for ${record.slug}`);
      return { bot: memoryBot(record), schedule };
    } catch (error) {
      scheduleFailure(error);
    }
  } finally {
    owner.close();
  }
}

function runScheduleUpdate(
  id: string,
  values: CreateValues,
  io: BotCreateCliIo,
): { bot: { id: string; name: string }; schedule: BotSchedule } {
  const slug = id.trim();
  if (slug.length === 0) throw usageError('schedule-update needs exactly one bot id.');
  const scheduleId = trimmed(values.sid);
  if (scheduleId === undefined) throw usageError('--sid is required for schedule-update.');
  const title = trimmed(values.title);
  const prompt = trimmed(values.prompt);
  const trigger = parseTrigger(values);
  const enabled = enabledFlag(values, 'enabled', 'disabled');
  const locked = enabledFlag(values, 'locked', 'unlocked');
  if (
    title === undefined &&
    prompt === undefined &&
    trigger === undefined &&
    enabled === undefined &&
    locked === undefined
  ) {
    throw usageError('schedule-update needs at least one change flag.');
  }
  const dshHome = resolveHome(values, io);
  const { owner, registry } = openRegistry(dshHome);
  try {
    const record = requireBotRecord(registry, slug);
    try {
      const schedule = openSchedules(owner, registry).update(
        record.slug,
        scheduleId,
        {
          ...(title === undefined ? {} : { title }),
          ...(prompt === undefined ? {} : { prompt }),
          ...(trigger === undefined ? {} : { trigger }),
          ...(enabled === undefined ? {} : { enabled }),
          ...(locked === undefined ? {} : { locked }),
        },
        'human',
      );
      io.stderr(`deepseekbot: updated schedule ${scheduleId} for ${record.slug}`);
      return { bot: memoryBot(record), schedule };
    } catch (error) {
      scheduleFailure(error);
    }
  } finally {
    owner.close();
  }
}

function runScheduleDelete(
  id: string,
  values: CreateValues,
  io: BotCreateCliIo,
): { bot: { id: string; name: string }; removed: boolean } {
  const slug = id.trim();
  if (slug.length === 0) throw usageError('schedule-delete needs exactly one bot id.');
  const scheduleId = trimmed(values.sid);
  if (scheduleId === undefined) throw usageError('--sid is required for schedule-delete.');
  const dshHome = resolveHome(values, io);
  const { owner, registry } = openRegistry(dshHome);
  try {
    const record = requireBotRecord(registry, slug);
    try {
      const removed = openSchedules(owner, registry).remove(record.slug, scheduleId, 'human');
      io.stderr(`deepseekbot: deleted schedule ${scheduleId} for ${record.slug}`);
      return { bot: memoryBot(record), removed };
    } catch (error) {
      scheduleFailure(error);
    }
  } finally {
    owner.close();
  }
}

function runScheduleHistory(
  id: string,
  values: CreateValues,
  io: BotCreateCliIo,
): { bot: { id: string; name: string }; firings: BotScheduleFiring[] } {
  const slug = id.trim();
  if (slug.length === 0) throw usageError('schedule-history needs exactly one bot id.');
  const scheduleId = trimmed(values.sid);
  if (scheduleId === undefined) throw usageError('--sid is required for schedule-history.');
  const dshHome = resolveHome(values, io);
  const { owner, registry } = openRegistry(dshHome);
  try {
    const record = requireBotRecord(registry, slug);
    try {
      return {
        bot: memoryBot(record),
        firings: openSchedules(owner, registry).history(record.slug, scheduleId),
      };
    } catch (error) {
      scheduleFailure(error);
    }
  } finally {
    owner.close();
  }
}

function runScheduleRunNow(
  id: string,
  values: CreateValues,
  io: BotCreateCliIo,
): { bot: { id: string; name: string }; firing: BotScheduleFiring } {
  const slug = id.trim();
  if (slug.length === 0) throw usageError('schedule-run-now needs exactly one bot id.');
  const scheduleId = trimmed(values.sid);
  if (scheduleId === undefined) throw usageError('--sid is required for schedule-run-now.');
  const dshHome = resolveHome(values, io);
  const { owner, registry } = openRegistry(dshHome);
  try {
    const record = requireBotRecord(registry, slug);
    try {
      const firing = openSchedules(owner, registry).runNow(record.slug, scheduleId);
      io.stderr(
        `deepseekbot: recorded a manual firing for schedule ${scheduleId}; the Host executes it`,
      );
      return { bot: memoryBot(record), firing };
    } catch (error) {
      scheduleFailure(error);
    }
  } finally {
    owner.close();
  }
}

function runSchedulePreview(values: CreateValues): {
  trigger: BotScheduleTrigger;
  occurrences: string[];
} {
  const trigger = parseTrigger(values);
  if (trigger === undefined) throw usageError('schedule-preview needs a trigger flag.');
  try {
    return { trigger, occurrences: previewBotScheduleTrigger(trigger) };
  } catch (error) {
    if (error instanceof BotScheduleError) {
      throw new CliFailure(error.code, error.message, 1);
    }
    throw error;
  }
}

function runPairings(
  id: string,
  values: CreateValues,
  io: BotCreateCliIo,
): { bot: { id: string; name: string }; pairings: unknown[] } {
  const slug = id.trim();
  if (slug.length === 0) throw usageError('pairings needs exactly one bot id.');
  const dshHome = resolveHome(values, io);
  const { owner, registry } = openRegistry(dshHome);
  try {
    const record = requireBotRecord(registry, slug);
    const pairing = createBotPairing(attachOperationalModule(owner, 'messaging'), (botSlug) => {
      const bot = registry.get(botSlug);
      return bot !== undefined && bot.paused !== true;
    });
    return { bot: memoryBot(record), pairings: pairing.list(record.slug) };
  } finally {
    owner.close();
  }
}

const SECRET_NAME_RE = /^[A-Za-z_][A-Za-z0-9_]*$/u;

interface CredentialRefs {
  lines: string[];
  spans: Map<string, { start: number; end: number }>;
  valueRanges: Map<string, { start: number; end: number }>;
}

function credentialPath(dshHome: string): string {
  return join(dshHome, '.credentials.yaml');
}

function badCredentials(message: string): CliFailure {
  return new CliFailure('bad-credentials', message, 1);
}

function parseCredentialRefs(path: string, text: string): CredentialRefs {
  const invalid = (detail: string): CliFailure =>
    badCredentials(`The credential file ${path} is invalid: ${detail}`);
  try {
    parseCredentialsDocument(text, path);
  } catch {
    throw invalid('the native credential schema rejected this document');
  }
  const document = parseDocument(text, { uniqueKeys: true });
  if (document.errors.length > 0 || !isMap(document.contents))
    throw invalid('expected valid YAML with a mapping root');
  for (const pair of document.contents.items) {
    if (!isScalar(pair.key) || !['version', 'refs', 'records'].includes(String(pair.key.value)))
      throw invalid('unknown top-level key');
  }
  if (document.get('version') !== 1)
    throw invalid('missing or unsupported version (want version: 1)');
  const refs = document.get('refs', true);
  const records = document.get('records', true);
  if (records !== undefined && !(isScalar(records) && records.value === null) && !isMap(records))
    throw invalid('records must be a mapping');
  const valueRanges = new Map<string, { start: number; end: number }>();
  if (refs !== undefined && !(isScalar(refs) && refs.value === null)) {
    if (!isMap(refs)) throw invalid('refs must be a mapping');
    if (refs.flow && refs.items.length > 0)
      throw invalid('nonempty inline refs cannot be line-edited; use a block mapping');
    for (const pair of refs.items) {
      if (
        !isScalar(pair.key) ||
        typeof pair.key.value !== 'string' ||
        !SECRET_NAME_RE.test(pair.key.value) ||
        !isScalar(pair.value) ||
        typeof pair.value.value !== 'string' ||
        pair.value.value.trim().length === 0
      )
        throw invalid('refs require addressable keys and nonempty string values');
      if (!pair.value.range) throw invalid('refs require source-addressable values');
      valueRanges.set(pair.key.value, { start: pair.value.range[0], end: pair.value.range[1] });
    }
  }
  const lines = text.split('\n');
  const tops = new Map<string, number>();
  let section: string | undefined;
  let entry: { name: string; start: number; indent: number } | undefined;
  const spans = new Map<string, { start: number; end: number }>();
  const closeEntry = (end: number): void => {
    if (entry === undefined) return;
    if (spans.has(entry.name)) throw invalid(`duplicate key ${entry.name}`);
    spans.set(entry.name, { start: entry.start, end });
    entry = undefined;
  };
  lines.forEach((line, index) => {
    if (line.trim().length === 0) {
      return;
    }
    const indent = line.length - line.trimStart().length;
    const isComment = line.trimStart().startsWith('#');
    if (entry !== undefined && indent > entry.indent) return;
    closeEntry(index);
    if (isComment) return;
    if (indent === 0) {
      if (line === '---' || line === '...') {
        section = undefined;
        return;
      }
      const top = /^([A-Za-z0-9_-]+):(.*)$/u.exec(line);
      if (top === null || top[1] === undefined) throw invalid(`unexpected line ${index + 1}`);
      const name = top[1];
      if (tops.has(name)) throw invalid(`duplicate key ${name}`);
      tops.set(name, index);
      if (name !== 'version' && name !== 'refs' && name !== 'records') {
        throw invalid(`unknown top-level key ${name}`);
      }
      section = name;
      return;
    }
    if (section !== 'refs') {
      if (section === 'records') return;
      throw invalid(`unexpected line ${index + 1}`);
    }
    const item = /^(\s+)([^:\s][^:]*):(.*)$/u.exec(line);
    if (item === null || item[1] === undefined || item[2] === undefined) {
      throw invalid(`unexpected line ${index + 1} under refs`);
    }
    const name = item[2].trim();
    if (!SECRET_NAME_RE.test(name)) throw invalid(`unaddressable key ${name}`);
    entry = { name, start: index, indent: item[1].length };
  });
  closeEntry(lines.length);
  const versionRaw = tops.has('version') ? lines[tops.get('version')!] : undefined;
  const versionLine =
    versionRaw === undefined
      ? undefined
      : versionRaw
          .replace(/^version:/u, '')
          .split(/\s+#/u, 1)[0]!
          .trim()
          .replace(/^(['"])(.*)\1$/u, '$2');
  if (versionLine !== '1') throw invalid('missing or unsupported version (want version: 1)');
  return { lines, spans, valueRanges };
}

function renderSecretEntry(name: string, value: string): string[] {
  return [`  ${name}: ${JSON.stringify(value)}`];
}

function checkCredentialMode(path: string): void {
  if (process.platform === 'win32') return;
  let mode: number;
  try {
    mode = lstatSync(path).mode;
  } catch {
    throw badCredentials(`The credential file ${path} cannot be read.`);
  }
  if ((mode & 0o077) !== 0) {
    throw badCredentials(
      `The credential file ${path} is readable beyond its owner; run chmod 600 ${path}.`,
    );
  }
}

function backupCredentialFile(path: string, lines: string[]): string {
  const stamp = new Date().toISOString().replace(/[:.]/gu, '-');
  const backup = `${path}.bak-${stamp}`;
  writeFileSync(backup, lines.join('\n'), { mode: 0o600 });
  return backup;
}

function writeCredentialFile(path: string, lines: string[]): void {
  writeFileSync(path, lines.join('\n'));
  if (process.platform !== 'win32') chmodSync(path, 0o600);
}

function readCredentialStore(dshHome: string): {
  path: string;
  exists: boolean;
  refs: CredentialRefs | undefined;
} {
  const path = credentialPath(dshHome);
  let text: string;
  try {
    text = readFileSync(path, 'utf8');
  } catch (error) {
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT')
      return { path, exists: false, refs: undefined };
    throw badCredentials('The credential file cannot be read.');
  }
  if (text.trim().length === 0) throw badCredentials('The credential file is empty.');
  checkCredentialMode(path);
  return { path, exists: true, refs: parseCredentialRefs(path, text) };
}

function secretRecord(
  name: string,
  env: NodeJS.ProcessEnv,
  stored: boolean,
): { name: string; configured: boolean; source: string; writable: boolean } {
  const fromEnv = env[name];
  if (fromEnv !== undefined && fromEnv.length > 0) {
    return { name, configured: true, source: 'environment', writable: false };
  }
  if (stored) {
    return { name, configured: true, source: 'file', writable: true };
  }
  return { name, configured: false, source: 'absent', writable: false };
}

function runSecretList(
  values: CreateValues,
  io: BotCreateCliIo,
): { secrets: Array<{ name: string; configured: boolean; source: string; writable: boolean }> } {
  const dshHome = resolveHome(values, io);
  const store = readCredentialStore(dshHome);
  if (!store.exists || store.refs === undefined) return { secrets: [] };
  return {
    secrets: [...store.refs.spans.keys()].sort().map((name) => secretRecord(name, io.env, true)),
  };
}

async function runSecretPut(
  name: string,
  values: CreateValues,
  io: BotCreateCliIo,
  readStdin: () => Promise<string>,
): Promise<{ secret: { name: string; configured: boolean; source: string; writable: boolean } }> {
  const rawName = name.trim();
  if (!SECRET_NAME_RE.test(rawName)) {
    throw new CliFailure(
      'invalid-input',
      'secret-put needs an environment-variable-style name.',
      1,
    );
  }
  const value = (await readStdin()).replace(/\r?\n$/u, '');
  if (value.length === 0) {
    throw new CliFailure(
      'invalid-input',
      'secret-put read an empty value; removing a key deletes it, use secret-unset.',
      1,
    );
  }
  const dshHome = resolveHome(values, io);
  const store = readCredentialStore(dshHome);
  let lines: string[];
  let spans: Map<string, { start: number; end: number }>;
  if (!store.exists || store.refs === undefined) {
    lines = ['version: 1', '', 'refs:'];
    spans = new Map();
  } else {
    lines = [...store.refs.lines];
    spans = new Map(store.refs.spans);
    backupCredentialFile(store.path, lines);
  }
  const original = store.exists ? readFileSync(store.path, 'utf8') : undefined;
  const entry = renderSecretEntry(rawName, value);
  const span = spans.get(rawName);
  let next: string[];
  if (span !== undefined) {
    const range = store.refs?.valueRanges.get(rawName);
    if (!range || original === undefined)
      throw badCredentials('The secret has no editable source range.');
    const suffix = original.slice(range.end);
    const separator = original.slice(range.start, range.end).endsWith('\n') ? '\n' : '';
    next = (original.slice(0, range.start) + JSON.stringify(value) + separator + suffix).split(
      '\n',
    );
  } else {
    const refsLine = lines.findIndex((line) => /^refs:(.*)$/u.test(line));
    if (refsLine === -1) {
      const tail = lines.length > 0 && lines[lines.length - 1] !== '' ? [''] : [];
      next = [...lines, ...tail, 'refs:', ...entry];
    } else {
      lines[refsLine] = lines[refsLine]!.replace(/^(refs:)\s*\{\s*\}/u, '$1');
      let end = refsLine + 1;
      while (end < lines.length) {
        const line = lines[end]!;
        if (line.trim().length === 0) {
          end += 1;
          continue;
        }
        if (line.length - line.trimStart().length === 0) break;
        end += 1;
      }
      next = [...lines.slice(0, end), ...entry, ...lines.slice(end)];
    }
  }
  if (next.length > 0 && next[next.length - 1] !== '') next.push('');
  try {
    parseCredentialRefs(store.path, next.join('\n'));
    writeCredentialFile(store.path, next);
    const text = readFileSync(store.path, 'utf8');
    const reread = parseCredentialRefs(store.path, text);
    if (!reread.spans.has(rawName) || parseDocument(text).getIn(['refs', rawName]) !== value)
      throw badCredentials('The secret write did not round-trip.');
  } catch {
    if (original === undefined) {
      try {
        unlinkSync(store.path);
      } catch (error) {
        if (
          !(
            typeof error === 'object' &&
            error !== null &&
            'code' in error &&
            error.code === 'ENOENT'
          )
        )
          throw badCredentials('The failed new credential file could not be removed.');
      }
    } else writeFileSync(store.path, original, { mode: 0o600 });
    throw badCredentials(
      'The secret write failed validation; the previous credential file was restored.',
    );
  }
  io.stderr(`deepseekbot: saved secret ${rawName}`);
  return { secret: secretRecord(rawName, io.env, true) };
}

function runSecretUnset(
  name: string,
  values: CreateValues,
  io: BotCreateCliIo,
): { secret: { name: string; configured: boolean; source: string; writable: boolean } } {
  const rawName = name.trim();
  if (!SECRET_NAME_RE.test(rawName)) {
    throw new CliFailure(
      'invalid-input',
      'secret-unset needs an environment-variable-style name.',
      1,
    );
  }
  const dshHome = resolveHome(values, io);
  const store = readCredentialStore(dshHome);
  if (!store.exists || store.refs === undefined) {
    return { secret: secretRecord(rawName, io.env, false) };
  }
  const span = store.refs.spans.get(rawName);
  if (span === undefined) {
    return { secret: secretRecord(rawName, io.env, false) };
  }
  const lines = [...store.refs.lines];
  backupCredentialFile(store.path, lines);
  const original = readFileSync(store.path, 'utf8');
  const range = store.refs.valueRanges.get(rawName);
  if (!range) throw badCredentials('The secret has no editable source range.');
  const entryStart = lines
    .slice(0, span.start)
    .reduce((offset, line) => offset + line.length + 1, 0);
  const next = (original.slice(0, entryStart) + original.slice(range.end)).split('\n');
  try {
    parseCredentialRefs(store.path, next.join('\n'));
    writeCredentialFile(store.path, next);
    const reread = parseCredentialRefs(store.path, readFileSync(store.path, 'utf8'));
    if (reread.spans.has(rawName)) throw badCredentials('The secret delete did not round-trip.');
  } catch {
    writeFileSync(store.path, original, { mode: 0o600 });
    throw badCredentials(
      'The secret delete failed validation; the previous credential file was restored.',
    );
  }
  io.stderr(`deepseekbot: removed secret ${rawName}`);
  return { secret: secretRecord(rawName, io.env, false) };
}

const SEARCH_INDEX: ReadonlyArray<{ command: string; description: string }> = [
  ...LIVE_COMMANDS,
  ...DIAGNOSTIC_COMMANDS,
  ...LIFECYCLE_COMMANDS,
  { command: 'create', description: 'create a PersonaBot blank, from a bundle, or from git' },
  { command: 'list', description: 'list PersonaBots' },
  { command: 'show', description: 'inspect one PersonaBot' },
  { command: 'model-presets', description: 'list model presets' },
  { command: 'model-preset-create', description: 'create a model preset from provider routes' },
  { command: 'model-preset-apply', description: 'apply a model preset to a bot' },
  { command: 'model-plan', description: 'show a bot model plan' },
  { command: 'memory-snapshot', description: 'read a bot memory snapshot' },
  { command: 'memory-file', description: 'read one bot memory file' },
  { command: 'memory-history', description: 'list bot memory commits' },
  { command: 'memory-diff', description: 'diff a bot memory commit' },
  { command: 'memory-save', description: 'write and commit one bot memory file' },
  { command: 'pause', description: 'pause a bot' },
  { command: 'resume', description: 'resume a bot' },
  { command: 'update', description: 'update bot name description roles' },
  { command: 'human-name-set', description: 'set the Human display name' },
  { command: 'channel-human-name-set', description: 'set the per-channel Human nickname' },
  { command: 'channels', description: 'list channels' },
  { command: 'channel-messages', description: 'read channel messages' },
  { command: 'grants', description: 'list bot workspace grants' },
  { command: 'grant-revoke', description: 'revoke a workspace grant' },
  { command: 'grant-write-set', description: 'set grant orchestrator write' },
  { command: 'schedules', description: 'list bot schedules' },
  { command: 'schedule-create', description: 'create a bot schedule' },
  { command: 'schedule-update', description: 'update a bot schedule' },
  { command: 'schedule-delete', description: 'delete a bot schedule' },
  { command: 'schedule-history', description: 'list schedule firings' },
  { command: 'schedule-run-now', description: 'record a manual schedule firing' },
  { command: 'schedule-preview', description: 'preview trigger occurrences' },
  { command: 'pairings', description: 'list bot IM pairing requests' },
  { command: 'secret-put', description: 'store a secret from stdin' },
  { command: 'secret-list', description: 'list secret names without values' },
  { command: 'secret-unset', description: 'delete a secret' },
  { command: 'search', description: 'search CLI commands by words' },
];

function runSearch(rest: readonly string[]): {
  query: string;
  matches: Array<{ command: string; description: string }>;
} {
  const query = rest.join(' ').trim();
  if (query.length === 0) throw usageError('search needs words to look for.');
  const tokens = query
    .toLowerCase()
    .split(/[^a-z0-9]+/u)
    .filter((token) => token.length > 0);
  if (tokens.length === 0) throw usageError('search needs words to look for.');
  const scored = SEARCH_INDEX.filter((entry) => {
    const text = `${entry.command} ${entry.description}`.toLowerCase();
    return tokens.every((token) => text.includes(token));
  }).map((entry) => {
    const name = entry.command.toLowerCase().replaceAll('-', ' ');
    return {
      entry,
      score:
        tokens.filter((token) => name.includes(token)).length +
        (entry.command === tokens.join('-') ? 1000 : 0),
    };
  });
  scored.sort(
    (left, right) =>
      right.score - left.score || left.entry.command.localeCompare(right.entry.command),
  );
  return { query, matches: scored.map((item) => item.entry) };
}

function compactJson(text: string): string {
  try {
    return JSON.stringify(JSON.parse(text));
  } catch {
    return text;
  }
}

export async function runBotCreateCli(
  argv: readonly string[],
  io: BotCreateCliIo,
): Promise<number> {
  const readStdin = io.readStdin ?? (async () => '');
  let compactOutput = false;
  const out: BotCreateCliIo = {
    ...io,
    stdout: (text: string): void => {
      io.stdout(compactOutput ? compactJson(text) : text);
    },
  };
  try {
    rejectSecretArgv(argv);
    const { values, positionals } = parseArgs({
      args: [...argv],
      options: CREATE_OPTIONS,
      allowPositionals: true,
      strict: true,
    });
    const [command, ...rest] = positionals;
    compactOutput = values.compact === true;
    if (values.help === true || command === undefined || command === 'help') {
      out.stdout(BOT_CREATE_HELP.trimEnd());
      return 0;
    }
    const online = values.host !== undefined || io.env['DEEPSEEKBOT_HOST'] !== undefined;
    if (
      DIAGNOSTIC_COMMANDS.some((entry) => entry.command === command) ||
      LIFECYCLE_COMMANDS.some((entry) => entry.command === command) ||
      (online && ONLINE_MANAGEMENT_COMMANDS.some((entry) => entry === command))
    ) {
      if (command === 'create' && rest.length > 0)
        throw usageError('create takes no positional arguments.');
      const input = command === 'create' ? await validatedCreate(values, readStdin) : undefined;
      let bundle;
      if (input?.source.kind === 'zip') {
        const contents = readZipBundle(input.source.path);
        bundle = {
          archive: contents.archive,
          name: basename(input.source.path),
          historySkipped: contents.historySkipped,
        };
      } else if (input?.source.kind === 'dir') {
        const contents = readDirBundle(input.source.path);
        const archive = writeZip([
          ...contents.files.map((file) => ({ ...file, path: `bot-bundle/${file.path}` })),
          ...(contents.history === undefined
            ? []
            : [{ path: `bot-bundle/${BOT_ZIP_HISTORY_PATH}`, data: contents.history }]),
        ]);
        readBotZip(archive);
        bundle = { archive, historySkipped: contents.historySkipped };
      }
      out.stdout(
        JSON.stringify(
          await runOnlineManagement(command, rest, values, io, input, bundle),
          null,
          2,
        ),
      );
      return 0;
    }
    if (
      LIVE_COMMANDS.some((entry) => entry.command === command) ||
      (([
        'channel-messages',
        'grants',
        'memory-snapshot',
        'memory-file',
        'memory-history',
        'memory-diff',
        'memory-save',
        ...PROFILE_ONLINE_COMMANDS,
      ].includes(command) ||
        isScheduleCommand(command)) &&
        (values.host !== undefined || io.env['DEEPSEEKBOT_HOST'] !== undefined)) ||
      (online && INBOX_HOST_COMMANDS.some((entry) => entry === command))
    ) {
      if (values.home !== undefined)
        throw usageError('Do not combine --home and an online Host target.');
      out.stdout(JSON.stringify(await runLiveCli(command, rest, values, io), null, 2));
      return 0;
    }
    if (
      values.host !== undefined ||
      values['token-file'] !== undefined ||
      (online && !['search', 'secret-put', 'secret-list', 'secret-unset'].includes(command))
    )
      throw usageError(
        'This command has no online adapter yet; use its explicit offline maintenance mode.',
      );
    if (command === 'list') {
      if (rest.length > 0) throw usageError('list takes no bot id.');
      out.stdout(JSON.stringify(runList(values, io), null, 2));
      return 0;
    }
    if (command === 'show') {
      if (rest.length !== 1) throw usageError('show needs exactly one bot id.');
      out.stdout(JSON.stringify(runShow(rest[0]!, values, io), null, 2));
      return 0;
    }
    if (command === 'model-presets') {
      if (rest.length > 0) throw usageError('model-presets takes no bot id.');
      out.stdout(JSON.stringify(runModelPresets(values, io), null, 2));
      return 0;
    }
    if (command === 'model-preset-create') {
      if (rest.length > 0) throw usageError('model-preset-create takes no positional arguments.');
      out.stdout(JSON.stringify(runModelPresetCreate(values, io), null, 2));
      return 0;
    }
    if (command === 'model-preset-apply') {
      if (rest.length !== 1) throw usageError('model-preset-apply needs exactly one bot id.');
      out.stdout(JSON.stringify(runModelPresetApply(rest[0]!, values, io), null, 2));
      return 0;
    }
    if (command === 'model-plan') {
      if (rest.length !== 1) throw usageError('model-plan needs exactly one bot id.');
      out.stdout(JSON.stringify(runModelPlan(rest[0]!, values, io), null, 2));
      return 0;
    }
    if (command === 'channel-human-name-set') {
      if (rest.length !== 1)
        throw usageError('channel-human-name-set needs exactly one channel id.');
      out.stdout(JSON.stringify(runChannelHumanNameSet(rest[0]!, values, io), null, 2));
      return 0;
    }
    if (command === 'channels') {
      if (rest.length > 0) throw usageError('channels takes no bot id.');
      out.stdout(JSON.stringify(runChannels(values, io), null, 2));
      return 0;
    }
    if (command === 'channel-messages') {
      if (rest.length !== 1) throw usageError('channel-messages needs exactly one channel id.');
      out.stdout(JSON.stringify(runChannelMessages(rest[0]!, values, io), null, 2));
      return 0;
    }
    if (command === 'grants') {
      if (rest.length !== 1) throw usageError('grants needs exactly one bot id.');
      out.stdout(JSON.stringify(runGrants(rest[0]!, values, io), null, 2));
      return 0;
    }
    if (command === 'grant-revoke') {
      if (rest.length !== 1) throw usageError('grant-revoke needs exactly one bot id.');
      out.stdout(JSON.stringify(runGrantRevoke(rest[0]!, values, io), null, 2));
      return 0;
    }
    if (command === 'grant-write-set') {
      if (rest.length !== 1) throw usageError('grant-write-set needs exactly one bot id.');
      out.stdout(JSON.stringify(runGrantWriteSet(rest[0]!, values, io), null, 2));
      return 0;
    }
    if (command === 'schedules') {
      if (rest.length !== 1) throw usageError('schedules needs exactly one bot id.');
      out.stdout(JSON.stringify(runSchedules(rest[0]!, values, io), null, 2));
      return 0;
    }
    if (command === 'schedule-create') {
      if (rest.length !== 1) throw usageError('schedule-create needs exactly one bot id.');
      out.stdout(JSON.stringify(runScheduleCreate(rest[0]!, values, io), null, 2));
      return 0;
    }
    if (command === 'schedule-update') {
      if (rest.length !== 1) throw usageError('schedule-update needs exactly one bot id.');
      out.stdout(JSON.stringify(runScheduleUpdate(rest[0]!, values, io), null, 2));
      return 0;
    }
    if (command === 'schedule-delete') {
      if (rest.length !== 1) throw usageError('schedule-delete needs exactly one bot id.');
      out.stdout(JSON.stringify(runScheduleDelete(rest[0]!, values, io), null, 2));
      return 0;
    }
    if (command === 'schedule-history') {
      if (rest.length !== 1) throw usageError('schedule-history needs exactly one bot id.');
      out.stdout(JSON.stringify(runScheduleHistory(rest[0]!, values, io), null, 2));
      return 0;
    }
    if (command === 'schedule-run-now') {
      if (rest.length !== 1) throw usageError('schedule-run-now needs exactly one bot id.');
      out.stdout(JSON.stringify(runScheduleRunNow(rest[0]!, values, io), null, 2));
      return 0;
    }
    if (command === 'schedule-preview') {
      if (rest.length > 0) throw usageError('schedule-preview takes no bot id.');
      out.stdout(JSON.stringify(runSchedulePreview(values), null, 2));
      return 0;
    }
    if (command === 'pairings') {
      if (rest.length !== 1) throw usageError('pairings needs exactly one bot id.');
      out.stdout(JSON.stringify(runPairings(rest[0]!, values, io), null, 2));
      return 0;
    }
    if (command === 'secret-put') {
      if (rest.length > 1)
        throw new CliFailure(
          'secret-in-argv',
          'secret-put values must arrive on stdin, never in arguments.',
          2,
        );
      if (rest.length !== 1) throw usageError('secret-put needs exactly one secret name.');
      out.stdout(JSON.stringify(await runSecretPut(rest[0]!, values, io, readStdin), null, 2));
      return 0;
    }
    if (command === 'secret-list') {
      if (rest.length > 0) throw usageError('secret-list takes no secret name.');
      out.stdout(JSON.stringify(runSecretList(values, io), null, 2));
      return 0;
    }
    if (command === 'secret-unset') {
      if (rest.length !== 1) throw usageError('secret-unset needs exactly one secret name.');
      out.stdout(JSON.stringify(runSecretUnset(rest[0]!, values, io), null, 2));
      return 0;
    }
    if (command === 'search') {
      out.stdout(JSON.stringify(runSearch(rest), null, 2));
      return 0;
    }
    if (command === 'pause' || command === 'resume') {
      if (rest.length !== 1) throw usageError('pause and resume need exactly one bot id.');
      out.stdout(JSON.stringify(runPause(rest[0]!, command === 'pause', values, io), null, 2));
      return 0;
    }
    if (command === 'update') {
      if (rest.length !== 1) throw usageError('update needs exactly one bot id.');
      out.stdout(JSON.stringify(runUpdate(rest[0]!, values, io), null, 2));
      return 0;
    }
    if (command === 'human-name-set') {
      if (rest.length > 0) throw usageError('human-name-set takes no positional arguments.');
      out.stdout(JSON.stringify(runHumanNameSet(values, io), null, 2));
      return 0;
    }
    if (command === 'memory-snapshot') {
      if (rest.length !== 1) throw usageError('memory-snapshot needs exactly one bot id.');
      out.stdout(JSON.stringify(runMemorySnapshot(rest[0]!, values, io), null, 2));
      return 0;
    }
    if (command === 'memory-file') {
      if (rest.length !== 1) throw usageError('memory-file needs exactly one bot id.');
      out.stdout(JSON.stringify(runMemoryFile(rest[0]!, values, io), null, 2));
      return 0;
    }
    if (command === 'memory-history') {
      if (rest.length !== 1) throw usageError('memory-history needs exactly one bot id.');
      out.stdout(JSON.stringify(runMemoryHistory(rest[0]!, values, io), null, 2));
      return 0;
    }
    if (command === 'memory-diff') {
      if (rest.length !== 1) throw usageError('memory-diff needs exactly one bot id.');
      out.stdout(JSON.stringify(runMemoryDiff(rest[0]!, values, io), null, 2));
      return 0;
    }
    if (command === 'memory-save') {
      if (rest.length !== 1) throw usageError('memory-save needs exactly one bot id.');
      out.stdout(JSON.stringify(await runMemorySave(rest[0]!, values, io, readStdin), null, 2));
      return 0;
    }
    if (command !== 'create') throw usageError('Unknown command.');
    if (rest.length > 0) throw usageError('create takes no positional arguments.');
    const startedAt = performance.now();
    const result = await runCreate(values, io, readStdin);
    out.stdout(JSON.stringify(result, null, 2));
    io.stderr(
      `deepseekbot: created ${result.bot.id} ("${result.bot.name}") in ${Math.round(performance.now() - startedAt)}ms`,
    );
    return 0;
  } catch (error) {
    if (error instanceof CliLiveError) {
      out.stdout(
        JSON.stringify(
          {
            error: { code: error.code, message: error.message },
            ...(error.receipt === undefined ? {} : { receipt: error.receipt }),
            ...(error.authorization === undefined ? {} : { authorization: error.authorization }),
            ...(error.creation === undefined ? {} : error.creation),
          },
          null,
          2,
        ),
      );
      io.stderr(`deepseekbot: ${error.message}`);
      return error.code === 'usage' ? 2 : 1;
    }
    if (error instanceof CliFailure) {
      const failure: BotCreateFailure = {
        error: { code: error.code, message: error.message },
        ...(error.steps.length === 0 ? {} : { steps: error.steps }),
        ...(error.bot === undefined ? {} : { bot: error.bot }),
      };
      out.stdout(JSON.stringify(failure, null, 2));
      io.stderr(`deepseekbot: ${error.message}`);
      return error.exitCode;
    }
    if (
      error instanceof TypeError &&
      'code' in error &&
      String(error.code).startsWith('ERR_PARSE_ARGS')
    ) {
      const failure: BotCreateFailure = {
        error: {
          code: 'usage',
          message: `${error.message} Run deepseekbot create --help for usage.`,
        },
      };
      out.stdout(JSON.stringify(failure, null, 2));
      io.stderr(`deepseekbot: ${error.message}`);
      return 2;
    }
    if (error instanceof OperationalDatabaseError) {
      const failure: BotCreateFailure = {
        error: { code: error.code, message: error.message },
      };
      out.stdout(JSON.stringify(failure, null, 2));
      io.stderr(`deepseekbot: ${error.message}`);
      return 1;
    }
    const failure: BotCreateFailure = {
      error: { code: 'internal-error', message: 'The command failed before producing a result.' },
    };
    out.stdout(JSON.stringify(failure, null, 2));
    io.stderr(`deepseekbot: ${error instanceof Error ? error.message : String(error)}`);
    return 1;
  }
}
