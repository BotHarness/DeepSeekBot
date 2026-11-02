import type { Ref } from 'react';
import type { ViewInstance } from 'react-native';

import { useDesignTheme } from '../design/theme';
import { PrimaryTabRow } from '../primitives/primary-tab-row.android';
import { useStrings } from '../strings';

export type WorkspaceTab = 'computers' | 'cloud';

export function WorkspaceTabs({
  value,
  onChange,
  selectedRef,
}: {
  value: WorkspaceTab;
  selectedRef?: Ref<ViewInstance>;
  onChange(value: WorkspaceTab): void;
}) {
  const t = useStrings();
  const theme = useDesignTheme();
  return (
    <PrimaryTabRow
      testID="workspace-tabs"
      rowRef={selectedRef}
      tabs={[
        { value: 'computers', label: t.computers },
        { value: 'cloud', label: t.workspaceAdd.cloudTab },
      ]}
      value={value}
      onChange={onChange}
      containerColor={theme.overlay.fill}
    />
  );
}
