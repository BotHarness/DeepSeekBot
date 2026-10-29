import type { ComponentProps } from 'react';
import type { CreationField as SharedCreationField } from './creation-field';
import { TextField } from './text-field';

export function CreationField(props: ComponentProps<typeof SharedCreationField>) {
  return <TextField {...(props.multiline ? { numberOfLines: 3 } : {})} {...props} />;
}
