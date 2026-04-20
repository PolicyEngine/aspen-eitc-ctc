import Script from "next/script";
import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import Providers from "./providers";
import Header from "@/components/Header";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-inter",
  weight: ["300", "400", "500", "600", "700", "800"],
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-jetbrains-mono",
});

const GA_ID = "G-2YHG89FY0N";
const TOOL_NAME = "aspen-eitc-ctc";

const SITE_URL = "https://policyengine.org/us/aspen-eitc-ctc";
const OG_IMAGE = "https://policyengine.org/us/aspen-eitc-ctc/policyengine-logo.png";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#2C7A7B",
};

export const metadata: Metadata = {
  title: "EITC & CTC Reform Calculator | PolicyEngine",
  description:
    "Calculate your personal and national impact under the Aspen Economic Strategy Group proposal to reform and enhance the Earned Income Tax Credit (EITC) and Child Tax Credit (CTC). Compare current law vs. reform for households across all 50 states.",
  keywords: [
    "EITC",
    "CTC",
    "Earned Income Tax Credit",
    "Child Tax Credit",
    "tax reform",
    "Aspen ESG",
    "PolicyEngine",
    "tax calculator",
    "tax credit calculator",
    "family tax benefits",
  ],
  metadataBase: new URL(SITE_URL),
  alternates: {
    canonical: SITE_URL,
  },
  openGraph: {
    type: "website",
    url: SITE_URL,
    title: "EITC & CTC Reform Calculator | PolicyEngine",
    description:
      "Estimate your household and national impact under the Aspen ESG proposal to reform and enhance the EITC and CTC.",
    siteName: "PolicyEngine",
    images: [
      {
        url: OG_IMAGE,
        width: 1200,
        height: 630,
        alt: "PolicyEngine EITC & CTC Reform Calculator",
      },
    ],
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: "EITC & CTC Reform Calculator | PolicyEngine",
    description:
      "Estimate your household and national impact under the Aspen ESG proposal to reform and enhance the EITC and CTC.",
    images: [OG_IMAGE],
    creator: "@ThePolicyEngine",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  icons: {
    icon: "/policyengine-logo.png",
  },
};

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "WebApplication",
  name: "EITC & CTC Reform Calculator",
  url: SITE_URL,
  description:
    "Calculate your personal and national impact under the Aspen ESG proposal to reform and enhance the EITC and CTC.",
  applicationCategory: "FinanceApplication",
  operatingSystem: "All",
  offers: {
    "@type": "Offer",
    price: "0",
    priceCurrency: "USD",
  },
  author: {
    "@type": "Organization",
    name: "PolicyEngine",
    url: "https://policyengine.org",
  },
  publisher: {
    "@type": "Organization",
    name: "PolicyEngine",
    url: "https://policyengine.org",
    logo: {
      "@type": "ImageObject",
      url: "https://policyengine.org/us/aspen-eitc-ctc/policyengine-logo.png",
    },
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${inter.variable} ${jetbrainsMono.variable}`}>
      <head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
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
        <Script id="engagement-tracking" strategy="afterInteractive">
          {`
            (function() {
              var TOOL_NAME = '${TOOL_NAME}';
              if (typeof window === 'undefined' || !window.gtag) return;

              var scrollFired = {};
              window.addEventListener('scroll', function() {
                var docHeight = document.documentElement.scrollHeight - window.innerHeight;
                if (docHeight <= 0) return;
                var pct = Math.floor((window.scrollY / docHeight) * 100);
                [25, 50, 75, 100].forEach(function(m) {
                  if (pct >= m && !scrollFired[m]) {
                    scrollFired[m] = true;
                    window.gtag('event', 'scroll_depth', { percent: m, tool_name: TOOL_NAME });
                  }
                });
              }, { passive: true });

              [30, 60, 120, 300].forEach(function(sec) {
                setTimeout(function() {
                  if (document.visibilityState !== 'hidden') {
                    window.gtag('event', 'time_on_tool', { seconds: sec, tool_name: TOOL_NAME });
                  }
                }, sec * 1000);
              });

              document.addEventListener('click', function(e) {
                var link = e.target && e.target.closest ? e.target.closest('a') : null;
                if (!link || !link.href) return;
                try {
                  var url = new URL(link.href, window.location.origin);
                  if (url.hostname && url.hostname !== window.location.hostname) {
                    window.gtag('event', 'outbound_click', {
                      url: link.href,
                      target_hostname: url.hostname,
                      tool_name: TOOL_NAME
                    });
                  }
                } catch (err) {}
              });
            })();
          `}
        </Script>
      </head>
      <body>
        <Header />
        <main>
          <Providers>{children}</Providers>
        </main>
      </body>
    </html>
  );
}
