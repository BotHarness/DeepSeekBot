import type { ReactElement } from 'react';

export type ComposerHoldProps = {
  enabled: boolean;
  onStart(): void;
  onStop(): void;
  children: ReactElement;
};

export function ComposerHold({ children }: ComposerHoldProps) {
  return children;
}
