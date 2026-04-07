import type { Metadata, Viewport } from "next";
import { Inter, Poppins } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import GoogleTranslateLoader from "@/components/google-translate";
import VoiceAssistant from "@/components/voice-assitant";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const poppins = Poppins({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-poppins",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Krishi Exchange - Agricultural Marketplace",
  description:
    "Connect farmers, buyers, transporters and rural stakeholders in a trustworthy agricultural marketplace",
  generator: "v0.app",
  icons: {
    icon: [
      {
        url: "/icon-light-32x32.png",
        media: "(prefers-color-scheme: light)",
      },
      {
        url: "/icon-dark-32x32.png",
        media: "(prefers-color-scheme: dark)",
      },
      {
        url: "/icon.svg",
        type: "image/svg+xml",
      },
    ],
    apple: "/apple-icon.png",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${inter.variable} ${poppins.variable}`}>
      <body
        className="font-sans antialiased overflow-x-hidden"
        suppressHydrationWarning>
        {/* Decorative background orbs */}
        <div
          className="orb-green"
          style={{ width: "500px", height: "500px", top: "-10%", right: "0" }}
        />
        <div
          className="orb-green"
          style={{
            width: "400px",
            height: "400px",
            bottom: "10%",
            left: "0",
          }}
        />
        <div
          className="orb-amber"
          style={{ width: "350px", height: "350px", top: "40%", right: "15%" }}
        />
        <GoogleTranslateLoader />
        {children}
        <VoiceAssistant />
        <Analytics />
      </body>
    </html>
  );
}
