import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "Startup Funding Pulse",
  description: "Weekly AI-curated Indian startup funding intelligence brief",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="wrap">
          <nav>
            <Link href="/" className="brand">
              Funding <span>Pulse</span>
            </Link>
            <span className="spacer" />
            <Link href="/">Latest brief</Link>
            <Link href="/config">Mandate &amp; watchlist</Link>
          </nav>
          {children}
        </div>
      </body>
    </html>
  );
}
