import {
  Host,
  Icon,
  IconButton,
  LinearProgressIndicator,
  RNHostView,
  Row,
  Text,
  TopAppBar,
} from '@expo/ui/jetpack-compose';
import { fillMaxWidth, semantics, size, testID, weight } from '@expo/ui/jetpack-compose/modifiers';
import { View, type ViewInstance } from 'react-native';
import { useRef } from 'react';
import Animated, {
  ReduceMotion,
  useAnimatedProps,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useDesignTheme } from '../design/theme';
import { creationHeader, materialIconButton, space } from '../design/tokens';
import { useStrings } from '../strings';
import { useMounted } from '../mounted';
import { CreationAvatarPreview } from './creation-avatar';
import type { CreationHeaderProps } from './creation-header-contract';

const AnimatedProgress = Animated.createAnimatedComponent(LinearProgressIndicator);

export function CreationHeader({
  title,
  name,
  avatar,
  imported,
  step,
  progress,
  onClose,
}: CreationHeaderProps) {
  const theme = useDesignTheme();
  const insets = useSafeAreaInsets();
  const t = useStrings();
  const retainedAvatar = useRef(avatar);
  if (avatar !== undefined || progress !== 1) retainedAvatar.current = avatar;
  const portrait = avatar ?? (progress === 1 ? retainedAvatar.current : undefined);
  const hasIdentity = Boolean(name.trim() || portrait);
  const completion = useSharedValue(progress ?? 0);
  const determinate = useSharedValue(progress !== undefined);
  const animate = useMounted<ViewInstance>(() => {
    determinate.set(progress !== undefined);
    if (progress !== undefined)
      completion.set(
        withSpring(progress, {
          ...creationHeader.progressSpring,
          reduceMotion: ReduceMotion.System,
        }),
      );
  }, [completion, determinate, progress]);
  const progressProps = useAnimatedProps(() => ({
    progress: determinate.get() ? completion.get() : null,
  }));
  return (
    <View
      ref={animate}
      testID="create-bot-header"
      style={{
        backgroundColor: theme.color.base,
        paddingTop: insets.top,
        paddingLeft: insets.left,
        paddingRight: insets.right,
      }}
    >
      <Host
        matchContents={{ vertical: true }}
        colorScheme={theme.scheme}
        seedColor={theme.color.accent}
        ignoreSafeAreaKeyboardInsets
      >
        <TopAppBar
          windowInsets={{}}
          colors={{
            containerColor: theme.color.base,
            titleContentColor: theme.color.fg,
            navigationIconContentColor: theme.color.fg,
          }}
          modifiers={[fillMaxWidth()]}
        >
          <TopAppBar.NavigationIcon>
            <IconButton
              onClick={onClose}
              modifiers={[
                size(theme.touch, theme.touch),
                testID('create-bot-close'),
                semantics({ contentDescription: t.close }),
              ]}
            >
              <Icon
                source={require('../../../assets/toolbar/close.png')}
                size={materialIconButton.iconSize}
              />
            </IconButton>
          </TopAppBar.NavigationIcon>
          <TopAppBar.Title>
            <Row
              verticalAlignment="center"
              horizontalArrangement={{ spacedBy: space.x3 }}
              modifiers={[fillMaxWidth()]}
            >
              {hasIdentity ? (
                <RNHostView modifiers={[size(creationHeader.avatar, creationHeader.avatar)]}>
                  <CreationAvatarPreview
                    avatar={portrait}
                    name={name.trim()}
                    imported={imported}
                    size={creationHeader.avatar}
                  />
                </RNHostView>
              ) : null}
              <Text
                style={{ typography: 'titleLarge' }}
                color={theme.color.fg}
                maxLines={1}
                overflow="ellipsis"
                modifiers={[weight(1)]}
              >
                {name.trim() || title}
              </Text>
            </Row>
          </TopAppBar.Title>
        </TopAppBar>
      </Host>
      <View
        style={{ paddingHorizontal: space.x5, paddingBottom: space.x3 }}
        accessibilityLabel={t.stepBar.step(step.index, step.total)}
        accessibilityRole="progressbar"
        accessibilityValue={
          progress === undefined ? undefined : { min: 0, max: 100, now: Math.round(progress * 100) }
        }
      >
        <Host
          matchContents={{ vertical: true }}
          colorScheme={theme.scheme}
          seedColor={theme.color.accent}
          ignoreSafeAreaKeyboardInsets
        >
          <AnimatedProgress
            animatedProps={progressProps}
            color={theme.color.accent}
            trackColor={theme.layer.raised.fill}
            modifiers={[fillMaxWidth(), testID('create-bot-progress')]}
          />
        </Host>
      </View>
    </View>
  );
}
