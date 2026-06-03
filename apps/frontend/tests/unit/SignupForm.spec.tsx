/* eslint-disable @typescript-eslint/no-explicit-any */
import React from "react";
import { render, screen } from "@testing-library/react";
import { vi, describe, it, expect, beforeEach } from "vitest";
import { SignupForm } from "../../src/features/auth/components/SignupForm";
import { simulate } from "../utils/simulate";
import { useRouter } from "next/navigation";
import {
  useSignup,
  useResendVerification,
} from "../../src/features/auth/hooks/useAuth";
import { showToast } from "../../src/shared/utils/toast";

// Mock next-intl
vi.mock("next-intl", () => ({
  useTranslations: (namespace?: string) => (key: string) => {
    if (key === "title" && namespace === "features.auth.signup")
      return "Create Your Account";
    if (key === "email_label") return "Email Address";
    if (key === "password_label") return "Password";
    if (key === "confirm_password_label") return "Confirm Password";
    if (key === "create_account") return "Create Account";
    if (key === "email_placeholder") return "you@example.com";
    if (key === "password_placeholder") return "Minimum 6 characters";
    if (key === "confirm_password_placeholder") return "Confirm your password";
    if (key === "success.title") return "Verify Your Email";
    if (key === "success.go_to_login") return "Go to Login";
    if (key === "creating_account") return "Creating account...";
    if (key === "sign_in") return "Sign In";
    if (key === "errors.password_mismatch_title") return "Password mismatch";
    if (key === "errors.password_mismatch") return "Passwords do not match";
    if (key === "errors.weak_password_title") return "Weak password";
    if (key === "errors.weak_password")
      return "Password must be at least 6 characters";

    return namespace ? `${namespace}.${key}` : key;
  },
}));

// Mock the hooks and utilities
vi.mock("next/navigation", () => ({
  useRouter: vi.fn(),
}));

vi.mock("../../src/features/auth/hooks/useAuth", () => ({
  useSignup: vi.fn(),
  useResendVerification: vi.fn(),
}));

vi.mock("../../src/shared/utils/toast", () => ({
  showToast: {
    error: vi.fn(),
    success: vi.fn(),
    loading: vi.fn(),
  },
}));

describe("SignupForm", () => {
  const mockPush = vi.fn();
  const mockSignup = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useRouter).mockReturnValue({ push: mockPush } as any);
    vi.mocked(useSignup).mockReturnValue({
      mutate: mockSignup,
      isPending: false,
      isSuccess: false,
      error: null,
    } as any);
    vi.mocked(useResendVerification).mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
    } as any);
  });

  it("renders signup form correctly", () => {
    render(<SignupForm />);
    expect(screen.getByText(/Create Your Account/i)).toBeTruthy();
    expect(screen.getByLabelText(/Email Address/i)).toBeTruthy();
    expect(screen.getByLabelText(/^Password$/i)).toBeTruthy();
    expect(screen.getByLabelText(/Confirm Password/i)).toBeTruthy();
    expect(
      screen.getByRole("button", { name: /Create Account/i }),
    ).toBeTruthy();
  });

  it("updates email, password and confirm password fields on change", async () => {
    render(<SignupForm />);
    const emailInput = screen.getByPlaceholderText(
      /you@example.com/i,
    ) as HTMLInputElement;
    const passwordInput = screen.getByPlaceholderText(
      /Minimum 6 characters/i,
    ) as HTMLInputElement;
    const confirmInput = screen.getByPlaceholderText(
      /Confirm your password/i,
    ) as HTMLInputElement;

    await simulate.type(emailInput, "test@example.com");
    await simulate.type(passwordInput, "password123");
    await simulate.type(confirmInput, "password123");

    expect(emailInput.value).toBe("test@example.com");
    expect(passwordInput.value).toBe("password123");
    expect(confirmInput.value).toBe("password123");
  });

  it("calls signup mutation on form submit when fields are valid", async () => {
    render(<SignupForm />);
    const emailInput = screen.getByPlaceholderText(/you@example.com/i);
    const passwordInput = screen.getByPlaceholderText(/Minimum 6 characters/i);
    const confirmInput = screen.getByPlaceholderText(/Confirm your password/i);
    const submitButton = screen.getByRole("button", {
      name: /Create Account/i,
    });

    await simulate.type(emailInput, "test@example.com");
    await simulate.type(passwordInput, "Password123!");
    await simulate.type(confirmInput, "Password123!");
    await simulate.click(submitButton);

    expect(mockSignup).toHaveBeenCalledWith({
      email: "test@example.com",
      password: "Password123!",
    });
  });

  it("shows error if passwords do not match", async () => {
    render(<SignupForm />);
    const emailInput = screen.getByPlaceholderText(/you@example.com/i);
    const passwordInput = screen.getByPlaceholderText(/Minimum 6 characters/i);
    const confirmInput = screen.getByPlaceholderText(/Confirm your password/i);
    const submitButton = screen.getByRole("button", {
      name: /Create Account/i,
    });

    await simulate.type(emailInput, "test@example.com");
    await simulate.type(passwordInput, "Password123!");
    await simulate.type(confirmInput, "Different123!");
    await simulate.click(submitButton);

    expect(showToast.error).toHaveBeenCalledWith(
      "Password mismatch",
      "Passwords do not match",
    );
    expect(mockSignup).not.toHaveBeenCalled();
  });

  it("disables submit and does not call signup when password fails the policy", async () => {
    render(<SignupForm />);
    const emailInput = screen.getByPlaceholderText(/you@example.com/i);
    const passwordInput = screen.getByPlaceholderText(/Minimum 6 characters/i);
    const confirmInput = screen.getByPlaceholderText(/Confirm your password/i);
    const submitButton = screen.getByRole("button", {
      name: /Create Account/i,
    }) as HTMLButtonElement;

    await simulate.type(emailInput, "test@example.com");
    await simulate.type(passwordInput, "weakpass");
    await simulate.type(confirmInput, "weakpass");

    expect(submitButton.disabled).toBe(true);

    await simulate.click(submitButton);
    expect(mockSignup).not.toHaveBeenCalled();
  });

  it("enables submit once the password meets the policy", async () => {
    render(<SignupForm />);
    const passwordInput = screen.getByPlaceholderText(/Minimum 6 characters/i);
    const submitButton = screen.getByRole("button", {
      name: /Create Account/i,
    }) as HTMLButtonElement;

    expect(submitButton.disabled).toBe(true);

    await simulate.type(passwordInput, "Password123!");

    expect(submitButton.disabled).toBe(false);
  });

  it("displays success state after successful signup", async () => {
    vi.mocked(useSignup).mockReturnValue({
      mutate: mockSignup,
      isPending: false,
      isSuccess: true,
      error: null,
    } as any);

    render(<SignupForm />);

    expect(screen.getByText(/Verify Your Email/i)).toBeTruthy();
    expect(screen.getByRole("button", { name: /Go to Login/i })).toBeTruthy();
  });

  it("navigates to login page from success state", async () => {
    vi.mocked(useSignup).mockReturnValue({
      mutate: mockSignup,
      isPending: false,
      isSuccess: true,
      error: null,
    } as any);

    render(<SignupForm />);
    const loginButton = screen.getByRole("button", { name: /Go to Login/i });

    await simulate.click(loginButton);

    expect(mockPush).toHaveBeenCalledWith("/login");
  });

  it("navigates to login page from signup form", async () => {
    render(<SignupForm />);
    const signinButton = screen.getByRole("button", { name: /Sign In/i });

    await simulate.click(signinButton);

    expect(mockPush).toHaveBeenCalledWith("/login");
  });

  it("disables fields and shows spinner when signup is pending", () => {
    vi.mocked(useSignup).mockReturnValue({
      mutate: mockSignup,
      isPending: true,
      isSuccess: false,
      error: null,
    } as any);

    render(<SignupForm />);

    expect(
      (screen.getByPlaceholderText(/you@example.com/i) as HTMLInputElement)
        .disabled,
    ).toBe(true);
    expect(screen.getByText(/Creating account.../i)).toBeTruthy();
    expect(screen.getByRole("status")).toBeTruthy();
  });
});
