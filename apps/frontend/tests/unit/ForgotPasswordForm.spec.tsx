import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { ForgotPasswordForm } from '../../src/features/auth/components/ForgotPasswordForm';
import { simulate } from '../utils/simulate';
import { useRouter } from 'next/navigation';
import { useForgotPassword } from '../../src/features/auth/hooks/useAuth';
import { showToast } from '../../src/shared/utils/toast';

// Mock next-intl
vi.mock('next-intl', () => ({
  useTranslations: (namespace?: string) => (key: string) => {
    if (namespace === 'features.auth.forgot_password') {
      if (key === 'title') return 'Reset Password';
      if (key === 'subtitle') return "We'll send you a link to reset your password";
      if (key === 'email_label') return 'Email Address';
      if (key === 'email_placeholder') return 'you@example.com';
      if (key === 'send_link') return 'Send Reset Link';
      if (key === 'sending_link') return 'Sending Link...';
      if (key === 'back_to_login') return 'Back to Login';
      if (key === 'success.title') return 'Check your email';
      if (key === 'success.message')
        return "If an account exists for that email, we've sent a password reset link. It expires in 30 minutes.";
      if (key === 'success.no_email_prompt')
        return "Didn't receive it? Check the address you entered, or";
      if (key === 'success.create_account') return 'Create an account';
      if (key === 'errors.missing_field_title') return 'Missing field';
      if (key === 'errors.missing_email') return 'Please enter your email address';
      if (key === 'errors.request_failed') return 'Request failed';
    }
    return namespace ? `${namespace}.${key}` : key;
  }
}));

// Mock the hooks and utilities
vi.mock('next/navigation', () => ({
  useRouter: vi.fn(),
}));

vi.mock('../../src/features/auth/hooks/useAuth', () => ({
  useForgotPassword: vi.fn(),
}));

vi.mock('../../src/shared/utils/toast', () => ({
  showToast: {
    error: vi.fn(),
    success: vi.fn(),
    loading: vi.fn(),
  },
}));

describe('ForgotPasswordForm', () => {
  const mockPush = vi.fn();
  const mockForgotPassword = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useRouter).mockReturnValue({
      push: mockPush,
      back: vi.fn(),
      forward: vi.fn(),
      refresh: vi.fn(),
      replace: vi.fn(),
      prefetch: vi.fn(),
    });
    vi.mocked(useForgotPassword).mockReturnValue({
      mutate: mockForgotPassword,
      isPending: false,
      isSuccess: false,
      error: null,
    } as unknown as ReturnType<typeof useForgotPassword>);
  });

  it('renders forgot password form correctly', () => {
    render(<ForgotPasswordForm />);
    expect(screen.getByText(/Reset Password/i)).toBeTruthy();
    expect(screen.getByLabelText(/Email Address/i)).toBeTruthy();
    expect(screen.getByRole('button', { name: /Send Reset Link/i })).toBeTruthy();
  });

  it('updates email field on change', async () => {
    render(<ForgotPasswordForm />);
    const emailInput = screen.getByPlaceholderText(/you@example.com/i) as HTMLInputElement;

    await simulate.type(emailInput, 'test@example.com');

    expect(emailInput.value).toBe('test@example.com');
  });

  it('calls forgotPassword mutation on form submit', async () => {
    render(<ForgotPasswordForm />);
    const emailInput = screen.getByPlaceholderText(/you@example.com/i);
    const submitButton = screen.getByRole('button', { name: /Send Reset Link/i });

    await simulate.type(emailInput, 'test@example.com');
    await simulate.click(submitButton);

    expect(mockForgotPassword).toHaveBeenCalledWith('test@example.com');
  });

  it('shows error toast if email is missing', async () => {
    render(<ForgotPasswordForm />);
    const submitButton = screen.getByRole('button', { name: /Send Reset Link/i });

    await simulate.click(submitButton);

    await waitFor(() => {
      expect(showToast.error).toHaveBeenCalledWith(
        'Missing field',
        'Please enter your email address'
      );
    });
    expect(mockForgotPassword).not.toHaveBeenCalled();
  });

  it('displays success state after successful request', () => {
    vi.mocked(useForgotPassword).mockReturnValue({
      mutate: mockForgotPassword,
      isPending: false,
      isSuccess: true,
      error: null,
    } as unknown as ReturnType<typeof useForgotPassword>);

    render(<ForgotPasswordForm />);

    expect(screen.getByText(/If an account exists for/i)).toBeTruthy();
    expect(screen.getByRole('button', { name: /Create an account/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Back to Login/i })).toBeTruthy();
  });

  it('navigates to signup page when create account link is clicked', async () => {
    vi.mocked(useForgotPassword).mockReturnValue({
      mutate: mockForgotPassword,
      isPending: false,
      isSuccess: true,
      error: null,
    } as unknown as ReturnType<typeof useForgotPassword>);

    render(<ForgotPasswordForm />);
    const createAccountButton = screen.getByRole('button', { name: /Create an account/i });

    await simulate.click(createAccountButton);

    expect(mockPush).toHaveBeenCalledWith('/signup');
  });

  it('navigates to login page when back button is clicked', async () => {
    render(<ForgotPasswordForm />);
    const backButton = screen.getByRole('button', { name: /Back to Login/i });

    await simulate.click(backButton);

    expect(mockPush).toHaveBeenCalledWith('/login');
  });

  it('disables fields and shows spinner when request is pending', () => {
    vi.mocked(useForgotPassword).mockReturnValue({
      mutate: mockForgotPassword,
      isPending: true,
      isSuccess: false,
      error: null,
    } as unknown as ReturnType<typeof useForgotPassword>);

    render(<ForgotPasswordForm />);
    
    expect((screen.getByPlaceholderText(/you@example.com/i) as HTMLInputElement).disabled).toBe(true);
    expect(screen.getByText(/Sending Link.../i)).toBeTruthy();
    expect(screen.getByRole('status')).toBeTruthy();
  });
});
