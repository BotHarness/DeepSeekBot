import { useCallback, useRef, useState } from 'react';
import { View, type ViewInstance } from 'react-native';

import type { WorkspaceOption } from '../../host/bot-settings';
import type { DecisionResult, GrantRequest } from '../../host/requests';
import { useDesignTheme } from '../design/theme';
import { radius, space } from '../design/tokens';
import { haptic } from '../haptics';
import { useMounted } from '../mounted';
import { Button } from '../primitives/button';
import { Text } from '../primitives/text';
import { t } from '../strings';
import { ActionCard, CardButtons, CardLine, CardNote } from './action-card';
import type { BubbleGroup } from './bubble-shape';
import { FolderPickerSheet, type FolderPickerPort } from './folder-picker-sheet';

export interface GrantRequestPort extends FolderPickerPort {
  load(): Promise<GrantRequest>;
  approve(workspaceId: string): Promise<DecisionResult>;
}

type Phase =
  | { kind: 'known' }
  | { kind: 'loading' }
  | { kind: 'failed' }
  | { kind: 'pending'; request: GrantRequest; picking: boolean; error?: string }
  | { kind: 'settled'; mine: boolean; folder?: string };

export function GrantRequestCard({
  port,
  botName,
  resolved = false,
  decidedHere = false,
  focused = false,
  group,
  wide = false,
  onSettled,
}: {
  port: GrantRequestPort;
  botName: string;
  resolved?: boolean;
  decidedHere?: boolean;
  focused?: boolean;
  group?: BubbleGroup;
  wide?: boolean;
  onSettled?(result: DecisionResult): void;
}) {
  const theme = useDesignTheme();
  const known = useRef(resolved);
  const [phase, setPhase] = useState<Phase>(
    known.current ? { kind: 'known' } : { kind: 'loading' },
  );

  const load = useCallback(async () => {
    setPhase({ kind: 'loading' });
    try {
      const request = await port.load();
      setPhase(
        request.status === 'pending'
          ? { kind: 'pending', request, picking: false }
          : { kind: 'settled', mine: false },
      );
    } catch {
      setPhase({ kind: 'failed' });
    }
  }, [port]);

  const mount = useMounted<ViewInstance>(() => {
    if (!known.current) void load();
  }, [load]);

  const category = t.kind['workspace-grant-request']!;
  const mine = phase.kind === 'settled' && phase.mine;
  if (resolved || phase.kind === 'known' || phase.kind === 'settled') {
    const state = mine
      ? phase.folder === undefined
        ? t.grantAllowed
        : `${t.grantAllowed} · ${phase.folder}`
      : phase.kind === 'known' || phase.kind === 'failed' || decidedHere
        ? t.cardDecided
        : t.elsewhere(t.cardDecided);
    return (
      <View ref={mount}>
        <CardLine
          text={t.cardLine(category, state)}
          tone="success"
          focused={focused}
          {...(group === undefined ? {} : { group })}
        />
      </View>
    );
  }

  if (phase.kind !== 'pending')
    return (
      <View ref={mount}>
        <ActionCard
          category={category}
          title={t.grantTitle}
          focused={focused}
          wide={wide}
          busy={phase.kind === 'loading'}
          {...(phase.kind === 'failed' ? { error: t.cardLoadFailed } : {})}
        >
          <CardButtons>
            <Button label={t.tryAgain} onPress={() => void load()} />
          </CardButtons>
        </ActionCard>
      </View>
    );

  const { request } = phase;
  const confirm = async (folder: WorkspaceOption) => {
    const result = await port.approve(folder.id);
    if (result === 'accepted') haptic('approve');
    setPhase(
      result === 'accepted'
        ? { kind: 'settled', mine: true, folder: folder.title }
        : { kind: 'settled', mine: false },
    );
    onSettled?.(result);
  };
  return (
    <View ref={mount}>
      <ActionCard
        category={category}
        status={t.needsYou}
        title={t.grantTitle}
        focused={focused}
        wide={wide}
        {...(phase.error === undefined ? {} : { error: phase.error })}
        {...(request.reason.trim() === ''
          ? {}
          : {
              preview: (
                <View
                  style={{
                    backgroundColor: theme.layer.well.fill,
                    borderRadius: radius.md,
                    paddingHorizontal: space.x4,
                    paddingVertical: space.x3,
                  }}
                >
                  <Text selectable variant="meta">
                    {request.reason}
                  </Text>
                </View>
              ),
            })}
      >
        <CardNote>{t.grantScopeNote}</CardNote>
        <CardButtons stack>
          <Button
            label={t.grantChoose}
            testID="grant-choose-folder"
            tone="primary"
            onPress={() => setPhase({ kind: 'pending', request, picking: true })}
          />
        </CardButtons>
      </ActionCard>
      {phase.picking ? (
        <FolderPickerSheet
          botName={botName}
          port={port}
          onConfirm={confirm}
          onClose={() => setPhase({ kind: 'pending', request, picking: false })}
        />
      ) : null}
    </View>
  );
}
