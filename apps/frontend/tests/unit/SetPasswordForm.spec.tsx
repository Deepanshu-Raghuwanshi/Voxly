/* eslint-disable @typescript-eslint/no-explicit-any */
import React from "react";
import { render, screen } from "@testing-library/react";
import { vi, describe, it, expect, beforeEach } from "vitest";
import { SetPasswordForm } from "../../src/features/auth/components/SetPasswordForm";
import { simulate } from "../utils/simulate";
import { useRouter, useSearchParams } from "next/navigation";
import { useSetPassword } from "../../src/features/auth/hooks/useAuth";
import { showToast } from "../../src/shared/utils/toast";

// Mock next-intl
vi.mock("next-intl", () => ({
  useTranslations: (namespace?: string) => (key: string) => {
    if (namespace === "features.auth.set_password") {
      if (key === "title") return "Set Your Password";
      if (key === "subtitle")
        return "Choose a strong password for your account";
      if (key === "password_label") return "New Password";
      if (key === "confirm_password_label") return "Confirm Password";
      if (key === "password_placeholder") return "••••••••";
      if (key === "confirm_password_placeholder") return "••••••••";
      if (key === "submit") return "Set Password";
      if (key === "submitting") return "Setting password...";
      if (key === "success.title") return "Password Set!";
      if (key === "success.message")
        return "Your password has been updated. You can now log in using your email and the new password.";
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
  useSetPassword: vi.fn(),
}));

vi.mock("../../src/shared/utils/toast", () => ({
  showToast: {
    error: vi.fn(),
    success: vi.fn(),
    loading: vi.fn(),
  },
}));

describe("SetPasswordForm", () => {
  const mockPush = vi.fn();
  const mockSetPassword = vi.fn();
  const mockGet = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useRouter).mockReturnValue({ push: mockPush } as any);
    vi.mocked(useSearchParams).mockReturnValue({ get: mockGet } as any);
    mockGet.mockReturnValue("valid-token");
    vi.mocked(useSetPassword).mockReturnValue({
      mutate: mockSetPassword,
      isPending: false,
    } as any);
  });

  it("renders set password form correctly", () => {
    render(<SetPasswordForm />);
    expect(screen.getByText(/Set Your Password/i)).toBeTruthy();
    expect(screen.getByLabelText(/New Password/i)).toBeTruthy();
    expect(screen.getByLabelText(/Confirm Password/i)).toBeTruthy();
    expect(screen.getByRole("button", { name: /Set Password/i })).toBeTruthy();
  });

  it("shows error and redirects if no token is provided", () => {
    mockGet.mockReturnValue(null);
    render(<SetPasswordForm />);

    expect(showToast.error).toHaveBeenCalledWith(
      "Invalid link",
      "No token provided in the URL",
    );
    expect(mockPush).toHaveBeenCalledWith("/login");
  });

  it("updates password fields on change", async () => {
    render(<SetPasswordForm />);
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

  it("calls setPassword mutation on form submit when fields are valid", async () => {
    render(<SetPasswordForm />);
    const inputs = screen.getAllByPlaceholderText("••••••••");
    const passwordInput = inputs[0];
    const confirmInput = inputs[1];
    const submitButton = screen.getByRole("button", { name: /Set Password/i });

    await simulate.type(passwordInput, "Password123!");
    await simulate.type(confirmInput, "Password123!");
    await simulate.click(submitButton);

    expect(mockSetPassword).toHaveBeenCalledWith(
      { token: "valid-token", password: "Password123!" },
      expect.any(Object),
    );
  });

  it("shows error if passwords do not match", async () => {
    render(<SetPasswordForm />);
    const inputs = screen.getAllByPlaceholderText("••••••••");
    const passwordInput = inputs[0];
    const confirmInput = inputs[1];
    const submitButton = screen.getByRole("button", { name: /Set Password/i });

    await simulate.type(passwordInput, "Password123!");
    await simulate.type(confirmInput, "Different123!");
    await simulate.click(submitButton);

    expect(showToast.error).toHaveBeenCalledWith(
      "Passwords mismatch",
      "Passwords do not match",
    );
    expect(mockSetPassword).not.toHaveBeenCalled();
  });

  it("disables submit and does not call setPassword when password fails the policy", async () => {
    render(<SetPasswordForm />);
    const inputs = screen.getAllByPlaceholderText("••••••••");
    const passwordInput = inputs[0];
    const confirmInput = inputs[1];
    const submitButton = screen.getByRole("button", {
      name: /Set Password/i,
    }) as HTMLButtonElement;

    await simulate.type(passwordInput, "short");
    await simulate.type(confirmInput, "short");

    expect(submitButton.disabled).toBe(true);

    await simulate.click(submitButton);
    expect(mockSetPassword).not.toHaveBeenCalled();
  });

  it("displays success state after successful set", async () => {
    mockSetPassword.mockImplementation((data, options) => {
      options.onSuccess();
    });

    render(<SetPasswordForm />);
    const inputs = screen.getAllByPlaceholderText("••••••••");
    const passwordInput = inputs[0];
    const confirmInput = inputs[1];
    const submitButton = screen.getByRole("button", { name: /Set Password/i });

    await simulate.type(passwordInput, "Password123!");
    await simulate.type(confirmInput, "Password123!");
    await simulate.click(submitButton);

    expect(screen.getByText(/Password Set!/i)).toBeTruthy();
    expect(screen.getByText(/Your password has been updated/i)).toBeTruthy();
  });

  it("disables fields and shows spinner when setting is pending", () => {
    vi.mocked(useSetPassword).mockReturnValue({
      mutate: mockSetPassword,
      isPending: true,
    } as any);

    render(<SetPasswordForm />);

    expect(
      (screen.getAllByPlaceholderText("••••••••")[0] as HTMLInputElement)
        .disabled,
    ).toBe(true);
    expect(screen.getByText(/Setting password.../i)).toBeTruthy();
    expect(screen.getByRole("status")).toBeTruthy();
  });
});
