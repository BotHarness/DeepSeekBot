import { mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { atomicWriteFile } from '../fs/atomic-write.js';
import { isModelRoute, type ModelRoute } from '../models/presets.js';

export const APPROVAL_REVIEWER_SETTINGS_FILE = 'approval-reviewer.json';

export type ApprovalReviewerModelSetting =
  | { kind: 'bot' }
  | { kind: 'model'; route: ModelRoute }
  | { kind: 'invalid' };

export interface ApprovalReviewerSettings {
  model(): ApprovalReviewerModelSetting;
  setModel(route: ModelRoute | undefined): void;
}

function routeOf(route: ModelRoute): ModelRoute {
  return {
    provider: route.provider,
    model: route.model,
    ...(route.reasoningEffort === undefined ? {} : { reasoningEffort: route.reasoningEffort }),
  };
}

export function createApprovalReviewerSettings(dir: string): ApprovalReviewerSettings {
  const file = join(dir, APPROVAL_REVIEWER_SETTINGS_FILE);
  return {
    model() {
      let parsed: unknown;
      try {
        parsed = JSON.parse(readFileSync(file, 'utf8'));
      } catch (error) {
        return (error as NodeJS.ErrnoException).code === 'ENOENT'
          ? { kind: 'bot' }
          : { kind: 'invalid' };
      }
      if (typeof parsed !== 'object' || parsed === null) return { kind: 'invalid' };
      const model = (parsed as { model?: unknown }).model;
      if (model === undefined || model === null) return { kind: 'bot' };
      return isModelRoute(model) ? { kind: 'model', route: routeOf(model) } : { kind: 'invalid' };
    },
    setModel(route) {
      mkdirSync(dir, { recursive: true });
      atomicWriteFile(
        file,
        JSON.stringify({ model: route === undefined ? null : routeOf(route) }, null, 2) + '\n',
      );
    },
  };
}
