import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ClaimPilot · Expense Intelligence",
  description: "Your Intelligent Expense Claim & Reimbursement Copilot.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen">{children}</body>
    </html>
  );
}
