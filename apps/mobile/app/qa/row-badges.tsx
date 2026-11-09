import { Stack } from 'expo-router';
import { ScrollView, View } from 'react-native';

import type { HostLook } from '../../src/ui/design/host-look';
import { useDesignTheme } from '../../src/ui/design/theme';
import { chatList, space } from '../../src/ui/design/tokens';
import { ConversationRowFrame } from '../../src/ui/chat/conversation-row';
import { AvatarSlot, CONVERSATION_AVATAR } from '../../src/ui/chat/avatar-slot';
import { GroupMark } from '../../src/ui/chat/group-mark';
import { radius } from '../../src/ui/design/tokens';
import type { CountBadgeTone } from '../../src/ui/primitives/count-badge';
import { Text } from '../../src/ui/primitives/text';

// Prototype gallery for the env-icon / unread-badge row layout. Not linked from the app.
const PROTOTYPE_ACTIVITY_BADGES = true;

const HOME: HostLook = { name: 'Home Mac', icon: { kind: 'symbol', id: 'home' }, color: 'blue' };
const WORK: HostLook = { name: 'Work', icon: { kind: 'symbol', id: 'work' }, color: 'orange' };
const LAB: HostLook = { name: 'Lab', icon: { kind: 'symbol', id: 'server' }, color: 'green' };

type Sample = {
  title: string;
  initial: string;
  tint: string;
  preview: string;
  time: string;
  badge?: { count: number; tone: CountBadgeTone };
  look?: HostLook;
  cloud?: boolean;
  activity?: boolean;
};

const CHATS: Sample[] = [
  {
    title: 'Research Bot',
    initial: 'R',
    tint: '#5856d6',
    preview: 'Can I run the migration on staging?',
    time: '2m',
    badge: { count: 2, tone: 'needs-you' },
    look: HOME,
  },
  {
    title: 'Design review',
    initial: 'D',
    tint: '#30b0c7',
    preview: 'Vain: the rail version reads cleaner',
    time: '9m',
    badge: { count: 14, tone: 'unread' },
    look: WORK,
  },
  {
    title: 'Writer',
    initial: 'W',
    tint: '#af52de',
    preview: 'Draft 3 of the release notes is ready',
    time: '1h',
    badge: { count: 128, tone: 'unread' },
    look: LAB,
  },
  {
    title: 'Ops alerts',
    initial: 'O',
    tint: '#8e8e93',
    preview: 'Disk usage back under 70%',
    time: '3h',
    badge: { count: 3, tone: 'muted' },
    look: HOME,
  },
  {
    title: 'Team cloud',
    initial: 'T',
    tint: '#34c759',
    preview: 'Recent messages not loaded',
    time: 'Mon',
    cloud: true,
  },
  {
    title: 'Coder',
    initial: 'C',
    tint: '#ff9500',
    preview: 'Merged #3793',
    time: 'Sun',
    look: WORK,
  },
];

const ACTIVITY: Sample[] = [
  {
    title: 'Research Bot',
    initial: 'R',
    tint: '#5856d6',
    preview: 'Question · Which branch should I rebase onto?',
    time: '1m',
    badge: { count: 1, tone: 'needs-you' },
    look: HOME,
    activity: true,
  },
  {
    title: 'Design review',
    initial: 'D',
    tint: '#30b0c7',
    preview: 'Mention · @Vain can you check the dark mode?',
    time: '6m',
    badge: { count: 5, tone: 'unread' },
    look: WORK,
    activity: true,
  },
  {
    title: 'Coder',
    initial: 'C',
    tint: '#ff9500',
    preview: 'Tool approval · git push origin main',
    time: '12m',
    badge: { count: 1, tone: 'needs-you' },
    look: LAB,
    activity: true,
  },
  {
    title: 'Writer',
    initial: 'W',
    tint: '#af52de',
    preview: 'Reply · Done, the notes are in the shared folder',
    time: '2h',
    look: HOME,
    activity: true,
  },
];

function Row({ sample, all }: { sample: Sample; all: boolean }) {
  const look = all ? sample.look : HOME;
  const badge = sample.activity && !PROTOTYPE_ACTIVITY_BADGES ? undefined : sample.badge;
  return (
    <ConversationRowFrame
      title={sample.title}
      source={sample.cloud ? 'cloud' : 'computer'}
      look={look}
      sourceLabel={all ? (sample.cloud ? 'Cloud' : look?.name) : undefined}
      mixed={all}
      label={sample.title}
      preview={sample.preview}
      time={sample.time}
      unread={sample.badge !== undefined && sample.badge.tone !== 'muted'}
      badge={badge}
      avatar={
        <AvatarSlot>
          <GroupMark
            avatar={undefined}
            initial={sample.initial}
            fill={sample.tint}
            size={CONVERSATION_AVATAR}
            corner={radius.md}
            variant="title"
            strong={false}
          />
        </AvatarSlot>
      }
      onPress={() => undefined}
    />
  );
}

function Section({ title, samples, all }: { title: string; samples: Sample[]; all: boolean }) {
  const theme = useDesignTheme();
  return (
    <View style={{ marginBottom: space.x5 }}>
      <Text
        variant="meta"
        strong
        tone="muted"
        style={{ paddingHorizontal: chatList.gutter, paddingVertical: space.x3 }}
      >
        {title}
      </Text>
      <View style={{ backgroundColor: theme.layer.canvas.fill }}>
        {samples
          .filter((sample) => all || !sample.cloud)
          .map((sample) => (
            <Row key={sample.title} sample={sample} all={all} />
          ))}
      </View>
    </View>
  );
}

export default function RowBadgesPrototype() {
  const theme = useDesignTheme();
  return (
    <ScrollView
      testID="row-badges-prototype"
      style={{ flex: 1, backgroundColor: theme.layer.canvas.fill }}
      contentContainerStyle={{ paddingVertical: space.x5 }}
    >
      <Stack.Screen options={{ title: 'Row badges' }} />
      <Section title="CHATS · ONE ENVIRONMENT (Home Mac)" samples={CHATS} all={false} />
      <Section title="CHATS · ALL" samples={CHATS} all />
      <Section title="ACTIVITY · ONE ENVIRONMENT (Home Mac)" samples={ACTIVITY} all={false} />
      <Section title="ACTIVITY · ALL" samples={ACTIVITY} all />
    </ScrollView>
  );
}
