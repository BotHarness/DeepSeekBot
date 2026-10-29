import { Stack, useGlobalSearchParams, usePathname } from 'expo-router';
import { useRef } from 'react';
import { View } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';
import type { CreationEntrySource } from '../../host/bot-creation-entry';
import { isCreationFlow } from '../../host/bot-creation-steps';
import { KeyboardFormFrame } from '../primitives/keyboard-form-frame';
import { useSheetContent } from '../primitives/sheet-content';
import { StepBar } from '../primitives/step-bar';
import { CreationContext, useCreationModel } from './create-bot-screen';
import { CreationHeader } from './creation-header';

export function CreationFlowLayout() {
  const { ready, mount } = useSheetContent();
  return (
    <View ref={mount} style={{ flex: 1 }}>
      <Stack.Screen options={{ headerShown: false }} />
      <CreationFlowOwner presented={ready} />
    </View>
  );
}

function CreationFlowOwner({ presented }: { presented: boolean }) {
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
  const reducedMotion = useReducedMotion();
  const {
    theme,
    draft,
    state,
    title,
    importing,
    position,
    steps,
    exit,
    bar,
    mounted,
    pairedMount,
    slowMount,
  } = model;
  return (
    <CreationContext.Provider value={model}>
      <View
        ref={mounted}
        testID="create-bot-flow"
        style={{ flex: 1, backgroundColor: theme.color.base }}
      >
        <CreationHeader
          title={title}
          name={
            draft?.displayName ??
            (state.record.kind === 'submitted' ? state.record.operation.input.displayName : '')
          }
          avatar={
            draft?.avatar ?? (state.record.kind === 'submitted' ? state.record.avatar : undefined)
          }
          imported={importing}
          step={{ index: position + 1, total: steps.length }}
          progress={
            draft
              ? position / steps.length
              : state.receipt?.status === 'created'
                ? 1
                : state.busy
                  ? undefined
                  : (steps.length - 1) / steps.length
          }
          onClose={exit}
        />
        <View ref={slowMount} style={{ flex: 1 }}>
          <KeyboardFormFrame
            footer={bar ? <StepBar {...bar} /> : null}
            backgroundColor={theme.color.base}
          >
            <View ref={pairedMount} style={{ flex: 1 }}>
              <Stack
                screenOptions={{
                  headerShown: false,
                  contentStyle: { backgroundColor: theme.color.base },
                  animation: reducedMotion ? 'none' : 'slide_from_right',
                  freezeOnBlur: true,
                }}
              />
            </View>
          </KeyboardFormFrame>
        </View>
      </View>
    </CreationContext.Provider>
  );
}
