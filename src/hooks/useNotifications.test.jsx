import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { useNotifications } from './useNotifications';

const user = { uid: 'u1' };

function noopClient(overrides = {}) {
  return {
    getStatus: vi.fn(() => ({ permission: 'default', enabled: false, supported: true })),
    syncGrantedPermission: vi.fn().mockResolvedValue({ status: 'default' }),
    enable: vi.fn().mockResolvedValue({ status: 'registered' }),
    disable: vi.fn().mockResolvedValue({ status: 'disabled' }),
    cleanupBeforeLogout: vi.fn().mockResolvedValue({ status: 'disabled' }),
    getDiagnostics: vi.fn().mockResolvedValue({}),
    testThisDevice: vi.fn().mockResolvedValue({ outcome: 'sent' }),
    testPartnerDevices: vi.fn().mockResolvedValue({ outcome: 'sent' }),
    ...overrides
  };
}

describe('useNotifications', () => {
  it('silently syncs a granted returning user and shows no prompt', async () => {
    const client = noopClient({
      getStatus: vi.fn(() => ({ permission: 'granted', enabled: true, supported: true })),
      syncGrantedPermission: vi.fn().mockResolvedValue({ status: 'registered' })
    });
    const store = { isPromptDismissed: vi.fn(() => false), dismissPrompt: vi.fn(), rememberEvent: vi.fn(() => true) };

    const { result } = renderHook(() => useNotifications({
      user,
      paired: true,
      online: true,
      client,
      store
    }));

    await waitFor(() => expect(client.syncGrantedPermission).toHaveBeenCalledOnce());
    expect(result.current.showPrompt).toBe(false);
    expect(result.current.status.permission).toBe('granted');
  });

  it('shows the one-time prompt to paired users with default permission', () => {
    const client = noopClient({ getStatus: vi.fn(() => ({ permission: 'default', enabled: false, supported: true })) });
    const store = { isPromptDismissed: vi.fn(() => false), dismissPrompt: vi.fn(), rememberEvent: vi.fn(() => true) };

    const { result } = renderHook(() => useNotifications({
      user,
      paired: true,
      online: true,
      client,
      store
    }));

    expect(result.current.showPrompt).toBe(true);
  });

  it('does not show the automatic prompt to unpaired users', () => {
    const client = noopClient();
    const store = { isPromptDismissed: vi.fn(() => false), dismissPrompt: vi.fn(), rememberEvent: vi.fn(() => true) };
    const { result } = renderHook(() => useNotifications({
      user,
      paired: false,
      online: true,
      client,
      store
    }));

    expect(result.current.showPrompt).toBe(false);
  });

  it('permanently dismisses the prompt for this user and device', () => {
    const store = { isPromptDismissed: vi.fn(() => false), dismissPrompt: vi.fn(), rememberEvent: vi.fn(() => true) };
    const client = noopClient();
    const { result } = renderHook(() => useNotifications({
      user,
      paired: true,
      online: true,
      client,
      store
    }));

    act(() => result.current.dismissPrompt());

    expect(store.dismissPrompt).toHaveBeenCalledWith('u1');
    expect(result.current.showPrompt).toBe(false);
  });

  it('deduplicates foreground notification events', () => {
    const store = { isPromptDismissed: vi.fn(() => false), dismissPrompt: vi.fn(), rememberEvent: vi.fn(() => false) };
    const client = noopClient();
    const { result } = renderHook(() => useNotifications({
      user,
      paired: true,
      online: true,
      client,
      store
    }));

    act(() => result.current.handleForegroundMessage({ data: { eventId: 'e1', body: 'New photo' } }));

    expect(result.current.foregroundMessage).toBe('');
  });
});
