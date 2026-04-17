import Script from "next/script";
import type { Metadata } from "next";
import Providers from "./providers";
import Header from "@/components/Header";
import "./globals.css";

const GA_ID = "G-91M4529HE7";
const TOOL_NAME = "aspen-eitc-ctc";

export const metadata: Metadata = {
  title: "EITC & CTC Reform Calculator | PolicyEngine",
  description:
    "Calculate your personal and national impact under the Aspen ESG proposal to reform and enhance the EITC and CTC",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <Script
          src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`}
          strategy="afterInteractive"
        />
        <Script id="gtag-init" strategy="afterInteractive">
          {`
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('js', new Date());
            gtag('config', '${GA_ID}', { tool_name: '${TOOL_NAME}' });
          `}
        </Script>
      </head>
      <body>
        <Header />
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
