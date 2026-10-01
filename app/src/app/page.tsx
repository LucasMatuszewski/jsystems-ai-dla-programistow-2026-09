"use client";

import { useState } from "react";
import { CaseForm, type CaseFormValues } from "@/features/case-form/case-form";

export default function Home() {
  const [values, setValues] = useState<CaseFormValues>({
    scenario: "", category: "", equipmentName: "", purchaseDate: "", deliveryDate: "",
    buyerStatus: "", sellerStatus: "", reason: "", requestedRemedy: "",
  });
  const [valid, setValid] = useState(false);
  return (
    <main id="main-content" tabIndex={-1} className="app-main">
      <section className="app-intro" aria-labelledby="intro-title">
        <h1 id="intro-title">Wstępna ocena sprawy</h1>
        <p>Asystent pomaga pracownikowi przygotować wstępną ocenę reklamacji lub zwrotu. Wynik wymaga sprawdzenia i nie jest ostateczną decyzją w sprawie klienta.</p>
        <div className="privacy-notice">
          <h2>Bez danych osobowych</h2>
          <p>Nie wprowadzaj danych osobowych klientów ani informacji pozwalających ich zidentyfikować. Nie umieszczaj danych osobowych w opisach ani na zdjęciach. Aplikacja nie służy do prowadzenia kartoteki klientów.</p>
        </div>
      </section>
      <CaseForm value={values} onChange={(next) => { setValues(next); setValid(false); }} onValidSubmit={() => setValid(true)} />
      <p role="status" className="mt-4 max-w-[800px] text-sm">{valid ? "Dane formularza są poprawne." : ""}</p>
    </main>
  );
}
