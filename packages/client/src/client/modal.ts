import type { ReactNode } from 'react';

import { Modal as PrimitiveModal } from './appearance-primitives.js';

interface ModalBaseProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children?: ReactNode;
  footer?: ReactNode;
  className?: string;
  contentClassName?: string;
  backdropBlur?: boolean;
}

export type ModalProps = ModalBaseProps &
  ({ headless: true; closeLabel?: never } | { headless?: false; closeLabel: string });

export const Modal = PrimitiveModal as unknown as (props: ModalProps) => ReactNode;
