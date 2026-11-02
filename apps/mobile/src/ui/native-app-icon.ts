import {
  getAppIconName,
  setAlternateAppIcon,
  supportsAlternateIcons,
} from 'expo-alternate-app-icons';

import {
  APP_ICONS,
  type AppIconName,
  type AppIconPort,
  type AppIconPreviews,
} from './app-icon-settings';

function known(name: string | null): AppIconName {
  return APP_ICONS.find((icon) => icon === name) ?? 'default';
}

export const nativeAppIcon: AppIconPort = {
  supported: supportsAlternateIcons,
  current: () => known(getAppIconName()),
  async set(name) {
    await setAlternateAppIcon(name === 'default' ? null : name);
  },
};

export const appIconPreviews: AppIconPreviews = {
  default: {
    light: require('../../assets/app-icons/deepseekbot-light-preview.png'),
    dark: require('../../assets/app-icons/deepseekbot-dark-preview.png'),
  },
  DeepSeekBotSimple: {
    light: require('../../assets/app-icons/deepseekbot-simple-light-preview.png'),
    dark: require('../../assets/app-icons/deepseekbot-simple-dark-preview.png'),
  },
};
