import type { ColorValue } from 'react-native';
import Svg, { Path } from 'react-native-svg';

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

export function HomeIcon(props: IconProps) {
  return (
    <Glyph
      {...props}
      d="M4 10.5 12 4l8 6.5V19a1 1 0 0 1-1 1h-4.5v-5.5h-5V20H5a1 1 0 0 1-1-1v-8.5Z"
    />
  );
}

export function ActivityIcon(props: IconProps) {
  return <Glyph {...props} d="M6 16V11a6 6 0 1 1 12 0v5l1.5 2h-15L6 16Zm4 4a2 2 0 0 0 4 0" />;
}

export function MeIcon(props: IconProps) {
  return <Glyph {...props} d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-7.5 8a7.5 7.5 0 0 1 15 0" />;
}

export function NeedsYouIcon(props: IconProps) {
  return (
    <Glyph
      {...props}
      d="M5 5h14a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1h-7l-4 3v-3H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Zm7 3v4m0 3h.01"
    />
  );
}

export function WorkingIcon(props: IconProps) {
  return (
    <Glyph
      {...props}
      d="M12 3v3m0 12v3M3 12h3m12 0h3M5.6 5.6l2.1 2.1m8.6 8.6 2.1 2.1M5.6 18.4l2.1-2.1m8.6-8.6 2.1-2.1"
    />
  );
}

export function StopIcon(props: IconProps) {
  return (
    <Glyph
      {...props}
      focused
      d="M8 7h8a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1Z"
    />
  );
}

export function ChevronDownIcon(props: IconProps) {
  return <Glyph {...props} d="m6 9 6 6 6-6" />;
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
