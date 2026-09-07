import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "StoryScroll — Narrated vertical video studio",
  description: "Turn narration and transcripts into elegant scrolling story videos.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full">{children}</body>
    </html>
  );
}
