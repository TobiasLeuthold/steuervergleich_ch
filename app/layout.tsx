import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Steuervergleich Schweiz",
  description:
    "Einkommenssteuern in allen Schweizer Gemeinden: Karte nach Bruttolohn und Steuerkurven pro Kanton. Daten: ESTV Steuerrechner.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de-CH">
      <body>{children}</body>
    </html>
  );
}
