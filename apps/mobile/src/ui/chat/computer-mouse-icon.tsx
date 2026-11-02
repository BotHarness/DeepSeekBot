import type { ColorValue } from 'react-native';
import Svg, { Path, Rect } from 'react-native-svg';

export function ComputerMouseIcon({
  button,
  size,
  color,
}: {
  button: 'left' | 'right' | 'scroll';
  size: number;
  color: ColorValue;
}) {
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      pointerEvents="none"
      accessible={false}
    >
      {button === 'scroll' ? (
        <Rect x="10" y="4" width="4" height="5" rx="2" fill={color} />
      ) : (
        <Path
          fill={color}
          d={button === 'left' ? 'M12 2a7 7 0 0 0-7 7v1h7Z' : 'M12 2a7 7 0 0 1 7 7v1h-7Z'}
        />
      )}
      <Rect x="5" y="2" width="14" height="20" rx="7" stroke={color} strokeWidth="1.8" />
      <Path
        d={button === 'scroll' ? 'M12 2v2M12 9v1M5 10h14' : 'M12 2v8M5 10h14'}
        stroke={color}
        strokeWidth="1.8"
      />
    </Svg>
  );
}
