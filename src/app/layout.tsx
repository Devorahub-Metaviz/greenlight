import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import { UpdateChecker } from "@/components/UpdateChecker";
import "./globals.css";

const inter = Inter({ variable: "--font-inter", subsets: ["latin"] });
const jbmono = JetBrains_Mono({ variable: "--font-jbmono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Greenlight — E2E regression control",
  description: "Run and manage Playwright regression tests across projects",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Apply theme before first paint to avoid a flash.
  const themeScript = `(function(){try{var t=localStorage.getItem('e2e-theme');if(!t){t=window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';}if(t==='dark')document.documentElement.classList.add('dark');}catch(e){}})();`;
  return (
    <html lang="en" suppressHydrationWarning className={`${inter.variable} ${jbmono.variable} h-full`}>
      <head><script dangerouslySetInnerHTML={{ __html: themeScript }} /></head>
      <body className="min-h-full">
        {children}
        <UpdateChecker />
      </body>
    </html>
  );
}
