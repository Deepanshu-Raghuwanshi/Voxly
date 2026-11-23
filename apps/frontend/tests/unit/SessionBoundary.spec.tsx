import React from 'react';
import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { AxiosError, type AxiosResponse, type InternalAxiosRequestConfig } from 'axios';
import { useQueryClient } from '@tanstack/react-query';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import type { UserProfile } from '@shared-types';
import { SessionBoundary } from '../../src/features/auth/components/SessionBoundary';
import { useAuthStore } from '../../src/features/auth/store/useAuthStore';
import { useChatStore } from '../../src/features/chat/store/useChatStore';
import TanstackProvider from '../../src/core/providers/TanstackProvider';
import apiClient from '../../src/shared/lib/apiClient';
import { getLoginDestination } from '../../src/features/auth/utils/session-routes';
import { renderWithIntl } from '../utils/render';

const navigation = vi.hoisted(() => ({
  path: '/chat/conversation-1',
  replace: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  usePathname: () => navigation.path,
  useRouter: () => navigation,
}));

const profile = { id: 'user-1', email: 'user@example.com' } as UserProfile;
const originalAdapter = apiClient.defaults.adapter;

function response(config: InternalAxiosRequestConfig, status: number, data?: unknown) {
  const result: AxiosResponse = { config, status, data, statusText: String(status), headers: {} };
  if (status >= 400) throw new AxiosError('Request failed', 'ERR_BAD_REQUEST', config, undefined, result);
  return result;
}

function renderBoundary() {
  return renderWithIntl(
    <TanstackProvider>
      <SessionBoundary><div>Page content</div></SessionBoundary>
    </TanstackProvider>,
  );
}

describe('SessionBoundary', () => {
  beforeEach(() => {
    navigation.path = '/chat/conversation-1';
    navigation.replace.mockClear();
    useAuthStore.setState(useAuthStore.getInitialState());
  });

  afterEach(() => {
    apiClient.defaults.adapter = originalAdapter;
    localStorage.clear();
    window.history.replaceState(null, '', '/');
  });

  it('waits for a verified profile instead of using the legacy browser state', async () => {
    localStorage.setItem('auth-storage', JSON.stringify({ state: { isAuthenticated: true } }));
    let finish!: () => void;
    const adapter = vi.fn((config: InternalAxiosRequestConfig) =>
      new Promise<AxiosResponse>((resolve) => {
        finish = () => resolve(response(config, 200, profile));
      }),
    );
    apiClient.defaults.adapter = adapter;

    renderBoundary();
    expect(screen.queryByText('Page content')).toBeNull();
    expect(screen.getByRole('status').textContent).toContain('Checking your session');
    expect(localStorage.getItem('auth-storage')).toBeNull();
    await act(async () => finish());
    expect(await screen.findByText('Page content')).toBeTruthy();
    expect(adapter).toHaveBeenCalledOnce();
    expect(useAuthStore.getState().user).toEqual(profile);
  });

  it('refreshes an expired access cookie and resumes the requested route', async () => {
    let refreshed = false;
    const requests: string[] = [];
    apiClient.defaults.adapter = async (config) => {
      requests.push(config.url!);
      if (config.url === '/auth/refresh') {
        refreshed = true;
        return response(config, 201, { id: profile.id });
      }
      return response(config, refreshed ? 200 : 401, profile);
    };

    renderBoundary();
    expect(await screen.findByText('Page content')).toBeTruthy();
    expect(requests).toEqual(['/profile', '/auth/refresh', '/profile']);
    expect(navigation.replace).not.toHaveBeenCalled();
  });

  it('preserves a protected deep link when the refresh session is invalid', async () => {
    window.history.replaceState(null, '', '/chat/conversation-1?from=friends#latest');
    apiClient.defaults.adapter = async (config) => response(config, 401);

    renderBoundary();
    await waitFor(() => expect(navigation.replace).toHaveBeenCalledWith(
      '/login?redirect=%2Fchat%2Fconversation-1%3Ffrom%3Dfriends%23latest',
    ));
    expect(screen.queryByText('Page content')).toBeNull();
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
    expect(getLoginDestination('?redirect=%2Fchat%2Fconversation-1%3Ffrom%3Dfriends%23latest'))
      .toBe('/chat/conversation-1?from=friends#latest');
    expect(getLoginDestination('?redirect=%2F%2Fexample.com')).toBe('/friends');
  });

  it('offers retry on a temporary refresh failure without signing the user out', async () => {
    navigation.path = '/friends';
    let unavailable = true;
    apiClient.defaults.adapter = async (config) => response(config,
      unavailable ? (config.url === '/profile' ? 401 : 503) : 200, profile);

    renderBoundary();
    expect((await screen.findByRole('alert')).textContent).toBe('Could not verify your session.');
    expect(navigation.replace).not.toHaveBeenCalled();
    expect(useAuthStore.getState().hasCheckedSession).toBe(false);
    unavailable = false;
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('Page content')).toBeTruthy();
  });

  it('lets a signed-out visitor see the home page', async () => {
    navigation.path = '/';
    const adapter = vi.fn(async (config: InternalAxiosRequestConfig) => response(config, 401));
    apiClient.defaults.adapter = adapter;

    renderBoundary();
    expect(await screen.findByText('Page content')).toBeTruthy();
    expect(navigation.replace).not.toHaveBeenCalled();
    expect(adapter).toHaveBeenCalledTimes(2);
  });

  it('renders public auth routes without checking the session', () => {
    navigation.path = '/reset-password';
    const adapter = vi.fn();
    apiClient.defaults.adapter = adapter;

    renderBoundary();
    expect(screen.getByText('Page content')).toBeTruthy();
    expect(adapter).not.toHaveBeenCalled();
  });

  it('shares one refresh and clears private state if even the one permitted retry gets 401', async () => {
    const requests: string[] = [];
    useAuthStore.getState().setUser(profile);
    let hadPrivateCache = false;
    const CacheProbe = () => {
      const client = useQueryClient();
      return <button onClick={() => {
        if (!hadPrivateCache) {
          hadPrivateCache = true;
          client.setQueryData(['messages', 'conv'], ['private history']);
          useChatStore.getState().setDraft('conv', 'private draft');
        } else {
          expect(client.getQueryData(['messages', 'conv'])).toBeUndefined();
        }
      }}>Check cache</button>;
    };
    let releaseRefresh!: () => void;
    apiClient.defaults.adapter = async (config) => {
      requests.push(config.url!);
      if (config.url !== '/auth/refresh') return response(config, 401);
      await new Promise<void>((resolve) => { releaseRefresh = resolve; });
      return response(config, 201, profile);
    };

    renderWithIntl(
      <TanstackProvider>
        <CacheProbe />
        <SessionBoundary><div>Private content</div></SessionBoundary>
      </TanstackProvider>,
    );
    fireEvent.click(screen.getByText('Check cache'));
    const requestsSettled = Promise.allSettled([apiClient.get('/profile'), apiClient.get('/friends')]);
    await waitFor(() => expect(releaseRefresh).toBeTypeOf('function'));
    await act(async () => {
      releaseRefresh();
      const results = await requestsSettled;
      expect(results.map(({ status }) => status)).toEqual(['rejected', 'rejected']);
    });

    expect(requests.filter((path) => path === '/auth/refresh')).toHaveLength(1);
    expect(requests.filter((path) => path === '/profile')).toHaveLength(2);
    expect(requests.filter((path) => path === '/friends')).toHaveLength(2);
    expect(screen.queryByText('Private content')).toBeNull();
    expect(useChatStore.getState().draftMessages).toEqual({});
    fireEvent.click(screen.getByText('Check cache'));
  });
});
