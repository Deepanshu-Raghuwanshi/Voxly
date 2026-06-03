import React from "react";
import { render, screen } from "@testing-library/react";
import { vi, describe, it, expect } from "vitest";
import { PasswordStrengthMeter } from "../../src/features/auth/components/PasswordStrengthMeter";

// Mock next-intl so the strength label keys resolve to readable words.
vi.mock("next-intl", () => ({
  useTranslations: (namespace?: string) => (key: string) => {
    if (namespace === "features.auth.password_policy") {
      if (key === "strength_prefix") return "Password strength";
      if (key === "strength.weak") return "Weak";
      if (key === "strength.fair") return "Fair";
      if (key === "strength.good") return "Good";
      if (key === "strength.strong") return "Strong";
      if (key === "requirements.length") return "8–128 characters";
      if (key === "requirements.uppercase") return "One uppercase letter";
      if (key === "requirements.lowercase") return "One lowercase letter";
      if (key === "requirements.number") return "One number";
      if (key === "requirements.special") return "One special character";
    }
    return namespace ? `${namespace}.${key}` : key;
  },
}));

describe("PasswordStrengthMeter", () => {
  it("renders nothing when the password is empty", () => {
    const { container } = render(<PasswordStrengthMeter password="" />);
    expect(container.firstChild).toBeNull();
  });

  it('shows "Weak" for a password that meets no real requirements', () => {
    render(<PasswordStrengthMeter password="abc" />);
    expect(screen.getByText(/Weak/i)).toBeTruthy();
  });

  it('shows "Fair" for an under-length password with mixed case and a digit', () => {
    // 'Abcdef1' is 7 chars: case + digit satisfied, length + special missing → score 2
    render(<PasswordStrengthMeter password="Abcdef1" />);
    expect(screen.getByText(/Fair/i)).toBeTruthy();
  });

  it('shows "Good" for an 8-char password missing only a special character', () => {
    // 'Abcdef12' → length + case + digit satisfied, special missing → score 3
    render(<PasswordStrengthMeter password="Abcdef12" />);
    expect(screen.getByText(/Good/i)).toBeTruthy();
  });

  it('shows "Strong" for a password meeting every requirement', () => {
    render(<PasswordStrengthMeter password="Password123!" />);
    expect(screen.getByText(/Strong/i)).toBeTruthy();
  });

  it("lists only the requirements that are still unmet, hiding satisfied ones", () => {
    // 'abc' satisfies only the lowercase rule, so that one is hidden.
    render(<PasswordStrengthMeter password="abc" />);
    expect(screen.queryByText(/One lowercase letter/i)).toBeNull();
    expect(screen.getByText(/128 characters/i)).toBeTruthy();
    expect(screen.getByText(/One uppercase letter/i)).toBeTruthy();
    expect(screen.getByText(/One number/i)).toBeTruthy();
    expect(screen.getByText(/One special character/i)).toBeTruthy();
  });

  it("hides the checklist entirely once every requirement is met", () => {
    render(<PasswordStrengthMeter password="Password123!" />);
    // Strength feedback still shows, but no requirement rows remain.
    expect(screen.getByText(/Strong/i)).toBeTruthy();
    expect(screen.queryByText(/128 characters/i)).toBeNull();
    expect(screen.queryByText(/One uppercase letter/i)).toBeNull();
    expect(screen.queryByText(/One special character/i)).toBeNull();
  });
});
