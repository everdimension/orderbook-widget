import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Orderbook Widget",
  description: "Live l2 orderbook widget",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
