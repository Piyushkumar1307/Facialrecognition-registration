import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "FaceCheck | Private face lookup",
  description: "A private, consent-based face verification and user enrollment portal.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
