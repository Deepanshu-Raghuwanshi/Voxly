import type { Metadata } from "next";
import "./globals.css";
import TanstackProvider from "../src/core/providers/TanstackProvider";
import { AnimatedBackground } from "../src/shared/components/AnimatedBackground";
import { Navbar } from "../src/shared/components/Navbar";
import { MainContent } from "./MainContent";
import { ThemeProvider } from "../src/shared/providers/ThemeProvider";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";
import { SessionBoundary } from "../src/features/auth/components/SessionBoundary";

export const metadata: Metadata = {
  title: "Voxly",
  description: "Connect instantly with AI-powered conversations",
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const locale = await getLocale();
  const messages = await getMessages();

  return (
    <html lang={locale} suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var s=localStorage.getItem('theme-storage');if(s){var p=JSON.parse(s);if(p&&p.state&&p.state.theme==='dark')document.documentElement.classList.add('dark');}}catch(e){}})();`,
          }}
        />
      </head>
      <body>
        <NextIntlClientProvider messages={messages}>
          <TanstackProvider>
            <ThemeProvider>
              <AnimatedBackground />
              <SessionBoundary>
                <Navbar />
                <MainContent>{children}</MainContent>
              </SessionBoundary>
            </ThemeProvider>
          </TanstackProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
