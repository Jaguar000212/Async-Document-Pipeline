import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Async Document Workflow",
  description: "Frontend for async document processing",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

