import { Stack, useGlobalSearchParams, usePathname } from 'expo-router';
import { useMemo, useRef, type ReactNode } from 'react';
import { View } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';
import { SafeAreaInsetsContext, useSafeAreaInsets } from 'react-native-safe-area-context';
import type { CreationEntrySource } from '../../host/bot-creation-entry';
import { isCreationFlow } from '../../host/bot-creation-steps';
import { botRecordStarted } from '../../host/creation-drafts';
import { botCreation } from '../../host/native-bot-creation';
import { KeyboardFormFrame } from '../primitives/keyboard-form-frame';
import { useSheetContent } from '../primitives/sheet-content';
import { SheetScreen } from '../primitives/sheet-screen';
import { StepBar } from '../primitives/step-bar';
import { CreationContext, CreationLeaveContext, useCreationModel } from './create-bot-screen';
import { useCreationDraftGuard } from './creation-draft-guard';

export type CreationModel = ReturnType<typeof useCreationModel>;

export function CreationFlowSheet({ header }: { header: (model: CreationModel) => ReactNode }) {
  const { ready, mount } = useSheetContent();
  const insets = useSafeAreaInsets();
  const contentInsets = useMemo(() => ({ ...insets, top: 0 }), [insets]);
  return (
    <View ref={mount} style={{ flex: 1 }}>
      <SafeAreaInsetsContext value={contentInsets}>
        <CreationFlowOwner presented={ready} header={header} />
      </SafeAreaInsetsContext>
    </View>
  );
}

function CreationFlowOwner({
  presented,
  header,
}: {
  presented: boolean;
  header: (model: CreationModel) => ReactNode;
}) {
  const globalParams = useGlobalSearchParams<{
    flow?: string;
    step?: string;
    hostId?: string;
    entry?: string;
  }>();
  const pathname = usePathname();
  const flowParams = useRef(globalParams);
  if (pathname !== '/create-bot-avatar') flowParams.current = globalParams;
  const params = flowParams.current;
  const initialSource = useRef<CreationEntrySource>(
    pathname === '/import-bot-git' ? 'git' : pathname === '/import-bot-zip' ? 'zip' : 'blank',
  ).current;
  const index = Math.max(0, Number.parseInt(params.step ?? '0', 10) || 0);
  const model = useCreationModel({
    index,
    initialSource,
    initialEntry: params,
    presented,
    ...(isCreationFlow(params.flow) ? { flow: params.flow } : {}),
  });
  const leave = useCreationDraftGuard(
    model.entryReady && !model.state.busy && botRecordStarted(model.state.record),
    () => botCreation.another(model.draft?.hostId ?? '', 'fresh'),
  );
  const reducedMotion = useReducedMotion();
  const { theme, bar, exit, mounted, pairedMount, slowMount } = model;
  return (
    <CreationContext.Provider value={model}>
      <CreationLeaveContext.Provider value={leave}>
        <SheetScreen onClose={exit}>
          <View ref={mounted} testID="create-bot-flow" style={{ flex: 1 }}>
            {header(model)}
            <View ref={slowMount} style={{ flex: 1 }}>
              <KeyboardFormFrame
                footer={bar ? <StepBar {...bar} /> : null}
                backgroundColor={theme.overlay.fill}
              >
                <View ref={pairedMount} style={{ flex: 1 }}>
                  <Stack
                    screenOptions={{
                      headerShown: false,
                      contentStyle: { backgroundColor: theme.overlay.fill },
                      animation: reducedMotion ? 'none' : 'slide_from_right',
                      freezeOnBlur: true,
                    }}
                  />
                </View>
              </KeyboardFormFrame>
            </View>
          </View>
        </SheetScreen>
      </CreationLeaveContext.Provider>
    </CreationContext.Provider>
  );
}
