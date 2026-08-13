export type NativeNotificationPermission = 'granted' | 'denied' | 'unknown' | 'unsupported';

export function shouldShowNativeNotificationPrompt({
  paired,
  permission,
  enabled,
  dismissed
}: {
  paired: boolean;
  permission: NativeNotificationPermission;
  enabled: boolean;
  dismissed: boolean;
}) {
  return paired && permission === 'unknown' && !enabled && !dismissed;
}
