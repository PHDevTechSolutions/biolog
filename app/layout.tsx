import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";
import { UserProvider } from "@/contexts/UserContext";
import InstallPrompt from "@/components/install-prompt";
import ServiceWorkerRegister from "@/components/service-worker-register";

const inter = Inter({
  weight: "100",
  subsets: ["latin"],
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: "Biolog - Attendance & Time Tracking System",
  description: "Created in NextJs Developed By Leroux Y Xchire",
  applicationName: "Biolog",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Biolog",
  },
  icons: {
    icon: "/fluxx.png",
    shortcut: "/fluxx.png",
    apple: "/fluxx-512.png",
  },
  manifest: "/manifest.json",
  formatDetection: {
    telephone: false,
  },
};

export const viewport: Viewport = {
  themeColor: "#CC1318",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="manifest" href="/manifest.json" />
      </head>
      <body className={`${inter.variable} font-mono antialiased relative`}>
        <UserProvider>
          <ServiceWorkerRegister />
          {children}
          <Toaster />
          <div className="fixed inset-0 z-[500] pointer-events-none">
            <div className="pointer-events-auto">
              <InstallPrompt />
            </div>
          </div>
        </UserProvider>
      </body>
    </html>
  );
}
