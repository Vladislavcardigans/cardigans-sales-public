import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Cardigans Sales OS",
  description: "Система управления продажами Cardigans Arena",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ru">
      <body>{children}</body>
    </html>
  );
}
