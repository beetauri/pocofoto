import * as Haptics from 'expo-haptics';

export async function triggerHaptic(kind: 'tap' | 'success'): Promise<boolean> {
  try {
    if (kind === 'success') {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } else {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    return true;
  } catch {
    return false;
  }
}
