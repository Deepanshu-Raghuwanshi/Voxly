import React from 'react';
import { render, screen, waitFor } from "@testing-library/react";
import { vi, describe, it, expect, beforeEach } from "vitest";
import { LoginForm } from "../../src/features/auth/components/LoginForm";
import { simulate } from "../utils/simulate";
import { useRouter } from "next/navigation";
import {
  useLogin,
  useForgotPassword,
  useResendVerification,
} from "../../src/features/auth/hooks/useAuth";
import { showToast } from "../../src/shared/utils/toast";

// Mock next-intl
vi.mock('next-intl', () => ({
  useTranslations: (namespace?: string) => (key: string) => {
    // Simple mock that returns the key or a portion of it
    if (key === 'title') return 'Welcome Back';
    if (key === 'subtitle') return 'Sign in to your account';
    if (key === 'email_label') return 'Email Address';
    if (key === 'password_label') return 'Password';
    if (key === 'forgot_password') return 'Forgot?';
    if (key === 'sign_in') return 'Sign In';
    if (key === 'signing_in') return 'Signing in...';
    if (key === 'or_continue_with') return 'Or continue with';
    if (key === 'google_login') return 'Google';
    if (key === 'no_account') return "Don't have an account?";
    if (key === 'sign_up') return 'Sign Up';
    if (key === 'email_placeholder') return 'you@example.com';
    if (key === 'password_placeholder') return 'Enter your password';
    if (key === 'buttons.sending') return 'Sending...';
    if (key === 'errors.missing_fields') return 'Missing fields';
    if (key === 'errors.error') return 'Error';
    if (key === 'toasts.login_failed') return 'Login failed';
    if (key === 'toasts.email_sent') return 'Email sent';
    if (key === 'toasts.google_redirect') return 'Redirecting to Google...';

    // If namespace is provided, return full key
    return namespace ? `${namespace}.${key}` : key;
  }
}));

// Mock the hooks and utilities
vi.mock("next/navigation", () => ({
  useRouter: vi.fn(),
}));

vi.mock("../../src/features/auth/hooks/useAuth", () => ({
  useLogin: vi.fn(),
  useForgotPassword: vi.fn(),
  useResendVerification: vi.fn(),
}));

vi.mock("../../src/shared/utils/toast", () => ({
  showToast: {
    error: vi.fn(),
    success: vi.fn(),
    loading: vi.fn(),
  },
}));

describe("LoginForm", () => {
  const mockPush = vi.fn();
  const mockLogin = vi.fn();
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
    vi.mocked(useLogin).mockReturnValue({
      mutate: mockLogin,
      isPending: false,
      error: null,
    } as unknown as ReturnType<typeof useLogin>);
    vi.mocked(useForgotPassword).mockReturnValue({
      mutate: mockForgotPassword,
      isPending: false,
    } as unknown as ReturnType<typeof useForgotPassword>);
    vi.mocked(useResendVerification).mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
    } as unknown as ReturnType<typeof useResendVerification>);
  });

  it("renders login form correctly", () => {
    render(<LoginForm />);
    expect(screen.getByText(/Welcome Back/i)).toBeTruthy();
    expect(screen.getByLabelText(/Email Address/i)).toBeTruthy();
    expect(screen.getByLabelText(/Password/i)).toBeTruthy();
    expect(screen.getByRole("button", { name: /Sign In/i })).toBeTruthy();
  });

  it("updates email and password fields on change", async () => {
    render(<LoginForm />);
    const emailInput = screen.getByPlaceholderText(
      /you@example.com/i,
    ) as HTMLInputElement;
    const passwordInput = screen.getByPlaceholderText(
      /Enter your password/i,
    ) as HTMLInputElement;

    await simulate.type(emailInput, "test@example.com");
    await simulate.type(passwordInput, "password123");

    expect(emailInput.value).toBe("test@example.com");
    expect(passwordInput.value).toBe("password123");
  });

  it("calls login mutation on form submit", async () => {
    render(<LoginForm />);
    const emailInput = screen.getByPlaceholderText(/you@example.com/i);
    const passwordInput = screen.getByPlaceholderText(/Enter your password/i);
    const submitButton = screen.getByRole("button", { name: /Sign In/i });

    await simulate.type(emailInput, "test@example.com");
    await simulate.type(passwordInput, "password123");
    await simulate.click(submitButton);

    expect(mockLogin).toHaveBeenCalledWith({
      email: "test@example.com",
      password: "password123",
    });
  });

  it("shows error toast if fields are missing", async () => {
    render(<LoginForm />);
    const submitButton = screen.getByRole("button", { name: /Sign In/i });

    await simulate.click(submitButton);

    await waitFor(() => {
      expect(showToast.error).toHaveBeenCalledWith(
        "Missing fields",
        "features.auth.login.toasts.missing_fields_desc",
      );
    });
    expect(mockLogin).not.toHaveBeenCalled();
  });

  it("handles forgot password when email is provided", async () => {
    render(<LoginForm />);
    const emailInput = screen.getByPlaceholderText(/you@example.com/i);
    const forgotButton = screen.getByRole("button", { name: /Forgot\?/i });

    await simulate.type(emailInput, "test@example.com");
    await simulate.click(forgotButton);

    expect(mockForgotPassword).toHaveBeenCalledWith(
      "test@example.com",
      expect.any(Object),
    );
  });

  it("redirects to forgot password page if email is not provided", async () => {
    render(<LoginForm />);
    const forgotButton = screen.getByRole("button", { name: /Forgot\?/i });

    await simulate.click(forgotButton);

    expect(mockPush).toHaveBeenCalledWith("/forgot-password");
    expect(mockForgotPassword).not.toHaveBeenCalled();
  });

  it("toggles password visibility", async () => {
    render(<LoginForm />);
    const passwordInput = screen.getByPlaceholderText(
      /Enter your password/i,
    ) as HTMLInputElement;
    const toggleButton = screen
      .getAllByRole("button")
      .find((b) => b.querySelector("svg") && !b.textContent);

    expect(passwordInput.type).toBe("password");

    if (toggleButton) {
      await simulate.click(toggleButton);
      expect(passwordInput.type).toBe("text");

      await simulate.click(toggleButton);
      expect(passwordInput.type).toBe("password");
    }
  });

  it("disables fields and shows spinner when login is pending", () => {
    vi.mocked(useLogin).mockReturnValue({
      mutate: mockLogin,
      isPending: true,
      error: null,
    } as unknown as ReturnType<typeof useLogin>);

    render(<LoginForm />);

    expect(
      (screen.getByPlaceholderText(/you@example.com/i) as HTMLInputElement)
        .disabled,
    ).toBe(true);
    expect(
      (screen.getByPlaceholderText(/Enter your password/i) as HTMLInputElement)
        .disabled,
    ).toBe(true);
    expect(screen.getByText(/Signing in.../i)).toBeTruthy();
    expect(screen.getByRole("status")).toBeTruthy(); // Spinner has role="status"
  });

  it("navigates to signup page", async () => {
    render(<LoginForm />);
    const signupButton = screen.getByRole("button", { name: /Sign Up/i });

    await simulate.click(signupButton);

    expect(mockPush).toHaveBeenCalledWith("/signup");
  });

  it("handles Google login redirect", async () => {
    const originalLocation = window.location;
    vi.stubGlobal("location", { ...originalLocation, href: "" });

    render(<LoginForm />);
    const googleButton = screen.getByRole("button", { name: /Google/i });

    await simulate.click(googleButton);

    expect(showToast.loading).toHaveBeenCalledWith("Redirecting to Google...");
    expect(window.location.href).toContain("/auth/google");

    vi.unstubAllGlobals();
  });
});
