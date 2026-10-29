import type { ReactElement } from 'react';
import type { ActivityOptions } from './activity-header-actions';

export type ActivityInspectorProps = ActivityOptions & {
  children: ReactElement;
  visible: boolean;
  onClose(): void;
};

export function ActivityInspector({ children }: ActivityInspectorProps) {
  return children;
}
