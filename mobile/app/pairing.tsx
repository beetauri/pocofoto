import { Redirect } from 'expo-router';
import PairingScreen from '../src/screens/PairingScreen';
import { useApp } from '../src/state/AppProvider';

export default function PairingRoute() {
  const { user, coupleId, pairStateKnown, loading } = useApp();
  if (!user) return <Redirect href="/" />;
  if (!loading && pairStateKnown && coupleId) return <Redirect href="/(main)" />;
  return <PairingScreen />;
}
