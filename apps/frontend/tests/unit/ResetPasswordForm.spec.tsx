/* eslint-disable @typescript-eslint/no-explicit-any */
import React from "react";
import { render, screen } from "@testing-library/react";
import { vi, describe, it, expect, beforeEach } from "vitest";
import { ResetPasswordForm } from "../../src/features/auth/components/ResetPasswordForm";
import { simulate } from "../utils/simulate";
import { useRouter, useSearchParams } from "next/navigation";
import { useResetPassword } from "../../src/features/auth/hooks/useAuth";
import { showToast } from "../../src/shared/utils/toast";

// Mock next-intl
vi.mock("next-intl", () => ({
  useTranslations: (namespace?: string) => (key: string) => {
    if (namespace === "features.auth.reset_password") {
      if (key === "title") return "Reset Your Password";
      if (key === "subtitle") return "Enter a new password for your account";
      if (key === "password_label") return "New Password";
      if (key === "confirm_password_label") return "Confirm Password";
      if (key === "password_placeholder") return "••••••••";
      if (key === "confirm_password_placeholder") return "••••••••";
      if (key === "submit") return "Reset Password";
      if (key === "submitting") return "Resetting password...";
      if (key === "success.title") return "Password Reset!";
      if (key === "success.message")
        return "Your password has been successfully updated. You can now log in with your new password.";
      if (key === "errors.invalid_link") return "Invalid link";
      if (key === "errors.no_token") return "No token provided in the URL";
      if (key === "errors.password_mismatch_title") return "Passwords mismatch";
      if (key === "errors.password_mismatch") return "Passwords do not match";
      if (key === "errors.weak_password_title") return "Weak password";
      if (key === "errors.weak_password")
        return "Password must be at least 8 characters long";
    }
    return namespace ? `${namespace}.${key}` : key;
  },
}));

// Mock the hooks and utilities
vi.mock("next/navigation", () => ({
  useRouter: vi.fn(),
  useSearchParams: vi.fn(),
}));

vi.mock("../../src/features/auth/hooks/useAuth", () => ({
  useResetPassword: vi.fn(),
}));

vi.mock("../../src/shared/utils/toast", () => ({
  showToast: {
    error: vi.fn(),
    success: vi.fn(),
    loading: vi.fn(),
  },
}));

describe("ResetPasswordForm", () => {
  const mockPush = vi.fn();
  const mockResetPassword = vi.fn();
  const mockGet = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useRouter).mockReturnValue({ push: mockPush } as any);
    vi.mocked(useSearchParams).mockReturnValue({ get: mockGet } as any);
    mockGet.mockReturnValue("valid-token");
    vi.mocked(useResetPassword).mockReturnValue({
      mutate: mockResetPassword,
      isPending: false,
    } as any);
  });

  it("renders reset password form correctly", () => {
    render(<ResetPasswordForm />);
    expect(screen.getByText(/Reset Your Password/i)).toBeTruthy();
    expect(screen.getByLabelText(/New Password/i)).toBeTruthy();
    expect(screen.getByLabelText(/Confirm Password/i)).toBeTruthy();
    expect(
      screen.getByRole("button", { name: /Reset Password/i }),
    ).toBeTruthy();
  });

  it("shows error and redirects if no token is provided", () => {
    mockGet.mockReturnValue(null);
    render(<ResetPasswordForm />);

    expect(showToast.error).toHaveBeenCalledWith(
      "Invalid link",
      "No token provided in the URL",
    );
    expect(mockPush).toHaveBeenCalledWith("/login");
  });

  it("updates password fields on change", async () => {
    render(<ResetPasswordForm />);
    const inputs = screen.getAllByPlaceholderText(
      "••••••••",
    ) as HTMLInputElement[];
    const passwordInput = inputs[0];
    const confirmInput = inputs[1];

    await simulate.type(passwordInput, "newpassword123");
    await simulate.type(confirmInput, "newpassword123");

    expect(passwordInput.value).toBe("newpassword123");
    expect(confirmInput.value).toBe("newpassword123");
  });

  it("calls resetPassword mutation on form submit when fields are valid", async () => {
    render(<ResetPasswordForm />);
    const inputs = screen.getAllByPlaceholderText("••••••••");
    const passwordInput = inputs[0];
    const confirmInput = inputs[1];
    const submitButton = screen.getByRole("button", {
      name: /Reset Password/i,
    });

    await simulate.type(passwordInput, "Password123!");
    await simulate.type(confirmInput, "Password123!");
    await simulate.click(submitButton);

    expect(mockResetPassword).toHaveBeenCalledWith(
      { token: "valid-token", password: "Password123!" },
      expect.any(Object),
    );
  });

  it("shows error if passwords do not match", async () => {
    render(<ResetPasswordForm />);
    const inputs = screen.getAllByPlaceholderText("••••••••");
    const passwordInput = inputs[0];
    const confirmInput = inputs[1];
    const submitButton = screen.getByRole("button", {
      name: /Reset Password/i,
    });

    await simulate.type(passwordInput, "Password123!");
    await simulate.type(confirmInput, "Different123!");
    await simulate.click(submitButton);

    expect(showToast.error).toHaveBeenCalledWith(
      "Passwords mismatch",
      "Passwords do not match",
    );
    expect(mockResetPassword).not.toHaveBeenCalled();
  });

  it("disables submit and does not call resetPassword when password fails the policy", async () => {
    render(<ResetPasswordForm />);
    const inputs = screen.getAllByPlaceholderText("••••••••");
    const passwordInput = inputs[0];
    const confirmInput = inputs[1];
    const submitButton = screen.getByRole("button", {
      name: /Reset Password/i,
    }) as HTMLButtonElement;

    await simulate.type(passwordInput, "short");
    await simulate.type(confirmInput, "short");

    expect(submitButton.disabled).toBe(true);

    await simulate.click(submitButton);
    expect(mockResetPassword).not.toHaveBeenCalled();
  });

  it("displays success state after successful reset", async () => {
    mockResetPassword.mockImplementation((data, options) => {
      options.onSuccess();
    });

    render(<ResetPasswordForm />);
    const inputs = screen.getAllByPlaceholderText("••••••••");
    const passwordInput = inputs[0];
    const confirmInput = inputs[1];
    const submitButton = screen.getByRole("button", {
      name: /Reset Password/i,
    });

    await simulate.type(passwordInput, "Password123!");
    await simulate.type(confirmInput, "Password123!");
    await simulate.click(submitButton);

    expect(screen.getByText(/Password Reset!/i)).toBeTruthy();
    expect(
      screen.getByText(/Your password has been successfully updated/i),
    ).toBeTruthy();
  });

  it("disables fields and shows spinner when resetting is pending", () => {
    vi.mocked(useResetPassword).mockReturnValue({
      mutate: mockResetPassword,
      isPending: true,
    } as any);

    render(<ResetPasswordForm />);

    expect(
      (screen.getAllByPlaceholderText("••••••••")[0] as HTMLInputElement)
        .disabled,
    ).toBe(true);
    expect(screen.getByText(/Resetting password.../i)).toBeTruthy();
    expect(screen.getByRole("status")).toBeTruthy();
  });
});
