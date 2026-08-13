import { BlurView } from 'expo-blur';
import { House, Images, UserRound } from 'lucide-react-native';
import { type RefObject } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import type { MaterialTopTabBarProps } from 'expo-router/js-top-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MiniShutterIcon from './MiniShutterIcon';
import { colors } from '../styles/global';

const labels: Record<string, string> = {
  history: 'Your moments',
  index: 'Home',
  profile: 'Profile'
};

export default function LiquidGlassTabBar({ blurTarget, cameraInView, state, navigation }: MaterialTopTabBarProps & { blurTarget: RefObject<View | null>; cameraInView: boolean }) {
  const insets = useSafeAreaInsets();

  return (
    <View pointerEvents="box-none" style={[styles.host, { bottom: Math.max(insets.bottom, 18) }]}>
      <View style={styles.tabBar}>
        <BlurView blurMethod="dimezisBlurView" blurTarget={blurTarget} intensity={52} tint="dark" style={StyleSheet.absoluteFill} />
        <View pointerEvents="none" style={styles.tint} />
        {state.routes.map((route: { key: string; name: string; params?: object }, index: number) => {
          const focused = state.index === index;
          const label = labels[route.name] || route.name;
          const iconColor = focused ? colors.text : colors.muted;
          const Icon = route.name === 'history' ? Images : route.name === 'profile' ? UserRound : House;
          const onPress = () => {
            const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
            if (!focused && !event.defaultPrevented) navigation.navigate(route.name, route.params);
          };

          return (
            <Pressable
              key={route.key}
              accessibilityLabel={label}
              accessibilityRole="button"
              accessibilityState={{ selected: focused }}
              onPress={onPress}
              style={({ pressed }) => [styles.item, focused && styles.itemActive, pressed && styles.itemPressed]}
            >
              {route.name === 'index' && !cameraInView ? (
                <MiniShutterIcon color={iconColor} accentColor={focused ? colors.accent : colors.muted} />
              ) : (
                <Icon color={iconColor} size={25} strokeWidth={2.4} />
              )}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  host: { position: 'absolute', left: 0, right: 0, zIndex: 20, alignItems: 'center' },
  tabBar: {
    position: 'relative',
    flexDirection: 'row',
    gap: 8,
    padding: 8,
    borderRadius: 38,
    borderCurve: 'continuous',
    overflow: 'hidden',
    backgroundColor: 'rgba(31,28,27,0.3)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    shadowColor: '#000',
    shadowOpacity: 0.28,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 12
  },
  tint: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(31,28,27,0.25)' },
  item: { width: 58, height: 58, alignItems: 'center', justifyContent: 'center', borderRadius: 29, borderCurve: 'continuous' },
  itemActive: { backgroundColor: 'rgba(255,255,255,0.14)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', borderCurve: 'continuous' },
  itemPressed: { transform: [{ scale: 0.96 }] }
});
