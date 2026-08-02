import React from 'react';
import { screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Navbar } from '../../src/shared/components/Navbar';
import { renderWithIntl } from '../utils/render';
import { useAuthStore } from '../../src/features/auth/store/useAuthStore';
import { useLogout } from '../../src/features/auth/hooks/useAuth';
import { usePathname } from 'next/navigation';
import { useTotalUnreadCount } from '../../src/features/chat/hooks/useChat';

// Mock the dependencies
vi.mock('../../src/features/auth/store/useAuthStore');
vi.mock('../../src/features/auth/hooks/useAuth');
vi.mock('next/navigation');
vi.mock('../../src/features/chat/hooks/useChat');

describe('Navbar Component', () => {
  const mockUser = {
    email: 'test@example.com',
    username: 'testuser',
    fullName: 'Test User'
  };

  beforeEach(() => {
    vi.mocked(useTotalUnreadCount).mockReturnValue(0);
  });

  it('should not render when not authenticated', () => {
    vi.mocked(useAuthStore).mockReturnValue({ isAuthenticated: false, user: null } as unknown as ReturnType<typeof useAuthStore>);
    vi.mocked(useLogout).mockReturnValue({ mutate: vi.fn(), isPending: false } as unknown as ReturnType<typeof useLogout>);
    vi.mocked(usePathname).mockReturnValue('/');

    const { container } = renderWithIntl(<Navbar />);
    expect(container.firstChild).toBeNull();
  });

  it('should render icons and avatar when authenticated', () => {
    vi.mocked(useAuthStore).mockReturnValue({ isAuthenticated: true, user: mockUser } as unknown as ReturnType<typeof useAuthStore>);
    vi.mocked(useLogout).mockReturnValue({ mutate: vi.fn(), isPending: false } as unknown as ReturnType<typeof useLogout>);
    vi.mocked(usePathname).mockReturnValue('/chat');

    renderWithIntl(<Navbar />);

    // Check for Home icon link (by title)
    const homeLink = screen.getByTitle(/home/i);
    expect(homeLink).toBeTruthy();
    expect(homeLink.getAttribute('href')).toBe('/chat');

    // Check for Friends icon link
    const friendsLink = screen.getByTitle(/friends/i);
    expect(friendsLink).toBeTruthy();
    expect(friendsLink.getAttribute('href')).toBe('/friends');

    // Check for Logout button icon
    const logoutBtn = screen.getByTitle(/logout/i);
    expect(logoutBtn).toBeTruthy();

    // Check for Avatar with initials of fullName
    const avatar = screen.getByText(/tu/i); // First letters of "Test User" is TU
    expect(avatar).toBeTruthy();
    expect(avatar.parentElement?.className).toContain('rounded-full');

    // Ensure no "Online" text is present
    expect(screen.queryByText(/online/i)).toBeNull();
    
    // Ensure no app name text is visible
    expect(screen.queryByText(/chat app/i)).toBeNull();
  });

  it('should show spinner in logout button when pending', () => {
    vi.mocked(useAuthStore).mockReturnValue({ isAuthenticated: true, user: mockUser } as unknown as ReturnType<typeof useAuthStore>);
    vi.mocked(useLogout).mockReturnValue({ mutate: vi.fn(), isPending: true } as unknown as ReturnType<typeof useLogout>);
    vi.mocked(usePathname).mockReturnValue('/chat');

    renderWithIntl(<Navbar />);
    
    // Check for spinner
    const logoutBtn = screen.getByTitle(/logout/i);
    expect(logoutBtn.querySelector('svg.animate-spin')).toBeTruthy();
  });

  describe('unread badge', () => {
    beforeEach(() => {
      vi.mocked(useAuthStore).mockReturnValue({ isAuthenticated: true, user: mockUser } as unknown as ReturnType<typeof useAuthStore>);
      vi.mocked(useLogout).mockReturnValue({ mutate: vi.fn(), isPending: false } as unknown as ReturnType<typeof useLogout>);
      vi.mocked(usePathname).mockReturnValue('/friends');
    });

    it('should not render a badge when there are no unread messages', () => {
      vi.mocked(useTotalUnreadCount).mockReturnValue(0);

      renderWithIntl(<Navbar />);

      expect(screen.queryByLabelText(/unread message/i)).toBeNull();
    });

    it('should render the unread count on the chat icon', () => {
      vi.mocked(useTotalUnreadCount).mockReturnValue(4);

      renderWithIntl(<Navbar />);

      const badge = screen.getByLabelText(/4 unread messages/i);
      expect(badge.textContent).toBe('4');
    });

    it('should cap the displayed count at 99+', () => {
      vi.mocked(useTotalUnreadCount).mockReturnValue(150);

      renderWithIntl(<Navbar />);

      expect(screen.getByLabelText(/150 unread messages/i).textContent).toBe('99+');
    });
  });
});
