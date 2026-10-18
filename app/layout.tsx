import type { Metadata, Viewport } from "next";
import { Manrope, Montserrat, Onest } from "next/font/google";
import "./globals.css";
import { LicenseProvider } from "@/components/LicenseProvider";
import Toaster from "@/components/Toaster";

const manrope = Manrope({
  variable: "--font-sans",
  subsets: ["latin"],
});

const montserrat = Montserrat({
  variable: "--font-display",
  subsets: ["latin"],
});

const onest = Onest({
  variable: "--font-brand",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Precision ID: Passport Photo Studio",
  description: "On-device AI passport, visa and ID photo maker with print-ready sheets.",
  manifest: "/manifest.json",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#FFFFFF" },
    { media: "(prefers-color-scheme: dark)", color: "#0A0A0A" },
  ],
};

// Apply saved theme (dark by default per ChaiUI standard) before paint
const themeInit = `try{var t=localStorage.getItem('theme')||'dark';document.documentElement.classList.add(t)}catch(e){document.documentElement.classList.add('dark')}`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${manrope.variable} ${montserrat.variable} ${onest.variable} dark h-full antialiased`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInit }} />
      </head>
      <body className="min-h-full flex flex-col font-sans bg-background text-foreground">
        <LicenseProvider>{children}</LicenseProvider>
        <Toaster />
      </body>
    </html>
  );
}
