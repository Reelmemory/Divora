import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Divora",
  description: "Phase 0 foundation for the Divora NFT trading agent.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
