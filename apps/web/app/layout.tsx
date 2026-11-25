import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { Providers } from "../components/Providers";
import "./tokens.css";
import "./globals.css";
import "./legacy.css";

const geistSans = localFont({
  src: "./fonts/GeistVF.woff",
  variable: "--font-geist-sans",
});
const geistMono = localFont({
  src: "./fonts/GeistMonoVF.woff",
  variable: "--font-geist-mono",
});

export const metadata: Metadata = {
  title: { default: "ShiftPatch", template: "%s · ShiftPatch" },
  description: "Shift marketplace for healthcare staffing",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Light theme only; the mobile top bar is navy.
  themeColor: "#0f1f3a",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable}`}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
