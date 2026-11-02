import { useCallback, useRef, useState } from 'react';
import type { ViewInstance } from 'react-native';

import {
  errorText,
  type ApprovalTemplates,
  type AssignmentAccess,
  type BotSettings,
  type Loadable,
} from '../../host/bot-settings';
import { useMounted } from '../mounted';

function useLoadable<T>(load: (() => Promise<T>) | undefined) {
  const [state, setState] = useState<Loadable<T>>({ status: 'loading' });
  const request = useRef(0);
  const reload = useCallback(() => {
    const current = ++request.current;
    if (load === undefined) return;
    void load().then(
      (value) => {
        if (request.current === current) setState({ status: 'ready', value });
      },
      (error: unknown) => {
        if (request.current === current) setState({ status: 'failed', error: errorText(error) });
      },
    );
  }, [load]);
  const reset = useCallback(() => {
    setState({ status: 'loading' });
    reload();
  }, [reload]);
  const cancel = useCallback(() => {
    request.current += 1;
  }, []);
  const set = useCallback((value: T) => {
    request.current += 1;
    setState({ status: 'ready', value });
  }, []);
  return { state, reload, reset, cancel, set };
}

export function useComposerContext(settings: BotSettings | undefined) {
  const model = useLoadable(settings?.loadModel);
  const grants = useLoadable(settings?.loadGrants);
  const access = useLoadable(settings?.loadAccess);
  const templates = useLoadable(settings?.loadTemplates);
  const mount = useMounted<ViewInstance>(() => {
    model.reset();
    grants.reset();
    return () => {
      model.cancel();
      grants.cancel();
    };
  }, [model.reset, grants.reset]);
  return {
    mount,
    model: model.state,
    grants: grants.state,
    access: access.state,
    templates: templates.state,
    reloadModel: model.reload,
    reloadGrants: grants.reload,
    openWorkspace: () => {
      grants.reload();
      access.reset();
      templates.reset();
    },
    setAccess: (value: AssignmentAccess) => access.set(value),
    setTemplates: (value: ApprovalTemplates) => templates.set(value),
  };
}
