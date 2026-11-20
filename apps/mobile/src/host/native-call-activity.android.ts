import { requireOptionalNativeModule } from 'expo';
import { AppRegistry } from 'react-native';

import { holdCallBackgroundTask } from './call-background-task';

import {
  callNotice,
  type CallActivityAction,
  type CallActivityNative,
  type CallActivityProps,
} from '../ui/chat/call-activity';

type Subscription = { remove(): void };

interface CallNoticeModule {
  callBackgroundToken?(): string | null;
  callNoticeShow(notice: ReturnType<typeof callNotice>): Promise<boolean>;
  callNoticeEnd(): Promise<void>;
  addListener(event: 'onCallBackground', listener: () => void): Subscription;
  addListener(
    event: 'onCallAction',
    listener: (event: { action: CallActivityAction }) => void,
  ): Subscription;
}

const native = requireOptionalNativeModule<CallNoticeModule>('LocalComputerVideo');
const module =
  native !== null && typeof (native as Partial<CallNoticeModule>).callNoticeShow === 'function'
    ? native
    : undefined;

if (module?.callBackgroundToken !== undefined) {
  const callModule = module;
  AppRegistry.registerHeadlessTask(
    'BotharnessCall',
    () => (data: { token?: unknown }) =>
      holdCallBackgroundTask(data.token, {
        token: () => callModule.callBackgroundToken?.() ?? null,
        subscribe: (changed) => {
          const subscription = callModule.addListener('onCallBackground', changed);
          return () => subscription.remove();
        },
      }),
  );
}

const show = async (props: CallActivityProps) =>
  module !== undefined &&
  props.palette !== undefined &&
  (await module.callNoticeShow(callNotice(props, props.palette)));

export const callActivityNative: CallActivityNative = {
  async start(props) {
    if (!(await show(props))) return undefined;
    return {
      update: async (next) => {
        await show(next);
      },
      end: async () => {
        await module?.callNoticeEnd();
      },
    };
  },
};

export function onCallActivityAction(onAction: (action: CallActivityAction) => void): () => void {
  if (module === undefined) return () => undefined;
  const subscription = module.addListener('onCallAction', (event) => {
    if (event.action === 'hang-up' || event.action === 'mute' || event.action === 'open')
      onAction(event.action);
  });
  return () => subscription.remove();
}
