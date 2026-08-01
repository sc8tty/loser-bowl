import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Race to the Bottom | Lander's League Loser Bowl",
  description: "Loser Bowl standings and projected matchups.",
  robots: {
    index: false,
    follow: false,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full">
      <body className="min-h-full font-sans antialiased">{children}</body>
    </html>
  );
}
