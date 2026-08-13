import ShutterIcon from './ShutterIcon';
import { colors } from '../styles/global';

export default function MiniShutterIcon({
  color = colors.muted,
  accentColor = colors.accent,
  size = 42
}: {
  color?: string;
  accentColor?: string;
  size?: number;
}) {
  void color;
  void accentColor;
  return <ShutterIcon size={size} />;
}
