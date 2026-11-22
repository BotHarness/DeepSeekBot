import {
  asNonBlank,
  asObject,
  asSlug,
  invalidInput,
  unavailable,
  unknownBot,
  type BridgeResult,
} from '../../bridge/method-utils.js';
import { ApprovalTemplateDeletion } from '../../workspaces/approval-template-deletion.js';
import type { ApprovalTemplateDeletionPreview } from '../../workspaces/approval-template-deletion-contract.js';
import type { ApprovalCard } from '../../team/approval-contract.js';
import { ownsBot } from '../../team/bot-access.js';
import { type HumanContext } from '../../humans/context.js';
import type { OutboundMessaging } from '../../messaging/outbound.js';
import { z } from 'zod';
import type { PersonaBotRecord } from '../../bots/persona-bot.js';
import { isModelRoute, type ModelRoute } from '../../models/presets.js';
import { readToolApprovalState } from '../../workspaces/tool-approval-state.js';
import type { ChannelUserQuestions } from '../../channels/user-questions.js';
import type { AskUserQuestionAnswer } from '@deepseek-ai/dsh-user-questions/types';
import type {
  ToolApprovalRuleStore,
  ToolApprovalRule,
} from '../../workspaces/tool-approval-rules.js';
import type {
  ToolApprovalHistoryEntry,
  ToolApprovalHistoryPosition,
} from '../../channels/approval-history.js';
import {
  INHERIT_APPROVAL_TEMPLATE,
  createApprovalTemplateLibrary,
  type ApprovalTemplate,
  type ApprovalTemplateDefault,
  type ApprovalTemplateLibrary,
  type ApprovalTemplateWriteResult,
} from '../../workspaces/approval-templates.js';
import type { ApprovalReviewerSettings } from '../../workspaces/approval-reviewer-settings.js';
import type { BridgeMethodsDeps, PersonaBotDetail } from '../../bridge/methods.js';

export interface ApprovalsBridgeDeps {
  approvalReviewer?: ApprovalReviewerSettings;
  approvalTemplates?: ApprovalTemplateLibrary;
  userQuestions?: ChannelUserQuestions;
  toolRules?: ToolApprovalRuleStore;
}

export interface ApprovalsBridgeMethods {
  approvalRoute(payload: unknown): Promise<BridgeResult<{ updated: true }>>;
  approvalTest(payload: unknown): Promise<
    BridgeResult<{
      delivery: import('../../messaging/approval-messaging.js').ApprovalDelivery;
    }>
  >;
  questionRetry(payload: unknown): Promise<BridgeResult<{ updated: true }>>;
  approvalRetry(payload: unknown): Promise<
    BridgeResult<{
      delivery: import('../../messaging/approval-messaging.js').ApprovalDelivery;
    }>
  >;
  approvalTemplates(payload?: unknown): BridgeResult<{
    templates: ApprovalTemplateEntry[];
    selected?: string | null;
    globalDefault?: string | null;
    effective?: string | null;
    source?: 'global' | 'specific' | 'off';
  }>;
  approvalTemplateCreate(payload: unknown): BridgeResult<{ template: ApprovalTemplateEntry }>;
  approvalTemplateUpdate(payload: unknown): BridgeResult<{ template: ApprovalTemplateEntry }>;
  approvalTemplateDeletePreview(
    payload: unknown,
  ): BridgeResult<{ preview: ApprovalTemplateDeletionPreview }>;
  approvalTemplateDelete(payload: unknown): BridgeResult<{
    template: { name: string };
    clearedBots: string[];
    inheritedBots: string[];
    globalDefault: string | null;
  }>;
  approvalTemplateGlobalSet(payload: unknown): BridgeResult<{ template: string | null }>;
  botApprovalTemplateSet(payload: unknown): BridgeResult<{ bot: PersonaBotDetail }>;
  approvalReviewerModel(payload?: unknown): Promise<BridgeResult<ApprovalReviewerModelView>>;
  approvalReviewerModelSet(payload: unknown): Promise<BridgeResult<ApprovalReviewerModelView>>;
  toolApprovalRules(payload: unknown): BridgeResult<{ rules: ToolApprovalRule[] }>;
  toolApprovalRuleRevoke(payload: unknown): BridgeResult<{ rule: ToolApprovalRule }>;
  toolApprovalHistory(
    payload: unknown,
  ): BridgeResult<{ entries: ToolApprovalHistoryEntry[]; nextCursor?: string }>;
  toolApprovalStatus(payload: unknown): BridgeResult<{
    approval?: ApprovalCard;
    status: 'pending' | 'expired' | 'stopped';
    expiresAt?: string;
    execution?: 'waiting-human' | 'waiting-capacity' | 'running' | 'settled' | 'needs-repair';
  }>;
  toolApprovalDecide(payload: unknown): Promise<BridgeResult<{ accepted: boolean }>>;
  toolAutoRejectionOverride(
    payload: unknown,
  ): Promise<BridgeResult<{ accepted: true; channelId: string; messageId: string }>>;
  userQuestionStatus(payload: unknown): BridgeResult<{
    status: 'pending' | 'submitted' | 'answered' | 'expired';
    approval?: ApprovalCard;
  }>;
  userQuestionAnswer(payload: unknown): Promise<BridgeResult<{ accepted: boolean }>>;
}

export type ApprovalTemplateEntry = ApprovalTemplate & { usedBy: string[] };

export interface ApprovalReviewerModelView {
  follows: 'bot' | 'model' | 'invalid';
  model: ModelRoute | null;
  available?: boolean;
  unavailableReason?: string;
}

function templateDeletionFailure(
  name: string,
  reason: Extract<ReturnType<ApprovalTemplateDeletion['preview']>, { ok: false }>['reason'],
): BridgeResult<never> {
  if (reason === 'invalid-name' || reason === 'not-found' || reason === 'built-in')
    return templateWriteFailure(name, reason);
  const errors = {
    'selection-unavailable': [
      'approval-selection-unavailable',
      'Approval template selection could not be read.',
    ],
    'confirmation-required': [
      'confirmation-required',
      'Preview the deletion and confirm its revision before deleting.',
    ],
    changed: [
      'approval-template-delete-changed',
      'Template references or selection changed. Preview the deletion again.',
    ],
    unavailable: [
      'approval-template-delete-unavailable',
      'The template could not be deleted. Reload its current references.',
    ],
    'rollback-failed': [
      'approval-template-delete-incomplete',
      'Deletion did not complete. Reload the current template choices.',
    ],
  } as const;
  const [code, message] = errors[reason];
  return { ok: false, error: { code, message } };
}

function templateWriteFailure(
  name: string,
  reason: Extract<ApprovalTemplateWriteResult, { ok: false }>['reason'],
): BridgeResult<never> {
  const messages = {
    'invalid-name':
      'A template name uses lowercase letters, digits and dashes (at most 64), like my-rules',
    'invalid-text': 'Template text must be non-empty Markdown of at most 32 KiB',
    exists: `An Approval Template named ${name} already exists`,
    'not-found': `The Host has no Approval Template named ${name}`,
    'built-in': `${name} is a built-in Approval Template and is read-only; copy it under a new name`,
    unavailable: 'Approval Templates cannot be written on this Host',
  } as const;
  const codes = {
    'invalid-name': 'invalid-input',
    'invalid-text': 'invalid-input',
    exists: 'template-exists',
    'not-found': 'unknown-template',
    'built-in': 'template-read-only',
    unavailable: 'unavailable',
  } as const;
  return {
    ok: false,
    error: { code: codes[reason], message: messages[reason] },
  };
}

function historyPosition(cursor: string): ToolApprovalHistoryPosition | undefined {
  if (cursor.length === 0 || cursor.length > 512) return undefined;
  try {
    const decoded: unknown = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
    if (typeof decoded !== 'object' || decoded === null) return undefined;
    const { at, id } = decoded as { at?: unknown; id?: unknown };
    return typeof at === 'string' && typeof id === 'string'
      ? { decidedAt: at, decisionMessageId: id }
      : undefined;
  } catch {
    return undefined;
  }
}

export function createApprovalsBridgeMethods(
  human: HumanContext,
  deps: ApprovalsBridgeDeps &
    Pick<
      BridgeMethodsDeps,
      | 'channels'
      | 'externalMessaging'
      | 'humanAttention'
      | 'idleCompaction'
      | 'modelCatalog'
      | 'registry'
      | 'runtime'
      | 'toolApproval'
    >,
  globalRegistry: BridgeMethodsDeps['registry'],
  detailOf: (record: PersonaBotRecord) => { bot: PersonaBotDetail },
  messagingCall: <T>(
    operation: (service: OutboundMessaging) => Promise<T>,
  ) => Promise<BridgeResult<T>>,
): ApprovalsBridgeMethods {
  const approvalTemplateLibrary = deps.approvalTemplates ?? createApprovalTemplateLibrary();
  const templateDeletion = new ApprovalTemplateDeletion(
    approvalTemplateLibrary,
    globalRegistry,
    (bot) => ownsBot(human, bot),
  );
  const templateUsers = (name: string, registry = deps.registry): string[] =>
    registry
      .list()
      .filter((record) => record.approvalTemplate === name)
      .map((record) => record.slug);
  const templateEntry = (
    template: ApprovalTemplate,
    global: ApprovalTemplateDefault,
  ): ApprovalTemplateEntry => {
    return {
      ...template,
      usedBy: [
        ...templateUsers(template.name),
        ...(global.kind === 'selected' && global.name === template.name
          ? deps.registry
              .list()
              .filter((record) => record.approvalTemplate === INHERIT_APPROVAL_TEMPLATE)
              .map((record) => record.slug)
          : []),
      ],
    };
  };
  const reviewerModelView = async (
    route: ModelRoute | undefined,
  ): Promise<ApprovalReviewerModelView> => {
    if (route === undefined) return { follows: 'bot', model: null };
    if (deps.modelCatalog === undefined) return { follows: 'model', model: route };
    try {
      await deps.modelCatalog.validate(route);
      return { follows: 'model', model: route, available: true };
    } catch (error) {
      return {
        follows: 'model',
        model: route,
        available: false,
        unavailableReason: error instanceof Error ? error.message : String(error),
      };
    }
  };
  const askingBot = (channelId: string, messageId: string): string | undefined => {
    const channel = deps.channels.get(channelId);
    if (channel === undefined) return undefined;
    if (channel.type === 'dm' && !channel.humanParticipants) return channel.botSlug;
    const author = deps.channels.message(channelId, messageId)?.author;
    return author?.kind === 'bot' &&
      (channel.humanParticipants !== undefined || channel.members.includes(author.slug))
      ? author.slug
      : undefined;
  };
  return {
    approvalRoute(payload) {
      const input = z
        .object({
          slug: z.string().min(1),
          pairingId: z.string().uuid().nullable(),
          expectedRevision: z.number().int().nonnegative(),
        })
        .strict()
        .safeParse(payload);
      if (!input.success) return Promise.resolve(invalidInput('Invalid approval destination'));
      return messagingCall(async (service) => {
        await service.approvals.setRoute(
          input.data.slug,
          input.data.pairingId ?? undefined,
          input.data.expectedRevision,
        );
        return { updated: true as const };
      });
    },
    approvalTest(payload) {
      const input = z
        .object({ slug: z.string().min(1) })
        .strict()
        .safeParse(payload);
      if (!input.success) return Promise.resolve(invalidInput('Invalid Bot'));
      return messagingCall(async (service) => ({
        delivery: await service.approvals.test(input.data.slug),
      }));
    },
    questionRetry(payload) {
      const input = z
        .object({ slug: z.string().min(1), id: z.string().uuid() })
        .strict()
        .safeParse(payload);
      if (!input.success) return Promise.resolve(invalidInput('Invalid question notification'));
      return messagingCall(async (service) => {
        await service.questions.retry(input.data.slug, input.data.id);
        return { updated: true as const };
      });
    },
    approvalRetry(payload) {
      const input = z
        .object({ slug: z.string().min(1), id: z.string().uuid() })
        .strict()
        .safeParse(payload);
      if (!input.success) return Promise.resolve(invalidInput('Invalid notification'));
      return messagingCall(async (service) => ({
        delivery: await service.approvals.retry(input.data.slug, input.data.id),
      }));
    },
    approvalTemplates(payload) {
      const global = approvalTemplateLibrary.global();
      if (global.kind === 'invalid')
        return {
          ok: false,
          error: {
            code: 'approval-selection-unavailable',
            message: 'Approval template selection could not be read.',
          },
        };
      const templates = approvalTemplateLibrary
        .list()
        .map((template) => templateEntry(template, global));
      const globalDefault = global.kind === 'selected' ? global.name : null;
      if (asObject(payload)['slug'] === undefined)
        return { ok: true, value: { templates, globalDefault } };
      const slug = asSlug(payload);
      if (slug === undefined) return invalidInput('slug must be a Bot id');
      const record = deps.registry.get(slug);
      if (record === undefined) return unknownBot(slug);
      return {
        ok: true,
        value: {
          templates,
          globalDefault,
          selected: record.approvalTemplate ?? null,
          effective:
            record.approvalTemplate === INHERIT_APPROVAL_TEMPLATE
              ? globalDefault
              : (record.approvalTemplate ?? null),
          source:
            record.approvalTemplate === INHERIT_APPROVAL_TEMPLATE
              ? 'global'
              : record.approvalTemplate === undefined
                ? 'off'
                : 'specific',
        },
      };
    },
    approvalTemplateCreate(payload) {
      const object = asObject(payload);
      const name = object['name'];
      const from = object['from'];
      let text = object['text'];
      if (typeof name !== 'string') return invalidInput('name is required');
      if (from !== undefined) {
        if (typeof from !== 'string' || text !== undefined)
          return invalidInput('from names one template to copy, in place of text');
        const source = approvalTemplateLibrary.get(from);
        if (source === undefined) return templateWriteFailure(from, 'not-found');
        text = source.text;
      }
      if (typeof text !== 'string') return invalidInput('text (Markdown) or from is required');
      const result = approvalTemplateLibrary.create(name, text);
      if (!result.ok) return templateWriteFailure(name, result.reason);
      return {
        ok: true,
        value: { template: templateEntry(result.template, approvalTemplateLibrary.global()) },
      };
    },
    approvalTemplateUpdate(payload) {
      const object = asObject(payload);
      const name = object['name'];
      const text = object['text'];
      if (typeof name !== 'string' || typeof text !== 'string')
        return invalidInput('name and text (Markdown) are required');
      const result = approvalTemplateLibrary.update(name, text);
      if (!result.ok) return templateWriteFailure(name, result.reason);
      return {
        ok: true,
        value: { template: templateEntry(result.template, approvalTemplateLibrary.global()) },
      };
    },
    approvalTemplateDeletePreview(payload) {
      const name = asObject(payload)['name'];
      if (typeof name !== 'string') return invalidInput('name is required');
      const result = templateDeletion.preview(name);
      return result.ok
        ? { ok: true, value: { preview: result.preview } }
        : templateDeletionFailure(name, result.reason);
    },
    approvalTemplateDelete(payload) {
      const object = asObject(payload);
      const name = object['name'];
      if (typeof name !== 'string') return invalidInput('name is required');
      const revision = object['revision'];
      const result = templateDeletion.delete(name, {
        confirmed: object['confirmed'] === true,
        ...(typeof revision === 'string' ? { revision } : {}),
      });
      if (!result.ok) return templateDeletionFailure(name, result.reason);
      const inheritedBots = result.preview.affectedBots
        .filter((bot) => bot.source === 'specific')
        .map((bot) => bot.slug);
      return {
        ok: true,
        value: {
          template: { name },
          clearedBots: inheritedBots,
          inheritedBots,
          globalDefault: result.preview.globalDefaultAfter,
        },
      };
    },
    approvalTemplateGlobalSet(payload) {
      const template = asObject(payload)['template'];
      if (template !== null && typeof template !== 'string')
        return invalidInput('template name or null required');
      if (typeof template === 'string' && approvalTemplateLibrary.get(template) === undefined)
        return invalidInput('unknown Approval Template ' + template);
      try {
        approvalTemplateLibrary.setGlobal(template);
      } catch {
        return {
          ok: false,
          error: {
            code: 'approval-selection-unavailable',
            message: 'Approval template selection could not be saved.',
          },
        };
      }
      return { ok: true, value: { template } };
    },
    botApprovalTemplateSet(payload) {
      const slug = asSlug(payload);
      const template = asObject(payload)['template'];
      if (slug === undefined || (template !== null && typeof template !== 'string'))
        return invalidInput('slug and template (a template name, or null for none) are required');
      if (
        typeof template === 'string' &&
        template !== INHERIT_APPROVAL_TEMPLATE &&
        approvalTemplateLibrary.get(template) === undefined
      )
        return invalidInput('unknown Approval Template ' + template);
      const result = deps.registry.setApprovalTemplate(slug, template ?? undefined);
      if (!result.ok) return unknownBot(slug);
      return { ok: true, value: detailOf(result.record) };
    },
    async approvalReviewerModel() {
      if (deps.approvalReviewer === undefined) return unavailable();
      const setting = deps.approvalReviewer.model();
      if (setting.kind === 'invalid')
        return {
          ok: true,
          value: {
            follows: 'invalid',
            model: null,
            available: false,
            unavailableReason: 'The reviewer model setting cannot be read.',
          },
        };
      return {
        ok: true,
        value: await reviewerModelView(setting.kind === 'bot' ? undefined : setting.route),
      };
    },
    async approvalReviewerModelSet(payload) {
      if (deps.approvalReviewer === undefined) return unavailable();
      const model = asObject(payload)['model'];
      if (model !== null && !isModelRoute(model))
        return invalidInput(
          'model must be {provider, model, reasoningEffort?}, or null to follow each Bot',
        );
      const route =
        model === null
          ? undefined
          : {
              provider: model.provider.trim(),
              model: model.model.trim(),
              ...(model.reasoningEffort === undefined
                ? {}
                : { reasoningEffort: model.reasoningEffort.trim() }),
            };
      try {
        deps.approvalReviewer.setModel(route);
      } catch (error) {
        return invalidInput(error instanceof Error ? error.message : String(error));
      }
      return { ok: true, value: await reviewerModelView(route) };
    },
    toolApprovalRules(payload) {
      const slug = asSlug(payload);
      if (slug === undefined) return invalidInput('slug is required');
      if (deps.registry.get(slug) === undefined) return unknownBot(slug);
      return { ok: true, value: { rules: deps.toolRules?.list(slug) ?? [] } };
    },
    toolApprovalRuleRevoke(payload) {
      const slug = asSlug(payload);
      const id = asNonBlank(asObject(payload), 'id');
      if (slug === undefined || id === undefined) return invalidInput('slug and id are required');
      if (deps.registry.get(slug) === undefined) return unknownBot(slug);
      const rule = deps.toolRules?.revoke(slug, id);
      if (rule) deps.externalMessaging?.approvals.refreshRules(slug);
      return rule === undefined
        ? invalidInput('Unknown tool approval rule')
        : { ok: true, value: { rule } };
    },
    toolApprovalHistory(payload) {
      const source = asObject(payload);
      const slug = asSlug(payload);
      const cursor = source['cursor'];
      const limit = source['limit'];
      if (slug === undefined) return invalidInput('slug is required');
      if (
        limit !== undefined &&
        (typeof limit !== 'number' || !Number.isSafeInteger(limit) || limit < 1 || limit > 100)
      )
        return invalidInput('limit must be an integer from 1 to 100');
      let after: ToolApprovalHistoryPosition | undefined;
      if (cursor !== undefined) {
        after = typeof cursor === 'string' ? historyPosition(cursor) : undefined;
        if (after === undefined)
          return invalidInput('cursor must be the nextCursor of the previous page');
      }
      if (deps.registry.get(slug) === undefined) return unknownBot(slug);
      if (deps.channels.toolApprovalHistory === undefined)
        return {
          ok: false,
          error: {
            code: 'storage-unavailable',
            message: 'approval history is unavailable',
          },
        };
      const size = limit ?? 30;
      const read = deps.channels.toolApprovalHistory(slug, {
        ...(after === undefined ? {} : { after }),
        limit: size + 1,
      });
      const entries = read.slice(0, size);
      const last = entries.at(-1);
      return {
        ok: true,
        value: {
          entries,
          ...(read.length > size && last !== undefined
            ? {
                nextCursor: Buffer.from(
                  JSON.stringify({
                    at: last.decidedAt,
                    id: last.decisionMessageId,
                  }),
                ).toString('base64url'),
              }
            : {}),
        },
      };
    },
    toolApprovalStatus(payload) {
      const source = asObject(payload);
      const channelId = asNonBlank(source, 'channelId');
      const messageId = asNonBlank(source, 'messageId');
      if (channelId === undefined || messageId === undefined) {
        return invalidInput('channelId and messageId are required');
      }
      const asker = askingBot(channelId, messageId);
      if (asker === undefined) {
        return invalidInput('Tool approval is available only in a PersonaBot DM or Group');
      }
      const request = deps.channels.message(channelId, messageId)?.toolApprovalRequest;
      if (request === undefined) {
        return invalidInput('Unknown tool approval request');
      }
      return {
        ok: true,
        value: readToolApprovalState(deps, { ...request, botSlug: asker, messageId }),
      };
    },
    async toolApprovalDecide(payload) {
      const source = asObject(payload);
      const channelId = asNonBlank(source, 'channelId');
      const messageId = asNonBlank(source, 'messageId');
      const outcome = source['outcome'];
      if (
        channelId === undefined ||
        messageId === undefined ||
        (outcome !== 'allowed-once' &&
          outcome !== 'allowed-always-tool' &&
          outcome !== 'allowed-always-exact' &&
          outcome !== 'allowed-always-all' &&
          outcome !== 'allowed-always-kind' &&
          outcome !== 'rejected')
      ) {
        return invalidInput('channelId, messageId, and a valid outcome are required');
      }
      const asker = askingBot(channelId, messageId);
      if (asker === undefined) {
        return invalidInput('Tool approval is available only in a PersonaBot DM or Group');
      }
      const channel = { botSlug: asker };
      const request = deps.channels.message(channelId, messageId)?.toolApprovalRequest;
      if (request === undefined) {
        return invalidInput('Unknown tool approval request');
      }
      if (outcome === 'allowed-always-tool' && request.allowAlways !== true)
        return invalidInput('Always allow is unavailable for this request');
      if (outcome === 'allowed-always-kind' && request.toolName !== 'secret_cli')
        return invalidInput('allowed-always-kind applies only to a secret_cli approval');
      const accepted = await deps.toolApproval?.decide(
        human,
        channel.botSlug,
        messageId,
        outcome === 'allowed-always-kind' ? 'allowed-always-exact' : outcome,
      );
      if (accepted !== true) return invalidInput('Tool approval request is no longer pending');
      return { ok: true, value: { accepted: true } };
    },
    async toolAutoRejectionOverride(payload) {
      const source = asObject(payload);
      const itemId = asNonBlank(source, 'itemId');
      if (itemId === undefined || itemId.length > 350 || !itemId.startsWith('autoreject:'))
        return invalidInput('itemId must name an auto-rejected Inbox item');
      let item;
      try {
        item = deps.humanAttention?.item(human, itemId);
      } catch (error) {
        return invalidInput(String(error));
      }
      if (
        item?.kind !== 'auto-rejection' ||
        item.channelId === undefined ||
        item.messageId === undefined
      )
        return {
          ok: false,
          error: {
            code: 'auto-rejection-unavailable',
            message: 'This auto-rejected call is no longer waiting for the Human',
          },
        };
      const channel = deps.channels.get(item.channelId);
      const bot = deps.registry.get(item.botSlug);
      if (
        channel === undefined ||
        bot === undefined ||
        bot.paused === true ||
        (channel.type === 'dm'
          ? channel.botSlug !== item.botSlug
          : !channel.members.includes(item.botSlug))
      )
        return invalidInput('The PersonaBot is no longer active in this Channel');
      const result = await deps.toolApproval?.overrideRejection(
        human,
        item.channelId,
        item.messageId,
      );
      if (result === undefined || !result.ok)
        return {
          ok: false,
          error: {
            code: 'auto-rejection-unavailable',
            message: 'This auto-rejected call is no longer waiting for the Human',
          },
        };
      try {
        if (channel.type === 'group')
          deps.runtime?.admitGroupMessage(item.channelId, result.message.id);
        else
          deps.runtime?.admitDmMessage(human, {
            channelId: item.channelId,
            messageId: result.message.id,
            body: result.message.body,
          });
      } catch {}
      return {
        ok: true,
        value: {
          accepted: true,
          channelId: item.channelId,
          messageId: result.message.id,
        },
      };
    },
    userQuestionStatus(payload) {
      const source = asObject(payload);
      const channelId = asNonBlank(source, 'channelId');
      const messageId = asNonBlank(source, 'messageId');
      if (channelId === undefined || messageId === undefined)
        return invalidInput('channelId and messageId are required');
      const asker = askingBot(channelId, messageId);
      if (asker === undefined)
        return invalidInput('Questions are available only in a PersonaBot DM or Group');
      const channel = { botSlug: asker };
      if (deps.channels.message(channelId, messageId)?.userQuestionRequest === undefined)
        return invalidInput('Unknown user question');
      return {
        ok: true,
        value: {
          status: deps.userQuestions?.status(channel.botSlug, messageId, channelId) ?? 'expired',
        },
      };
    },
    async userQuestionAnswer(payload) {
      const source = asObject(payload);
      const channelId = asNonBlank(source, 'channelId');
      const messageId = asNonBlank(source, 'messageId');
      const answer = asObject(source['answer']);
      if (channelId === undefined || messageId === undefined || !Array.isArray(answer['answers']))
        return invalidInput('channelId, messageId, and answers are required');
      const asker = askingBot(channelId, messageId);
      if (asker === undefined)
        return invalidInput('Questions are available only in a PersonaBot DM or Group');
      const channel = { botSlug: asker };
      if (deps.channels.message(channelId, messageId)?.userQuestionRequest === undefined)
        return invalidInput('Unknown user question');
      const accepted = await deps.userQuestions?.answer(
        channel.botSlug,
        messageId,
        answer as unknown as AskUserQuestionAnswer,
        human,
      );
      if (accepted !== true)
        return invalidInput('Question is no longer pending or answer is invalid');
      return { ok: true, value: { accepted: true } };
    },
  };
}
