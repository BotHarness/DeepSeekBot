import type { ComponentType } from 'react';
import type { ViewProps } from 'react-native';

export const SpeakerAnchor:
  | ComponentType<ViewProps & { rest: number; span: number; floor: number; viewport: string }>
  | undefined = undefined;
