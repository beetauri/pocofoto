import { Redirect, useRouter } from 'expo-router';
import { TopTabs } from 'expo-router/js-top-tabs';
import { useEffect } from 'react';
import type { MaterialTopTabBarProps } from 'expo-router/js-top-tabs';
import LiquidGlassTabBar from '../../src/components/LiquidGlassTabBar';
import { useNotifications } from '../../src/hooks/useNotifications';
import { PhotosProvider } from '../../src/state/PhotosProvider';
import { useApp } from '../../src/state/AppProvider';
import { MainUiProvider, useMainUi } from '../../src/state/MainUiProvider';
import { colors } from '../../src/styles/global';

function MainTabBar(props: MaterialTopTabBarProps) {
  const { cameraInView } = useMainUi();
  return <LiquidGlassTabBar {...props} cameraInView={cameraInView} />;
}

export default function MainLayout() {
  return <MainLayoutContent />;
}

function MainLayoutContent() {
  const { user, coupleId, loading } = useApp();
  const { notificationIntent, clearNotificationIntent } = useNotifications();
  const router = useRouter();
  useEffect(() => {
    const intent = notificationIntent;
    if (!intent) return;
    if (intent.type === 'photo') {
      router.replace({ pathname: '/(main)', params: { photoId: intent.photoId } });
    }
    clearNotificationIntent();
  }, [clearNotificationIntent, notificationIntent, router]);
  if (!loading && (!user || !coupleId)) return <Redirect href={user ? '/pairing' : '/'} />;
  return (
    <PhotosProvider>
      <MainUiProvider>
        <TopTabs
          initialRouteName="index"
          tabBar={(props: MaterialTopTabBarProps) => <MainTabBar {...props} />}
          screenOptions={{
            headerShown: false,
            sceneStyle: { backgroundColor: colors.background },
            swipeEnabled: true,
            animationEnabled: true,
            tabBarShowLabel: false,
            tabBarStyle: { backgroundColor: 'transparent', elevation: 0 }
          }}
        >
          <TopTabs.Screen name="history" options={{ title: 'Your moments' }} />
          <TopTabs.Screen name="index" options={{ title: 'Home' }} />
          <TopTabs.Screen name="profile" options={{ title: 'Profile' }} />
        </TopTabs>
      </MainUiProvider>
    </PhotosProvider>
  );
}
