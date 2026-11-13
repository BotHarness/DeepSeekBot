import { View } from 'react-native';
import type { MessageAttachment } from '../../host/conversation';
import { edge, fileTile, space } from '../design/tokens';
import { useDesignTheme } from '../design/theme';
import { Text } from '../primitives/text';
import { FileIcon } from '../shell/icons';
import { LoadingIndicator } from '../primitives/loading-indicator';

type FileTone = keyof typeof fileTile.fill;

const EXTENSION_TONES: Record<string, FileTone> = {
  pdf: 'pdf',
  xls: 'sheet',
  xlsx: 'sheet',
  csv: 'sheet',
  tsv: 'sheet',
  numbers: 'sheet',
  doc: 'doc',
  docx: 'doc',
  rtf: 'doc',
  txt: 'doc',
  md: 'doc',
  pages: 'doc',
  odt: 'doc',
  ppt: 'slides',
  pptx: 'slides',
  key: 'slides',
  odp: 'slides',
  zip: 'archive',
  rar: 'archive',
  '7z': 'archive',
  gz: 'archive',
  tar: 'archive',
  tgz: 'archive',
  mp3: 'media',
  m4a: 'media',
  wav: 'media',
  ogg: 'media',
  mp4: 'media',
  mov: 'media',
  webm: 'media',
  json: 'code',
  js: 'code',
  ts: 'code',
  tsx: 'code',
  py: 'code',
  html: 'code',
  css: 'code',
  yaml: 'code',
  yml: 'code',
  sh: 'code',
};

export function fileType(name: string): { label: string; tone: FileTone } {
  const dot = name.lastIndexOf('.');
  const extension = dot > 0 && dot < name.length - 1 ? name.slice(dot + 1).toLowerCase() : '';
  if (extension === '' || extension.length > 5) return { label: '', tone: 'other' };
  return { label: extension.toUpperCase(), tone: EXTENSION_TONES[extension] ?? 'other' };
}

export function AttachmentFileTile({
  attachment,
  human = false,
  busy = false,
  testID,
}: {
  attachment: MessageAttachment;
  human?: boolean;
  busy?: boolean;
  testID?: string;
}) {
  const theme = useDesignTheme();
  const type = fileType(attachment.name);
  const tileFill = attachment.cleared
    ? 'transparent'
    : human
      ? theme.color.onAccent
      : fileTile.fill[type.tone];
  const tileInk = human ? theme.color.accent : fileTile.ink;
  return (
    <View
      testID={testID}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{
        width: fileTile.size,
        height: fileTile.size,
        borderRadius: fileTile.radius,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: tileFill,
        borderWidth: attachment.cleared ? edge.hairline : 0,
        borderStyle: 'dashed',
        borderColor: theme.color.border,
      }}
    >
      {busy ? (
        <LoadingIndicator size="control" color={tileInk} />
      ) : type.label === '' || attachment.cleared ? (
        <FileIcon
          color={attachment.cleared ? theme.color[human ? 'onAccent' : 'muted'] : tileInk}
          size={theme.type.title.line}
        />
      ) : (
        <Text
          variant="meta"
          strong
          numberOfLines={1}
          adjustsFontSizeToFit
          style={{ color: tileInk, paddingHorizontal: space.x1 }}
        >
          {type.label}
        </Text>
      )}
    </View>
  );
}
