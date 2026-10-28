export type PlatformOS = 'ios' | 'android';

export const computerCanvas = { background: '#000000' } as const;

export const space = {
  x1: 2,
  x2: 4,
  x3: 8,
  x4: 12,
  x5: 16,
  x6: 24,
} as const;

export const materialSearch = { height: 56, lineHeight: 24 } as const;

export const splitButton = { initial: { width: 160, height: 40 } } as const;
export const searchAppBar = { verticalPadding: 4, recent: 8 } as const;

export const materialMenu = {
  containerRadius: 16,
  outerItemRadius: 12,
  innerItemRadius: 4,
  groupPadding: 2,
  groupGap: 2,
  itemHeight: 44,
  horizontalPadding: 16,
  verticalPadding: 8,
  iconLabelGap: 12,
  iconSize: 20,
  width: 280,
  elevation: 3,
} as const;

export const radius = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 28,
  round: 9999,
} as const;

export const edge = {
  hairline: 1,
  focus: 2,
} as const;

export const sidebar = { inset: 8, radius: 44 } as const;
export const stateRing = {
  width: 2,
  inset: 3,
  segment: 0.26,
  period: 1300,
} as const;
export const rowGlyph = { size: 16, period: 900 } as const;
export const accountActionIcon = {
  slot: 28,
  signOutOpticalOffset: 1.5,
} as const;

export const sheetHandle = { width: 32, height: 4 } as const;
export const navigationBar = {
  height: 64,
  itemWidth: 80,
  radius: 20,
  indicatorWidth: 40,
  indicatorHeight: 32,
  indicatorRadius: radius.md,
  itemPadding: 6,
  labelMinScale: 0.5,
  shadow: {
    light: '0 2px 8px rgba(15, 17, 21, 0.06)',
    dark: '0 2px 8px rgba(0, 0, 0, 0.12)',
  },
} as const;
export const materialNavigationBar = {
  iconSize: 24,
  height: 80,
  margin: 0,
  indicatorWidth: 56,
  indicatorHeight: 32,
  iconLabelGap: 4,
} as const;
export const materialIconButton = {
  target: 48,
  container: 40,
  iconSize: 24,
} as const;
export const fab = {
  size: 56,
  radius: 16,
  margin: 16,
  elevation: 6,
  menuItemHeight: 56,
  menuItemGap: 4,
  menuItemPadding: 24,
  menuIconGap: 8,
  menuCloseGap: 8,
  menuWidth: 320,
  menuSettle: 350,
} as const;
export const materialDrawer = {
  width: 360,
  scrimGutter: 56,
  addressMinScale: 0.6,
} as const;
export const loadingIndicator = {
  size: 48,
  control: 20,
  controlStroke: 2.5,
} as const;
export const materialButton = { icon: 18, iconGap: space.x3 } as const;
export const stepBar = { height: { ios: 52, android: 56 }, gap: space.x3 } as const;

export const creationAvatar = { size: 112 } as const;
export const creationHeader = {
  avatar: 40,
  progressSpring: {
    mass: 1,
    stiffness: 50,
    damping: 2 * Math.sqrt(50),
    overshootClamping: true,
  },
} as const;
export const tabHeader = { gutter: space.x4 } as const;
export const chatList = {
  gutter: tabHeader.gutter,
} as const;
export const environmentTab = { widthRatio: 0.6 } as const;
export const tabLabel = { minimumFontScale: 0.6 } as const;
export const modalRail = { maxWidth: 360 } as const;
export const messageSheet = { textHeightRatio: 0.4 } as const;
export const pairingScan = { maxSize: 200, widthRatio: 0.5 } as const;

export const androidSettings = {
  radius: radius.xl,
  listRadius: radius.lg,
  innerRadius: radius.xs,
  segmentGap: 2,
  rowHeight: 56,
  supportingRowHeight: 72,
  inset: space.x5,
  vertical: space.x5,
  sectionGap: space.x4,
  switchWidth: 52,
  switchHeight: 48,
} as const;

export type TypeRole = { size: number; line: number };

export const conversationType = {
  name: { fontSize: 18, lineHeight: 24 },
  preview: { fontSize: 15, lineHeight: 20 },
} as const;

export const typeScale: Record<
  PlatformOS,
  Record<'meta' | 'body' | 'title' | 'display', TypeRole>
> = {
  ios: {
    meta: { size: 13, line: 18 },
    body: { size: 17, line: 22 },
    title: { size: 17, line: 22 },
    display: { size: 28, line: 34 },
  },
  android: {
    meta: { size: 12, line: 16 },
    body: { size: 14, line: 20 },
    title: { size: 16, line: 24 },
    display: { size: 24, line: 32 },
  },
};

export const weight: Record<PlatformOS, { regular: '400'; strong: '500' | '600' }> = {
  ios: { regular: '400', strong: '600' },
  android: { regular: '400', strong: '500' },
};

export const mono: Record<PlatformOS, string> = {
  ios: 'Menlo',
  android: 'monospace',
};

export const touch: Record<PlatformOS, number> = {
  ios: 44,
  android: 48,
};

export const glass = {
  tint: 72,
  blur: 24,
  saturate: 180,
} as const;

export const edgeFade = {
  bottom: 24,
  stops: [
    { offset: 0, opacity: 0.8 },
    { offset: 0.5, opacity: 0.4 },
    { offset: 1, opacity: 0 },
  ],
  blur: ['cc', '59', '14', '00'],
  reach: 48,
  curve: 1.6,
  samples: 8,
} as const;

export const pointer = {
  fill: '#ffffff',
  rim: '#0f1115',
};

export const computerClickRipple = {
  left: '#60a5fa',
  right: '#fb923c',
  diameter: 40,
  duration: 300,
  startScale: 0.95,
  expansion: 0.65,
} as const;

export const motion = {
  drawer: 250,
  lift: 500,
} as const;

export type SpringSpeed = 'fast' | 'default' | 'slow';

export interface SpringPhysics {
  mass: number;
  stiffness: number;
  damping: number;
}

function swiftUI(duration: number, bounce: number): SpringPhysics {
  return {
    mass: 1,
    stiffness: ((2 * Math.PI) / duration) ** 2,
    damping: (4 * Math.PI * (1 - bounce)) / duration,
  };
}

function material(dampingRatio: number, stiffness: number): SpringPhysics {
  return { mass: 1, stiffness, damping: 2 * dampingRatio * Math.sqrt(stiffness) };
}

export const springs: Record<
  PlatformOS,
  Record<'spatial' | 'effects', Record<SpringSpeed, SpringPhysics>>
> = {
  ios: {
    spatial: { fast: swiftUI(0.35, 0.15), default: swiftUI(0.5, 0), slow: swiftUI(0.7, 0) },
    effects: { fast: swiftUI(0.2, 0), default: swiftUI(0.3, 0), slow: swiftUI(0.5, 0) },
  },
  android: {
    spatial: { fast: material(0.6, 800), default: material(0.8, 380), slow: material(0.8, 200) },
    effects: { fast: material(1, 3800), default: material(1, 1600), slow: material(1, 800) },
  },
};

export const decelerate: Record<PlatformOS, readonly [number, number, number, number]> = {
  ios: [0, 0, 0.58, 1],
  android: [0.05, 0.7, 0.1, 1],
};

export const popScale = { bubble: 0.92, badge: 0.9 } as const;

export const pullToCompose = { threshold: 40, flick: 0.3 } as const;

export const doubleTap = { window: 300, emoji: '👍' } as const;

export const recentChats = { limit: 3 } as const;

export const workspaceStack = { max: 3, tile: 28, overlap: 10, ring: 2 } as const;

export const swipeOpen = {
  start: 24,
  verticalFail: 8,
  commit: 64,
  flick: 500,
  dim: 0.4,
  settle: 400,
  edgeShadow: {
    light: '-4px 0 12px rgba(15, 17, 21, 0.12)',
    dark: '-4px 0 12px rgba(0, 0, 0, 0.45)',
  },
} as const;

export const swipeReply = {
  start: 12,
  verticalFail: 10,
  commit: 56,
  reach: 72,
  icon: 28,
  bar: 3,
} as const;

export const topEntrance = {
  edge: 20,
  start: 12,
  verticalFail: 16,
  commit: 96,
  flick: 500,
} as const;

export const markdownTable = {
  minColumnWidth: 96,
  maxColumnWidth: 280,
} as const;

export const streamReveal = {
  surfaceDuration: 120,
  duration: 180,
  stagger: 72,
  maxGlyphs: 48,
  maxFreshSpans: 8,
} as const;

export const lift = 0.96;

export const tabMotion = {
  inactiveIconScale: 0.72,
} as const;

export const scrollChrome = { threshold: 12, top: 2 } as const;

export const swipeRow = {
  actionWidth: 80,
  start: 12,
  verticalFail: 12,
  fullRatio: 0.55,
  flick: 1200,
} as const;

export const undoBar = { duration: 5000 } as const;

export const PRESS_TINT = 0.12;

export const scrim = {
  light: 0.32,
  dark: 0.6,
} as const;

export const marketplaceDiscovery = { featuredTopics: 6 } as const;

export const marketplaceArt = {
  aspectRatio: 3,
  cardAvatar: 56,
  profileAvatar: 88,
  avatarEdge: 3,
  cardOverlap: 20,
  profileOverlap: 32,
  menuWidth: 360,
} as const;

export const profileShell = {
  avatar: 72,
  avatarEdge: 3,
  bannerAspect: 3,
  overlap: 28,
  chipOverlap: 12,
  stuckTabsShadow: {
    light: '0 2px 8px rgba(15, 17, 21, 0.12)',
    dark: '0 2px 8px rgba(0, 0, 0, 0.45)',
  },
} as const;

export const channelMedia = {
  columns: 3,
  gap: space.x1,
  typeTile: 44,
} as const;

export const memoryDiff = {
  bar: 4,
  gutter: 40,
  addFill: '1f',
  removeFill: '1a',
  markFill: '4d',
} as const;

export const memoryGrid = {
  columns: 3,
  wideColumns: 5,
  largeColumns: 2,
  wide: 600,
  icon: 28,
  gap: space.x3,
} as const;
