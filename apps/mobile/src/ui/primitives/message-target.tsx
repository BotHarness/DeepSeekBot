import type { ReactNode } from 'react';

export type MessageTargetProps = {
  children: ReactNode;
  request: string;
  active: boolean;
  top: number;
  bottom: number;
  onPositioned(request: string): void;
};
export const nativeMessageJump = false;
export function MessageTarget({ children }: MessageTargetProps) {
  return children;
}
