import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Mission Arabic — Learn, Play, Speak",
  description: "Game edukasi Bahasa Arab interaktif untuk tingkat CEFR A1–A2.",
  applicationName: "Mission Arabic",
  icons: { icon: "/favicon.svg" },
  keywords: ["Bahasa Arab", "Arabic learning", "educational game", "CEFR A1", "CEFR A2"],
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="id">
      <body>{children}</body>
    </html>
  );
}
