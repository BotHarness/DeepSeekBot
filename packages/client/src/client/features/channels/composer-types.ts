import type { PersonaBotFacepileItem } from '../../avatar.js';
import type { ChannelAttachmentRef } from '../../store.js';

export interface ChannelComposerActivity {
  presentation?: 'group' | undefined;
  items: readonly PersonaBotFacepileItem[];
  summary: string;
}

export interface ChannelComposerUpload {
  id: string;
  file: File;
  status: 'uploading' | 'ready' | 'error';
  ref?: ChannelAttachmentRef;
  error?: string | undefined;
  fileAvailable?: boolean;
}
