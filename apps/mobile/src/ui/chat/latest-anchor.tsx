import type { ComponentType } from 'react';
import type { ViewProps } from 'react-native';

export const LatestAnchor:
  | ComponentType<ViewProps & { following: boolean; animated: boolean }>
  | undefined = undefined;
