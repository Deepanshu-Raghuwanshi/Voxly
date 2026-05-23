"use client";

import React from "react";

interface DisclaimerBannerProps {
  text: string;
  colorHex: string;
}

export const DisclaimerBanner = ({ text, colorHex }: DisclaimerBannerProps) => {
  return (
    <div
      role="note"
      aria-label={`Disclaimer: ${text}`}
      className="px-4 py-2 text-[11px] text-center font-medium border-b"
      style={{
        backgroundColor: `${colorHex}10`,
        borderColor: `${colorHex}30`,
        color: colorHex,
      }}
    >
      ⚠️ {text}
    </div>
  );
};
