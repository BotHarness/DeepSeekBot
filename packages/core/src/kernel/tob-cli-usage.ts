export const TOB_AGENT_BOT_COMMAND_USAGE: Readonly<Record<string, string>> = {
  create:
    'deepseekbot create --name <name> --operation-key <stable-key> [--description <bio>] [--role <tag>] [--avatar-file <image>] [--persona <text> | --persona-stdin] [--core-memory <text> | --core-memory-stdin]',
  show: 'deepseekbot show <bot-slug>; returns profileFingerprint for subsequent writes',
  update:
    'deepseekbot update <bot-slug> --expected-profile <observed-fingerprint> [--name <name>] [--description <bio>] [--role <tag>]',
  pause: 'deepseekbot pause <bot-slug> --expected-profile <observed-fingerprint>',
  resume: 'deepseekbot resume <bot-slug> --expected-profile <observed-fingerprint>',
  'bot-avatar-set':
    'deepseekbot bot-avatar-set <bot-slug> --expected-profile <observed-fingerprint> (--file <image> | --clear)',
  'bot-banner-set':
    'deepseekbot bot-banner-set <bot-slug> --expected-profile <observed-fingerprint> (--file <image> | --recipe-stdin | --clear)',
  'bot-appearance-set':
    'deepseekbot bot-appearance-set <bot-slug> --expected-profile <observed-fingerprint> --recipe-stdin',
  'bot-primary-color-set':
    'deepseekbot bot-primary-color-set <bot-slug> --expected-profile <observed-fingerprint> (--color <#rrggbb> | --automatic)',
  'bot-delete-preview': 'deepseekbot bot-delete-preview <bot-slug>',
  'bot-delete-memory-folder': 'deepseekbot bot-delete-memory-folder <bot-slug>',
  'bot-delete-confirm':
    'deepseekbot bot-delete-confirm <bot-slug> --confirmation-stdin --confirm [--erase-memory]; stdin JSON: {token}; memory is retained unless --erase-memory is explicit',
  'bot-delete-retry': 'deepseekbot bot-delete-retry <bot-slug> --confirm',
};

export const TOB_AGENT_CHANNEL_COMMAND_USAGE: Readonly<Record<string, string>> = {
  channels:
    'deepseekbot channels [--limit <1..100>] [--cursor <last-channel-id>]; bounded Channel metadata, not messages',
  channel:
    'deepseekbot channel <group-channel-id>; returns channelFingerprint for reviewed Group changes',
  'channel-rename':
    'deepseekbot channel-rename <group-channel-id> --name <name> --expected-channel <observed-fingerprint>',
  'group-avatar-set':
    'deepseekbot group-avatar-set <group-channel-id> (--avatar-file <PNG/JPEG/WebP-path> | --clear) --expected-channel <observed-fingerprint>',
  'group-wake-policies': 'deepseekbot group-wake-policies <group-channel-id>',
  'group-wake-set':
    'deepseekbot group-wake-set <group-channel-id> --bot <bot-slug> (--mode <all|mentions|digest|silent> | --inherit) [--count <1..100>] [--interval <1..3600>] --expected-channel <observed-fingerprint>',
  'group-member-remove':
    'deepseekbot group-member-remove <group-channel-id> --bot <bot-slug> --expected-channel <observed-fingerprint>',
  'group-create':
    'deepseekbot group-create <name> --operation-key <stable-key> [--member <bot-slug> ...]; explicit initial members join directly, matching Human group creation',
  'group-invite-cancel':
    'deepseekbot group-invite-cancel <group-channel-id> --invitation <invitation-id> --expected-channel <observed-fingerprint>; cancel a pending invitation only',
  'group-join-decide':
    'deepseekbot group-join-decide <group-channel-id> --request <join-request-id> (--accept | --decline) --expected-channel <observed-fingerprint>; decide one pending join request',
  'group-invite':
    'deepseekbot group-invite <channel-id> --bot <bot-slug> --operation-key <stable-key> --expected-channel <observed-fingerprint>; preserves the existing invitation acceptance policy',
};

export const TOB_SHARE_DRAFT_COMMAND_USAGE: Readonly<Record<string, string>> = {
  'share-draft-show': 'deepseekbot share-draft-show <bot-slug>',
  'share-draft-file': 'deepseekbot share-draft-file <bot-slug> --path <file path>',
  'share-draft-decide':
    'deepseekbot share-draft-decide <bot-slug> --path <file path> (--keep | --drop | --rewrite-stdin)',
  'share-draft-finish': 'deepseekbot share-draft-finish <bot-slug>',
};

export const TOB_DIAGNOSTIC_COMMAND_USAGE: Readonly<Record<string, string>> = {
  doctor: 'deepseekbot doctor',
  'diagnostic-logs':
    'deepseekbot diagnostic-logs [--kind all|error|perf|action] [--since <epoch ms>] [--limit 1-1000]',
};

export const TOB_AGENT_VOICE_COMMAND_USAGE: Readonly<Record<string, string>> = {
  'voice-providers': 'deepseekbot voice-providers [--bot <bot-slug>]',
  'voice-provider-add':
    'deepseekbot voice-provider-add <local|custom> [--kind asr] [--name <name>] [--base-url <url>] [--model <model>] [--voice <voice-id> | --language <code>]; keyed presets are added by the Human in Settings',
  'voice-provider-test': 'deepseekbot voice-provider-test <provider-id> [--voice <voice-id>]',
  'voice-provider-remove': 'deepseekbot voice-provider-remove <provider-id>',
  'voice-set': 'deepseekbot voice-set <bot-slug> (<provider-id> [--voice <voice-id>] | off)',
  'voice-asr-set':
    'deepseekbot voice-asr-set <bot-slug> (<asr-provider-id> [--language <code>] | off)',
};

export const TOB_MEMORY_LEASE_COMMAND_USAGE: Readonly<Record<string, string>> = {
  'assignment-memory-lease':
    'deepseekbot assignment-memory-lease <assignment-session-id> <bot-id> [<bot-id>...] --operation-key <stable key for this request>; the Assignment then reads with deepseekbot memory-snapshot|memory-file|memory-history|memory-diff <bot-id>',
  'assignment-memory-leases': 'deepseekbot assignment-memory-leases [<assignment-session-id>]',
  'assignment-memory-revoke': 'deepseekbot assignment-memory-revoke <lease-id> [--reason <text>]',
  'memory-snapshot': 'deepseekbot memory-snapshot <bot-id>',
  'memory-file': 'deepseekbot memory-file <bot-id> --path <file>',
  'memory-history': 'deepseekbot memory-history <bot-id> [--limit <1-50>]',
  'memory-diff': 'deepseekbot memory-diff <bot-id> --sha <commit>',
};

export const TOB_AGENT_MEMORY_COMMAND_USAGE: Readonly<Record<string, string>> = {
  'memory-save':
    'deepseekbot memory-save <bot-id> --path <file> (--body <text> | --body-stdin) --expected-head <observed Memory head sha> [--edit-id <id>]; read the file and head first with memory-file; repeat the same --edit-id and body to read back an uncertain save',
  'memory-restore-commit':
    'deepseekbot memory-restore-commit <bot-id> --sha <commit> --expected-head <observed Memory head sha> [--restore-id <uuid>] [--name <version name for the current state>]; repeat the same --restore-id to read back an uncertain restore',
};

export const TOB_AGENT_COMMAND_USAGE: Readonly<Record<string, string>> = {
  ...TOB_AGENT_BOT_COMMAND_USAGE,
  ...TOB_AGENT_CHANNEL_COMMAND_USAGE,
  ...TOB_SHARE_DRAFT_COMMAND_USAGE,
  ...TOB_DIAGNOSTIC_COMMAND_USAGE,
  ...TOB_AGENT_VOICE_COMMAND_USAGE,
  ...TOB_MEMORY_LEASE_COMMAND_USAGE,
  ...TOB_AGENT_MEMORY_COMMAND_USAGE,
  list: 'deepseekbot list',
  'model-catalog': 'deepseekbot model-catalog',
  'model-plan': 'deepseekbot model-plan <bot-slug>',
  'model-presets': 'deepseekbot model-presets',
  'home-model-set':
    'deepseekbot home-model-set --provider <provider> --model <model> [--orchestrator-effort <effort>] --expected-revision <observed-Host-default-revision>',
  'model-plan-customize':
    'deepseekbot model-plan-customize <bot-slug> --orchestrator-provider <provider> --orchestrator-model <model> [--orchestrator-effort <effort>] --expected-revision <observed-Bot-plan-revision>; or --orchestrator-group <routing-group-id> [--orchestrator-effort <effort shared by its reasoning members>]',
  'model-plan-set':
    'deepseekbot model-plan-set <bot-slug> --expected-revision <observed-Bot-plan-revision> [--assignment-models open|listed] --plan-stdin; stdin JSON: {orchestrator:{provider,model,reasoningEffort?},assignmentDefault:{provider,model,reasoningEffort?},assignmentModels:[{provider,model,allowedEfforts:string[],defaultEffort,note?}]}',
  'model-plan-assignments-set':
    'deepseekbot model-plan-assignments-set <bot-slug> --expected-revision <observed-Bot-plan-revision> [--assignment-models open|listed] --plan-stdin; stdin JSON: {assignmentDefault:{provider,model,reasoningEffort?},assignmentModels:[{provider,model,allowedEfforts:string[],defaultEffort,note?}],assignmentGroups?:string[],assignmentDefaultGroupId?,assignmentGroupOptions?:[{group,allowedEfforts?:string[] (levels every reasoning member shares),defaultEffort?,note?}]}',
  'model-plan-inherit':
    'deepseekbot model-plan-inherit <bot-slug> --expected-revision <observed-Bot-plan-revision>',
  'model-preset-create':
    'deepseekbot model-preset-create --name <name> --orchestrator-provider <provider> --orchestrator-model <model> [--orchestrator-effort <effort>] --assignment-provider <provider> --assignment-model <model> [--assignment-effort <effort>] [--assignment-models open|listed] [--orchestrator-group <routing-group-id> instead of --orchestrator-provider/--orchestrator-model; --orchestrator-effort then sets the group effort] [--assignment-groups <id,id>] [--assignment-default-group <id>] [--plan-stdin]; optional stdin JSON: {assignmentModels?:[{provider,model,allowedEfforts:string[],defaultEffort,note?}],assignmentGroupOptions?:[{group,allowedEfforts?:string[] (levels every reasoning member shares),defaultEffort?,note?}]}',
  'model-preset-update':
    'deepseekbot model-preset-update <preset-id> --name <name> --orchestrator-provider <provider> --orchestrator-model <model> [--orchestrator-effort <effort>] --assignment-provider <provider> --assignment-model <model> [--assignment-effort <effort>] [--assignment-models open|listed] [--orchestrator-group <routing-group-id> (empty clears; --orchestrator-effort then sets the group effort)] [--assignment-groups <id,id> (empty clears)] [--assignment-default-group <id> (empty clears)] --expected-revision <observed-preset-revision> [--plan-stdin]; optional stdin JSON: {assignmentModels?:[{provider,model,allowedEfforts:string[],defaultEffort,note?}],assignmentGroupOptions?:[{group,allowedEfforts?:string[] (levels every reasoning member shares),defaultEffort?,note?}]}',
  'model-preset-apply':
    'deepseekbot model-preset-apply <bot-slug> --preset <preset-id> --expected-revision <observed-Bot-plan-revision> --preset-revision <observed-preset-revision>',
  'telemetry-status': 'deepseekbot telemetry-status',
  'telemetry-set': 'deepseekbot telemetry-set (--enabled | --disabled)',
  'git-status': 'deepseekbot git-status',
  'git-install': 'deepseekbot git-install',
  'release-info': 'deepseekbot release-info [--since <version>]',
  'release-check': 'deepseekbot release-check',
  'release-install': 'deepseekbot release-install <version> --confirm',
  'release-restart': 'deepseekbot release-restart --confirm',
};
