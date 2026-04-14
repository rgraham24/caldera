import type { Metadata } from "next";
import { Inter, IBM_Plex_Mono, DM_Serif_Display } from "next/font/google";
import "./globals.css";
import { DesoSDKProvider } from "@/components/providers/DesoSDKProvider";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
});

const ibmPlexMono = IBM_Plex_Mono({
  variable: "--font-ibm-plex-mono",
  weight: ["400", "500", "600", "700"],
  subsets: ["latin"],
});

const dmSerif = DM_Serif_Display({
  weight: "400",
  style: ["normal", "italic"],
  subsets: ["latin"],
  variable: "--font-dm-serif",
});

export const metadata: Metadata = {
  title: "Caldera — Trade what you know. Own what you love.",
  description:
    "Every market. Every token. One platform.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${ibmPlexMono.variable} ${dmSerif.variable} h-full antialiased`}
    >
      <head>
        <link rel="preconnect" href="https://api.fontshare.com" />
        <link
          rel="stylesheet"
          href="https://api.fontshare.com/v2/css?f[]=satoshi@700,500,400&display=swap"
        />
      </head>
      <body className="min-h-full flex flex-col">
        <DesoSDKProvider>
          {children}
        </DesoSDKProvider>
      </body>
    </html>
  );
}
