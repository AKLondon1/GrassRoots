import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "GrassRoots",
  description: "Grassroots football, organised around people.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en-GB" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
