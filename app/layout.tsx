import type { Metadata } from "next";
import { Inter } from "next/font/google"; // Opsional, sesuaikan font Anda
import "./globals.css";
import { Providers } from "./Providers";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Koperasi Mulyo Dadi Mandiri",
  description: "Sistem Informasi Simpan Pinjam Bagelen",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="id">
      <body className={inter.className}>
        <Providers>
          {children}
        </Providers>
      </body>
    </html>
  );
}