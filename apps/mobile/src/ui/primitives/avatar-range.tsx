import { PercentageSlider } from './percentage-slider';

export interface AvatarRangeProps {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange(value: number): void;
}

export function AvatarRange({ label, value, min, max, onChange }: AvatarRangeProps) {
  return (
    <PercentageSlider
      label={`${label} ${value}`}
      value={((value - min) * 100) / (max - min)}
      onChange={(percent) => onChange(Math.round(min + ((max - min) * percent) / 100))}
    />
  );
}
