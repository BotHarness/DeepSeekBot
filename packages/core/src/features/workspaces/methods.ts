import {
  asNonBlank,
  asObject,
  asSlug,
  invalidInput,
  unavailable,
  unknownBot,
  type BridgeResult,
} from '../../bridge/method-utils.js';
import { type HumanContext } from '../../humans/context.js';
import {
  approveGrantRequest,
  type GrantRequestApprovalResult,
} from '../../workspaces/grant-requests.js';
import { z } from 'zod';
import {
  WorkspaceGrantError,
  type WorkspaceGrant,
  type WorkspaceGrantStore,
} from '../../workspaces/grants.js';
import type { BridgeMethodsDeps } from '../../bridge/methods.js';
import { join } from 'node:path';
import { FolderBrowseError, type FolderListing } from '../../workspaces/folder-browse.js';

export interface WorkspacesBridgeDeps {
  grants?: WorkspaceGrantStore;
}

export interface WorkspacesBridgeMethods {
  grants(payload: unknown): BridgeResult<{ grants: WorkspaceGrant[] }>;
  grantCreate(
    payload: unknown,
  ): Promise<BridgeResult<{ grant: WorkspaceGrant; created?: boolean }>>;
  grantRevoke(payload: unknown): BridgeResult<{ grant: WorkspaceGrant }>;
  grantRequestApprove(payload: unknown): Promise<BridgeResult<GrantRequestApprovalResult>>;
  grantWriteSet(payload: unknown): BridgeResult<{ grant: WorkspaceGrant }>;
}

export function createWorkspacesBridgeMethods(
  human: HumanContext,
  deps: WorkspacesBridgeDeps & Pick<BridgeMethodsDeps, 'channels' | 'registry' | 'toolApproval'>,
): WorkspacesBridgeMethods {
  return {
    grants(payload) {
      const slug = asSlug(payload);
      if (slug === undefined) return invalidInput('slug is required');
      if (deps.registry.get(slug) === undefined) return unknownBot(slug);
      const source = asObject(payload);
      if (source?.['scope'] !== undefined) {
        const parsed = z
          .object({ channelId: z.string().min(1), path: z.string().min(1) })
          .safeParse(source['scope']);
        if (!parsed.success) return invalidInput('Invalid Group workspace scope');
        const channel = deps.channels.get(parsed.data.channelId);
        if (
          channel?.type !== 'group' ||
          !channel.members.includes(slug) ||
          deps.registry.get(slug)?.paused
        )
          return invalidInput('Bot is no longer an eligible Group member');
        try {
          const grants = (deps.grants?.list(slug) ?? [])
            .filter(
              (grant) => grant.revokedAt === undefined && grant.workspacePath === parsed.data.path,
            )
            .map((grant) => deps.grants!.requireActive(slug, grant.id));
          return { ok: true, value: { grants } };
        } catch (error) {
          if (error instanceof WorkspaceGrantError)
            return {
              ok: false,
              error: {
                code: error.code,
                message: error.message,
                ...(error instanceof WorkspaceGrantError && error.details
                  ? { details: error.details }
                  : {}),
              },
            };
          throw error;
        }
      }
      return { ok: true, value: { grants: deps.grants?.list(slug) ?? [] } };
    },
    async grantCreate(payload) {
      const source = asObject(payload);
      const slug = asNonBlank(source, 'slug');
      const workspaceId = asNonBlank(source, 'workspaceId');
      if (slug === undefined || workspaceId === undefined) {
        return invalidInput('slug and workspaceId are required');
      }
      if (deps.registry.get(slug) === undefined) return unknownBot(slug);
      if (deps.grants === undefined)
        return {
          ok: false,
          error: {
            code: 'unavailable',
            message: 'Workspace Grants are unavailable',
          },
        };
      const scope = source?.['scope'];
      const parsedScope =
        scope === undefined
          ? undefined
          : z
              .object({
                channelId: z.string().min(1),
                path: z.string().min(1),
              })
              .safeParse(scope);
      if (parsedScope !== undefined && !parsedScope.success)
        return invalidInput('Invalid Group workspace scope');
      const validate = (): void => {
        if (parsedScope?.success !== true) return;
        const channel = deps.channels.get(parsedScope.data.channelId);
        const bot = deps.registry.get(slug);
        if (
          channel?.type !== 'group' ||
          !channel.members.includes(slug) ||
          bot === undefined ||
          bot.paused
        ) {
          throw new WorkspaceGrantError(
            'invalid-grant',
            'Bot is no longer an eligible Group member',
          );
        }
        if (
          deps.grants?.availableWorkspaces().find((workspace) => workspace.id === workspaceId)
            ?.path !== parsedScope.data.path
        ) {
          throw new WorkspaceGrantError(
            'unavailable-workspace',
            'Workspace no longer matches the confirmed directory',
          );
        }
      };
      try {
        validate();
        let created = false;
        const grant = await deps.grants.create(slug, workspaceId, {
          validate,
          onCreated: () => {
            created = true;
          },
        });
        return {
          ok: true,
          value: { grant, ...(scope === undefined ? {} : { created }) },
        };
      } catch (error) {
        if (error instanceof WorkspaceGrantError) {
          return {
            ok: false,
            error: {
              code: error.code,
              message: error.message,
              ...(error instanceof WorkspaceGrantError && error.details
                ? { details: error.details }
                : {}),
            },
          };
        }
        throw error;
      }
    },
    grantRevoke(payload) {
      const source = asObject(payload);
      const slug = asNonBlank(source, 'slug');
      const grantId = asNonBlank(source, 'grantId');
      if (slug === undefined || grantId === undefined) {
        return invalidInput('slug and grantId are required');
      }
      if (deps.registry.get(slug) === undefined) return unknownBot(slug);
      if (deps.grants === undefined)
        return {
          ok: false,
          error: {
            code: 'unavailable',
            message: 'Workspace Grants are unavailable',
          },
        };
      try {
        const grant = deps.grants.revoke(slug, grantId);
        deps.toolApproval?.cancelInvalid();
        return { ok: true, value: { grant } };
      } catch (error) {
        if (error instanceof WorkspaceGrantError) {
          return {
            ok: false,
            error: {
              code: error.code,
              message: error.message,
              ...(error instanceof WorkspaceGrantError && error.details
                ? { details: error.details }
                : {}),
            },
          };
        }
        throw error;
      }
    },
    async grantRequestApprove(payload) {
      const parsed = z
        .object({
          slug: z.string().min(1),
          channelId: z.string().min(1),
          requestMessageId: z.string().min(1),
          workspaceId: z.string().min(1),
          acknowledgeReadWrite: z.literal(true),
        })
        .safeParse(asObject(payload));
      if (!parsed.success)
        return invalidInput(
          'Bot, Channel, request, Workspace and explicit read/write confirmation are required',
        );
      if (!deps.grants) return unavailable();
      try {
        return {
          ok: true,
          value: await approveGrantRequest(human, { ...deps, grants: deps.grants }, parsed.data),
        };
      } catch (error) {
        if (error instanceof WorkspaceGrantError)
          return {
            ok: false,
            error: {
              code: error.code,
              message: error.message,
              ...(error instanceof WorkspaceGrantError && error.details
                ? { details: error.details }
                : {}),
            },
          };
        throw error;
      }
    },
    grantWriteSet(payload) {
      const source = asObject(payload);
      const slug = asNonBlank(source, 'slug');
      const grantId = asNonBlank(source, 'grantId');
      const enabled = source?.['enabled'];
      if (slug === undefined || grantId === undefined || typeof enabled !== 'boolean')
        return invalidInput('slug, grantId and boolean enabled are required');
      if (deps.registry.get(slug) === undefined) return unknownBot(slug);
      if (deps.grants === undefined)
        return {
          ok: false,
          error: {
            code: 'unavailable',
            message: 'Workspace Grants are unavailable',
          },
        };
      try {
        const grant = deps.grants.setOrchestratorWrite(slug, grantId, enabled);
        deps.toolApproval?.cancelInvalid();
        return { ok: true, value: { grant } };
      } catch (error) {
        if (error instanceof WorkspaceGrantError)
          return {
            ok: false,
            error: { code: error.code, message: error.message },
          };
        throw error;
      }
    },
  };
}

export interface WorkspacesAdapterMethods {
  workspaceOptions(payload: unknown): BridgeResult<{
    workspaces: { id: string; path: string; title: string }[];
  }>;
  workspaceFileTarget(payload: unknown): BridgeResult<{
    target: { path: string; relativePath: ''; kind: 'directory' };
  }>;
  folderBrowse(payload: unknown): Promise<BridgeResult<FolderListing>>;
}

export function createWorkspacesAdapterMethods(
  human: HumanContext,
  deps: BridgeMethodsDeps,
  isHostOwner: () => boolean,
): WorkspacesAdapterMethods {
  return {
    workspaceOptions() {
      try {
        const team = deps.team;
        const spaces = team
          ? team.spaces.list(human).map((space) => ({
              id: space.spaceId,
              title: space.name,
              path: join(team.spaces.path(space.spaceId), 'files'),
            }))
          : [];
        const native =
          !deps.team || isHostOwner()
            ? (deps.grants?.availableWorkspaces() ?? []).filter(({ id, path }) => {
                if (!deps.team) return true;
                if (/^(spaces|shared)\//u.test(id)) return false;
                try {
                  deps.team.spaces.assertGrantForHuman(human, path);
                  return true;
                } catch {
                  return false;
                }
              })
            : [];
        return {
          ok: true,
          value: {
            workspaces: [...native, ...spaces],
          },
        };
      } catch (error) {
        if (error instanceof WorkspaceGrantError) {
          return {
            ok: false,
            error: {
              code: error.code,
              message: error.message,
              ...(error instanceof WorkspaceGrantError && error.details
                ? { details: error.details }
                : {}),
            },
          };
        }
        throw error;
      }
    },
    async folderBrowse(payload) {
      const input = z
        .object({
          path: z.string().max(1024).optional(),
          offset: z.number().int().min(0).max(1_000_000).optional(),
        })
        .strict()
        .safeParse(payload ?? {});
      if (!input.success) return invalidInput('path must be a folder path');
      if (deps.folders === undefined)
        return {
          ok: false,
          error: {
            code: 'unavailable',
            message: 'Folder browsing is unavailable',
          },
        };
      try {
        return {
          ok: true,
          value: await deps.folders.list(input.data.path, input.data.offset),
        };
      } catch (error) {
        if (error instanceof FolderBrowseError)
          return {
            ok: false,
            error: { code: error.code, message: error.message },
          };
        throw error;
      }
    },
    workspaceFileTarget(payload) {
      const source = asObject(payload);
      const slug = asNonBlank(source, 'slug');
      const grantId = asNonBlank(source, 'grantId');
      if (slug === undefined || grantId === undefined)
        return invalidInput('slug and grantId are required');
      if (deps.registry.get(slug) === undefined) return unknownBot(slug);
      if (deps.grants === undefined)
        return {
          ok: false,
          error: {
            code: 'unavailable',
            message: 'Workspace Grants are unavailable',
          },
        };
      try {
        const grant = deps.grants.requireActive(slug, grantId);
        return {
          ok: true,
          value: {
            target: {
              path: grant.workspacePath,
              relativePath: '',
              kind: 'directory',
            },
          },
        };
      } catch (error) {
        if (error instanceof WorkspaceGrantError)
          return {
            ok: false,
            error: {
              code: error.code,
              message: error.message,
              ...(error instanceof WorkspaceGrantError && error.details
                ? { details: error.details }
                : {}),
            },
          };
        throw error;
      }
    },
  };
}
