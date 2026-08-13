import AsyncStorage from '@react-native-async-storage/async-storage';

function keyForUser(userId: string) {
  return `pocofoto:user-route:${userId}`;
}

export async function getCachedUserRoute(userId: string): Promise<{ coupleId: string | null } | null> {
  try {
    const value = await AsyncStorage.getItem(keyForUser(userId));
    return value ? JSON.parse(value) : null;
  } catch {
    return null;
  }
}

export async function setCachedUserRoute(userId: string, coupleId: string | null) {
  try {
    await AsyncStorage.setItem(keyForUser(userId), JSON.stringify({ coupleId }));
  } catch {
    // Routing still works from the live Firestore listener when storage is unavailable.
  }
}

export async function clearCachedUserRoute(userId: string) {
  try {
    await AsyncStorage.removeItem(keyForUser(userId));
  } catch {
    // Ignore local cache failures; Firestore remains authoritative.
  }
}
