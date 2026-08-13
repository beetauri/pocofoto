import { Redirect } from 'expo-router';
import { Image, Text, View } from 'react-native';
import { useApp } from '../src/state/AppProvider';
import AuthScreen from '../src/screens/AuthScreen';
import { colors, globalStyles, spacing } from '../src/styles/global';

function LoadingScreen() {
  return (
    <View style={[globalStyles.screen, globalStyles.centered, { gap: spacing.lg }]}>
      <Image source={require('../assets/pocoface-icon-1024.png')} style={{ width: 88, height: 88, borderRadius: 24 }} />
      <Text style={{ color: colors.text, fontSize: 24, fontWeight: '800' }}>Pocofoto</Text>
    </View>
  );
}

export default function IndexRoute() {
  const { user, coupleId, pairStateKnown, loading } = useApp();
  if (loading) return <LoadingScreen />;
  if (!user) return <AuthScreen />;
  if (!pairStateKnown) return <LoadingScreen />;
  if (!coupleId) return <Redirect href="/pairing" />;
  return <Redirect href="/(main)" />;
}
