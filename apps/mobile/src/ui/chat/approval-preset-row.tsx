import { useRef, useState } from 'react';
import { AccessibilityInfo, Platform, ToastAndroid, View, type ViewInstance } from 'react-native';

import type { ApprovalTemplates } from '@botharness/host-client/bot-settings';
import { space } from '../design/tokens';
import { useMounted } from '../mounted';
import { Text } from '../primitives/text';
import { errorText } from '../request-parts';
import { useStrings } from '../strings';
import {
  presetName,
  presetOptions,
  type ApprovalPresetPort,
  type PresetOption,
} from './approval-preset';
import { ApprovalPresetPicker } from './approval-preset-picker';

export function ApprovalPresetRow({ port }: { port: ApprovalPresetPort }) {
  const t = useStrings();
  const [presets, setPresets] = useState<ApprovalTemplates>();
  const [busy, setBusy] = useState(false);
  const [switched, setSwitched] = useState(false);
  const [error, setError] = useState<string>();
  const live = useRef(false);
  const mount = useMounted<ViewInstance>(() => {
    live.current = true;
    setPresets(undefined);
    setSwitched(false);
    setError(undefined);
    port.load().then(
      (next) => {
        if (live.current) setPresets(next);
      },
      () => undefined,
    );
    return () => {
      live.current = false;
    };
  }, [port]);
  const choose = (option: PresetOption) => {
    if (presets === undefined || busy || option.value === presets.selected) return;
    const previous = presets;
    const optimistic = { ...presets, selected: option.value };
    setPresets(optimistic);
    setBusy(true);
    setError(undefined);
    port
      .choose(option.value)
      .then(async () => {
        if (!live.current) return;
        setSwitched(true);
        const message = t.autoApprovalSwitched(presetName(optimistic));
        if (Platform.OS === 'android') ToastAndroid.show(message, ToastAndroid.SHORT);
        else AccessibilityInfo.announceForAccessibility(message);
        const next = await port.load().catch(() => undefined);
        if (next !== undefined && live.current) setPresets(next);
      })
      .catch((cause: unknown) => {
        if (!live.current) return;
        setPresets(previous);
        setError(`${t.settingFailed} ${errorText(cause)}`);
      })
      .finally(() => {
        if (live.current) setBusy(false);
      });
  };
  return (
    <View
      ref={mount}
      testID="approval-preset"
      style={{
        flexDirection: 'row',
        justifyContent: 'flex-end',
        alignItems: 'center',
        gap: space.x3,
        display: presets === undefined ? 'none' : 'flex',
      }}
    >
      {presets === undefined ? null : (
        <>
          {error === undefined ? null : (
            <Text variant="meta" tone="danger" style={{ flexShrink: 1 }}>
              {error}
            </Text>
          )}
          {switched && error === undefined && Platform.OS !== 'android' ? (
            <Text testID="approval-preset-next" variant="meta" tone="muted">
              {t.autoApprovalNext}
            </Text>
          ) : null}
          <View style={{ width: '50%', alignItems: 'flex-end' }}>
            <ApprovalPresetPicker
              label={t.autoApprovalPresetTrigger(presetName(presets))}
              header={t.autoApprovalPresetTitle}
              note={t.autoApprovalPresetNote}
              options={presetOptions(presets)}
              {...(port.manage === undefined
                ? {}
                : { manageLabel: t.autoApprovalManage, onManage: port.manage })}
              disabled={busy}
              onSelect={choose}
            />
          </View>
        </>
      )}
    </View>
  );
}
