import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SciGate — Academic Papers for AI Agents",
  description: "Scientists publish papers and receive instant Native ETH micropayments every time an AI agent accesses their content. Powered by x402, World ID, and AgentKit.",
  keywords: ["academic papers", "AI agents", "micropayments", "ETH", "World ID", "x402", "blockchain"],
  openGraph: {
    title: "SciGate",
    description: "Monetize your research. Every AI query pays.",
    type: "website",
  },
};

import Providers from "@/components/Providers";

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&family=Space+Grotesk:wght@400;500;600;700&display=swap" rel="stylesheet" />
      </head>
      <body className="antialiased">
        <Providers>
          {children}
        </Providers>
      </body>
    </html>
  );
}
