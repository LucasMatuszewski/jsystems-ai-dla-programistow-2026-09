import type { Metadata } from "next";
import "./globals.css";
import { AppHeader } from "@/components/app-header";

export const metadata: Metadata = {
  title: "Asystent reklamacji i zwrotów",
  description: "Narzędzie dla pracownika do wstępnej oceny reklamacji i zwrotów, bez danych osobowych klientów.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="pl">
      <body><AppHeader />{children}</body>
    </html>
  );
}
