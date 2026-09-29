import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { KeepFormState } from "@/components/app/keep-form-state";
import { TooltipProvider } from "@/components/ui/tooltip";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });

export const metadata: Metadata = {
  title: { default: "TrustCraft", template: "%s · TrustCraft" },
  description: "Service operations and trust platform for verified professionals, service companies and the organizations they work for.",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0b0f16" },
  ],
};

// Runs before first paint so the saved theme never flashes.
const THEME_SCRIPT = `try{var t=localStorage.getItem("tc-theme");if(t!=="light"&&t!=="dark")t=matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light";document.documentElement.dataset.theme=t}catch(e){}`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={inter.variable} suppressHydrationWarning>
      <head>
        {/* Inline, synchronous: sets the theme before first paint (see Next.js: preventing flash before hydration). */}
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="min-h-dvh">
        <KeepFormState />
        <TooltipProvider delay={400}>{children}</TooltipProvider>
      </body>
    </html>
  );
}
