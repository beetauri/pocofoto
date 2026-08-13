import { describe, expect, it } from 'vitest';
import { shouldShowNativeNotificationPrompt } from './notificationPrompt';

describe('native notification prompt', () => {
  it('only shows for a paired user who has not enabled or dismissed notifications', () => {
    expect(shouldShowNativeNotificationPrompt({ paired: true, permission: 'unknown', enabled: false, dismissed: false })).toBe(true);
    expect(shouldShowNativeNotificationPrompt({ paired: false, permission: 'unknown', enabled: false, dismissed: false })).toBe(false);
    expect(shouldShowNativeNotificationPrompt({ paired: true, permission: 'granted', enabled: false, dismissed: false })).toBe(false);
    expect(shouldShowNativeNotificationPrompt({ paired: true, permission: 'unknown', enabled: false, dismissed: true })).toBe(false);
  });
});
