import React from "react";
import { screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { DisclaimerBanner } from "../../src/features/persona/components/DisclaimerBanner";
import { renderWithIntl } from "../utils/render";

describe("DisclaimerBanner", () => {
  it("renders the disclaimer text", () => {
    renderWithIntl(
      <DisclaimerBanner text="This is not legal advice." colorHex="#8B5CF6" />,
    );
    expect(screen.getByText("⚠️ This is not legal advice.")).toBeTruthy();
  });

  it("applies colorHex to the banner style", () => {
    const { container } = renderWithIntl(
      <DisclaimerBanner text="Disclaimer" colorHex="#10B981" />,
    );
    const banner = container.firstChild as HTMLElement;
    expect(banner.style.color).toBe("rgb(16, 185, 129)");
  });
});
