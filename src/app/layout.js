import "./globals.css";
import { Inter, Manrope } from "next/font/google";
import Providers from "@/app/providers";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const manrope = Manrope({
  subsets: ["latin"],
  variable: "--font-manrope",
  display: "swap",
});

export const metadata = {
  title: "PSBUniverse",
  description: "PSBUniverse application workspace",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={`${inter.variable} ${manrope.variable}`}>
      <body className="dense-workspace" suppressHydrationWarning>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
