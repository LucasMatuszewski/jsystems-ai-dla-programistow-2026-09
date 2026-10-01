import Image from "next/image";
import { Button } from "@/components/ui/button";

export function AppHeader() {
  return (
    <header className="app-header">
      <Button asChild className="skip-link">
        <a href="#main-content">Przejdź do treści</a>
      </Button>
      <div className="app-header-content">
        <Image src="/brand/logo.svg" alt="Allegro" width={128} height={43} unoptimized className="app-logo" />
        <span className="app-identity">Asystent reklamacji i zwrotów</span>
      </div>
    </header>
  );
}
