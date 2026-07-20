import type { Metadata } from "next";
import type { CSSProperties } from "react";

import { RegisterServiceWorker } from "@/components/pwa/register-service-worker";
import {
  brand,
  createBrandCssVariables,
  type BrandCssVariables,
} from "@/lib/brand";
import { environment } from "@/lib/env";
import { createSiteMetadata } from "@/lib/metadata";

import "./globals.css";

export const metadata: Metadata = createSiteMetadata(brand);

const brandStyles: CSSProperties & BrandCssVariables = createBrandCssVariables(
  brand.identity.palette,
);

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  void environment;

  return (
    <html
      lang={brand.locale}
      className="h-full antialiased"
      style={brandStyles}
    >
      <body className="min-h-full flex flex-col">
        {children}
        <RegisterServiceWorker />
      </body>
    </html>
  );
}
