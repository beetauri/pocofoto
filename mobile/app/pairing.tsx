import { Redirect } from 'expo-router';
import PairingScreen from '../src/screens/PairingScreen';
import { useAppBase } from '../src/state/AppProvider';

export default function PairingRoute() {
  const { user, coupleId, pairStateKnown, loading } = useAppBase();
  if (!user) return <Redirect href="/" />;
  if (!loading && pairStateKnown && coupleId) return <Redirect href="/(main)" />;
  return <PairingScreen />;
}
