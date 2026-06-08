import { Plus_Jakarta_Sans, Source_Sans_3 } from "next/font/google";
import "./globals.css";
import SkipToContent from "../components/SkipToContent.jsx";
import StagingBanner from "../components/StagingBanner.jsx";
import { BRAND_LOGO_SRC } from "../lib/brand.js";
import { OPERATOR_PRODUCT_NAME } from "../lib/operator.js";

const plusJakarta = Plus_Jakarta_Sans({
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

const siteUrl = (process.env.APP_BASE_URL || "https://quizzora.org").replace(/\/$/, "");

export const metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: `${OPERATOR_PRODUCT_NAME} — Australian curriculum quizzes for schools & families`,
    template: `%s | ${OPERATOR_PRODUCT_NAME}`,
  },
  description:
    "Open-source Australian curriculum quizzes for secondary schools and families (Years 7–12, VCE). Study Coach, teacher assignments, data hosted in Australia.",
  applicationName: OPERATOR_PRODUCT_NAME,
  keywords: [
    "Quizzora",
    "Australian curriculum",
    "secondary school quizzes",
    "VCE",
    "open source edtech",
    "Study Coach",
  ],
  openGraph: {
    title: `${OPERATOR_PRODUCT_NAME} — Australian curriculum quizzes`,
    description:
      "Open-source quizzes and Study Coach for Australian secondary schools and families. AGPL-3.0; data hosted in Australia.",
    url: siteUrl,
    siteName: OPERATOR_PRODUCT_NAME,
    locale: "en_AU",
    type: "website",
  },
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
    <html className={`${plusJakarta.variable} ${sourceSans.variable}`} lang="en">
      <body>
        <StagingBanner />
        <SkipToContent />
        {children}
      </body>
    </html>
  );
}
