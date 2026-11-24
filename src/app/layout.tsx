import type { Metadata, Viewport } from "next";
import { ToastProvider } from "@/components/ui/toast";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "MedClinic — Klinika boshqaruvi va elektron navbat tizimi",
    template: "%s | MedClinic",
  },
  description:
    "Zamonaviy xususiy klinika va tibbiyot markazlari uchun onlayn navbat, shifokorlar jadvali, to'lov va moliya boshqaruvi platformasi.",
  openGraph: {
    type: "website",
    locale: "uz_UZ",
    title: "MedClinic — Klinika boshqaruvi va elektron navbat tizimi",
    description:
      "Onlayn navbat oling, jonli kuzating va tajribali shifokorlar qabuliga qulay vaqtda yoziling.",
  },
};

export const viewport: Viewport = {
  themeColor: "#0B4F8A",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="uz">
      <body className="min-h-screen bg-[#F7F9FC] font-sans text-[#0A1628] antialiased selection:bg-[#0B4F8A]/15 selection:text-[#083D6B]">
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
