import { useModalLayer } from '@deepseek-ai/dsh-client-ui-primitives';
import type { RefObject } from 'react';

export function useShellLayer(
  element: RefObject<HTMLElement | null>,
  open: boolean,
  onClose: () => void,
): void {
  useModalLayer(element, open, onClose);
}
