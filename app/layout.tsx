import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "FishBot",
  description:
    "Internal automation system for monitoring weekly California Delta fishing reports, generating AI summaries, storing report history, and sending email notifications."
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        {children}
      </body>
    </html>
  );
}
