import type { Metadata } from "next";

type MetadataBrand = {
  name: string;
  description: string;
};

export function createSiteMetadata(brand: MetadataBrand): Metadata {
  return {
    title: brand.name,
    description: brand.description,
    applicationName: brand.name,
    manifest: "/manifest.webmanifest",
    metadataBase: new URL("https://grassroots.football"),
    openGraph: {
      title: brand.name,
      description: brand.description,
      type: "website",
      locale: "en_GB",
      siteName: brand.name,
    },
  };
}
