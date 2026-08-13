import Svg, { Circle } from 'react-native-svg';
import { colors } from '../styles/global';

export default function ShutterIcon({ size = 96 }: { size?: number }) {
  return (
    <Svg accessibilityElementsHidden width={size} height={size} viewBox="0 0 96 96" fill="none">
      <Circle cx={48} cy={48} r={45.6} stroke={colors.accent} strokeWidth={4.8} />
      <Circle cx={48} cy={48} r={39.7217} fill="#D9D9D9" />
    </Svg>
  );
}
