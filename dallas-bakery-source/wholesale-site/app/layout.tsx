import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://dallasbakery.net"),
  title: "Dallas Bakery Wholesale | Persian Barbari Bread",
  description:
    "Kosher and Halal Persian Barbari bread for restaurants, grocers, hotels, institutions, and food distributors, with a 14-day shelf life and unlimited weekly production.",
  alternates: {
    canonical: "https://dallasbakery.net",
  },
  openGraph: {
    title: "Dallas Bakery Wholesale",
    description: "Wholesale Persian Barbari bread for growing businesses.",
    type: "website",
    url: "https://dallasbakery.net",
    images: [
      {
        url: "https://dallasbakery.net/og.png",
        width: 1729,
        height: 910,
        alt: "Dallas Bakery Wholesale — Bread built for busy kitchens",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Dallas Bakery Wholesale",
    description: "Wholesale Persian Barbari bread for growing businesses.",
    images: ["https://dallasbakery.net/og.png"],
  },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
