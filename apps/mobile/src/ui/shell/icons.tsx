import type { ColorValue } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';

type IconProps = { color: ColorValue; size: number; focused?: boolean };

function Glyph({ d, color, size, focused = false }: IconProps & { d: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d={d}
        stroke={color}
        fill={color}
        fillOpacity={focused ? 0.15 : 0}
        strokeWidth={1.8}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </Svg>
  );
}

export function ChatsIcon(props: IconProps) {
  return (
    <Glyph
      {...props}
      d="M5 5h14a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1h-8l-4 3.5V16H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Z"
    />
  );
}

export function ActivityIcon(props: IconProps) {
  return <Glyph {...props} d="M6 16V11a6 6 0 1 1 12 0v5l1.5 2h-15L6 16Zm4 4a2 2 0 0 0 4 0" />;
}

export function PersonIcon(props: IconProps) {
  return <Glyph {...props} d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-7.5 8a7.5 7.5 0 0 1 15 0" />;
}

export function ChevronDownIcon(props: IconProps) {
  return <Glyph {...props} d="m6 9 6 6 6-6" />;
}

export function ChevronLeftIcon(props: IconProps) {
  return <Glyph {...props} d="m15 6-6 6 6 6" />;
}

export function ChevronRightIcon(props: IconProps) {
  return <Glyph {...props} d="m9 6 6 6-6 6" />;
}

export function ChevronUpIcon(props: IconProps) {
  return <Glyph {...props} d="m6 15 6-6 6 6" />;
}

export function LockIcon(props: IconProps) {
  return (
    <Glyph
      {...props}
      d="M7 11h10a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1v-7a1 1 0 0 1 1-1Zm2 0V8a3 3 0 0 1 6 0v3"
    />
  );
}

export function ArrowUpIcon(props: IconProps) {
  return <Glyph {...props} d="M12 19V5m-6 6 6-6 6 6" />;
}

export function PlusIcon(props: IconProps) {
  return <Glyph {...props} d="M12 5v14M5 12h14" />;
}

export function GitCommitIcon(props: IconProps) {
  return <Glyph {...props} d="M3 12h5m8 0h5m-5 0a4 4 0 1 1-8 0 4 4 0 0 1 8 0" />;
}

export function CloseIcon(props: IconProps) {
  return <Glyph {...props} d="m7 7 10 10M17 7 7 17" />;
}

export function PhotoIcon(props: IconProps) {
  return (
    <Glyph
      {...props}
      d="M5 5h14a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Zm-1 11 4.5-4.5 4 4 2.5-2.5 5 5M15.5 9.5h.01"
    />
  );
}

export function CameraIcon(props: IconProps) {
  return (
    <Glyph
      {...props}
      d="M4 8a1 1 0 0 1 1-1h3l1.5-2h5L16 7h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V8Zm8 8.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z"
    />
  );
}

export function FileIcon(props: IconProps) {
  return (
    <Glyph {...props} d="M7 3h7l5 5v12a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Zm7 0v5h5" />
  );
}

export function MessageIcon(props: IconProps) {
  return (
    <Glyph
      {...props}
      d="M5 5h14a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1h-7l-4 3v-3H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Z"
    />
  );
}

export function MicIcon(props: IconProps) {
  return (
    <Glyph
      {...props}
      d="M12 3a3 3 0 0 1 3 3v6a3 3 0 0 1-6 0V6a3 3 0 0 1 3-3Zm-6 9a6 6 0 0 0 12 0m-6 6v3"
    />
  );
}

export function ComputerIcon(props: IconProps) {
  return (
    <Glyph
      {...props}
      d="M4 5h16a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Zm5 15h6m-3-3v3"
    />
  );
}

export function BrowserIcon(props: IconProps) {
  return (
    <Glyph
      {...props}
      d="M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm-9 9h18M12 3c2.5 2.5 3.5 5.5 3.5 9s-1 6.5-3.5 9c-2.5-2.5-3.5-5.5-3.5-9s1-6.5 3.5-9Z"
    />
  );
}

export function KeyboardIcon(props: IconProps) {
  return (
    <Glyph
      {...props}
      d="M4 6h16a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1Zm3 4h.01M11 10h.01M15 10h.01M7 14h10"
    />
  );
}

export function RecordingStopIcon({ color, size }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d="M8 7h8a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1Z"
        fill={color}
      />
    </Svg>
  );
}

export function CopyIcon(props: IconProps) {
  return (
    <Glyph
      {...props}
      d="M9 9h9a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1zM5 15H4.5A.5.5 0 0 1 4 14.5V5a1 1 0 0 1 1-1h9.5a.5.5 0 0 1 .5.5V5"
    />
  );
}

export function ShareIcon(props: IconProps) {
  return <Glyph {...props} d="M12 15V4M8 8l4-4 4 4M6 12v7a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1v-7" />;
}

export function FolderIcon(props: IconProps) {
  return (
    <Glyph
      {...props}
      d="M4 6a1 1 0 0 1 1-1h4.5l2 2H19a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6Z"
    />
  );
}

export function MouseIcon(props: IconProps) {
  return <Glyph {...props} d="M12 3a6 6 0 0 1 6 6v6a6 6 0 0 1-12 0V9a6 6 0 0 1 6-6Zm0 3v4" />;
}

export function ControlsIcon(props: IconProps) {
  return <Glyph {...props} d="M4 7h9m4 0h3M4 17h3m4 0h9M15 5v4M9 15v4" />;
}

export function KeyboardHideIcon(props: IconProps) {
  return (
    <Glyph
      {...props}
      d="M4 4h16a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1Zm3 4h.01M11 8h.01M15 8h.01M8 11h8m-6 6 2 2 2-2"
    />
  );
}

export function MouseButtonIcon({
  color,
  size,
  side,
  mark,
}: IconProps & { side: 'left' | 'right'; mark: ColorValue }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d={side === 'left' ? 'M12 4a5 5 0 0 0-5 5v1h5V4Z' : 'M12 4a5 5 0 0 1 5 5v1h-5V4Z'}
        fill={mark}
      />
      <Path
        d="M12 3a6 6 0 0 1 6 6v6a6 6 0 0 1-12 0V9a6 6 0 0 1 6-6Zm-6 7h12M12 3v7"
        stroke={color}
        strokeWidth={1.8}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </Svg>
  );
}

export function PointerArrow({
  size,
  fill,
  rim,
}: {
  size: number;
  fill: ColorValue;
  rim: ColorValue;
}) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d="M3 2v18l5-4.6 3.3 7.2 3-1.4-3.2-7H18L3 2Z"
        fill={fill}
        stroke={rim}
        strokeWidth={1.5}
        strokeLinejoin="round"
      />
    </Svg>
  );
}

export function HandBackIcon(props: IconProps) {
  return <Glyph {...props} d="M14 4h4a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-4M10 8l-4 4 4 4M6 12h10" />;
}

export function MoreIcon({ color, size }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Circle cx={12} cy={5.5} r={1.8} fill={color} />
      <Circle cx={12} cy={12} r={1.8} fill={color} />
      <Circle cx={12} cy={18.5} r={1.8} fill={color} />
    </Svg>
  );
}

export function CpuIcon(props: IconProps) {
  return (
    <Glyph
      {...props}
      d="M8 6h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2Zm2 4h4v4h-4v-4ZM10 3v3m4-3v3m-4 12v3m4-3v3M3 10h3m-3 4h3m12-4h3m-3 4h3"
    />
  );
}

export function CheckIcon(props: IconProps) {
  return <Glyph {...props} d="m5 12.5 4.5 4.5L19 7.5" />;
}
