import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Architectural Tour POC",
  description: "Browser-based 3D architectural tour editor",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="h-full overflow-hidden">{children}</body>
    </html>
  );
}
