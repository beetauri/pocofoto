import Svg, { Circle, Path } from 'react-native-svg';
import { colors } from '../styles/global';

export default function MiniShutterIcon({
  color = colors.muted,
  accentColor = colors.accent,
  size = 28
}: {
  color?: string;
  accentColor?: string;
  size?: number;
}) {
  const center = size / 2;
  const outerRadius = size * 0.43;
  const innerRadius = size * 0.26;
  return (
    <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} accessibilityLabel="Camera">
      <Circle cx={center} cy={center} r={outerRadius} fill="none" stroke={color} strokeWidth={size * 0.11} />
      <Circle cx={center} cy={center} r={innerRadius} fill="none" stroke={accentColor} strokeWidth={size * 0.07} />
      <Path
        d={`M ${center} ${center - size * 0.14} L ${center + size * 0.14} ${center} L ${center} ${center + size * 0.14} L ${center - size * 0.14} ${center} Z`}
        fill={color}
        opacity={0.9}
      />
    </Svg>
  );
}
