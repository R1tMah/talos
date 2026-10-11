import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { KeyboardInset } from "@/components/KeyboardInset";
import { TabBar } from "@/components/TabBar";
import { RestWatcher } from "@/components/RestWatcher";
import { UndoToast } from "@/components/UndoToast";
import { Ready, StoreProvider } from "@/lib/store";
import "./globals.css";

export const metadata: Metadata = {
  title: "TALOS",
  description: "Personal tracking",
  applicationName: "TALOS",
  appleWebApp: { capable: true, title: "TALOS", statusBarStyle: "black-translucent" },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#0b0d10" },
    { media: "(prefers-color-scheme: light)", color: "#f5f6f8" },
  ],
};

// Applies a saved theme override before first paint.
const themeScript = `try{var t=localStorage.getItem("talos.theme");if(t==="light"||t==="dark")document.documentElement.dataset.theme=t}catch(e){}`;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        <KeyboardInset />
        <StoreProvider>
          <Ready>{children}</Ready>
          <TabBar />
          <RestWatcher />
          <UndoToast />
        </StoreProvider>
      </body>
    </html>
  );
}
