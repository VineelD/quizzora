import { Fraunces, Source_Sans_3 } from "next/font/google";
import "./globals.css";
import SkipToContent from "../components/SkipToContent.jsx";
import StagingBanner from "../components/StagingBanner.jsx";
import { BRAND_LOGO_SRC } from "../lib/brand.js";
import { OPERATOR_PRODUCT_NAME } from "../lib/operator.js";

const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-display",
  display: "swap",
  weight: ["500", "600", "700", "800"],
});

const sourceSans = Source_Sans_3({
  subsets: ["latin"],
  variable: "--font-body",
  display: "swap",
  weight: ["400", "500", "600", "700", "800"],
});

export const metadata = {
  title: OPERATOR_PRODUCT_NAME,
  description: "Assessment platform for Australian secondary students (Year 7 through VCE Year 12).",
  applicationName: OPERATOR_PRODUCT_NAME,
  icons: {
    icon: BRAND_LOGO_SRC,
    apple: BRAND_LOGO_SRC,
  },
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }) {
  return (
    <html className={`${fraunces.variable} ${sourceSans.variable}`} lang="en">
      <body>
        <StagingBanner />
        <SkipToContent />
        {children}
      </body>
    </html>
  );
}
