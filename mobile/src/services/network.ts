import NetInfo, { type NetInfoState } from '@react-native-community/netinfo';
import { useEffect, useState } from 'react';

export type ConnectionState = 'online' | 'offline' | 'restored';

export function connectionStateFromNetInfo(state: NetInfoState): ConnectionState {
  return state.isConnected === false ? 'offline' : 'online';
}

export function useConnectionState(): ConnectionState {
  const [status, setStatus] = useState<ConnectionState>('online');

  useEffect(() => {
    let previous: ConnectionState = 'online';
    return NetInfo.addEventListener((next) => {
      const online = connectionStateFromNetInfo(next);
      setStatus(online === 'online' && previous === 'offline' ? 'restored' : online);
      previous = online;
    });
  }, []);

  return status;
}
