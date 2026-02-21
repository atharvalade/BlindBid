import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "BlindBid — Private B2B Marketplace on Canton Network",
  description:
    "Sealed bids, private scoring, gasless settlement. Powered by Canton Network + ADI + Hedera.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="antialiased">
        {children}
      </body>
    </html>
  );
}
