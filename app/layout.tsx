import type { Metadata } from "next";

import { RegisterServiceWorker } from "@/components/pwa/register-service-worker";
import { brand } from "@/lib/brand";
import { environment } from "@/lib/env";
import { createSiteMetadata } from "@/lib/metadata";

import "./globals.css";

export const metadata: Metadata = createSiteMetadata(brand);

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  void environment;

  return (
    <html lang={brand.locale} className="h-full antialiased">
      <body className="min-h-full flex flex-col">
        {children}
        <RegisterServiceWorker />
      </body>
    </html>
  );
}
