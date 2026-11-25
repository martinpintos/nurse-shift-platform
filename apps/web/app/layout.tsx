import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { Providers } from "../components/Providers";
import "./tokens.css";
import "./globals.css";

const geistSans = localFont({
  src: "./fonts/GeistVF.woff",
  variable: "--font-geist-sans",
});
const geistMono = localFont({
  src: "./fonts/GeistMonoVF.woff",
  variable: "--font-geist-mono",
});
const roboto = localFont({
  src: "./fonts/Roboto-Latin.woff2",
  variable: "--font-roboto",
  weight: "100 900",
});

export const metadata: Metadata = {
  title: { default: "ShiftPatch", template: "%s · ShiftPatch" },
  description: "Shift marketplace for healthcare staffing",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0f1f3a",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${roboto.variable}`}
      >
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
