"use client";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export function SessionRecovery({ onConfirm, error, preserve = false }: { onConfirm: () => void; error: string | null; preserve?: boolean }) {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const cancel = useRef<HTMLButtonElement>(null);
  return <div className="mt-4 grid max-w-[800px] min-w-0 gap-4">
    {error && <p role="alert" className="border-l-4 border-primary bg-[#fff3e8] p-4 [overflow-wrap:anywhere]">{error}</p>}
    <Button ref={trigger} type="button" className="h-auto min-h-11 max-w-full justify-self-start whitespace-normal [overflow-wrap:anywhere]" onClick={() => setOpen(true)}>{preserve ? "Rozpocznij nową sprawę, zachowując zapis" : "Wyczyść zapis i rozpocznij nową sprawę"}</Button>
    <Dialog open={open} onOpenChange={setOpen}><DialogContent className="min-w-0 sm:max-w-lg" showCloseButton={false} onOpenAutoFocus={event => { event.preventDefault(); cancel.current?.focus(); }} onCloseAutoFocus={event => { event.preventDefault(); trigger.current?.focus(); }}>
      <DialogHeader className="min-w-0 [overflow-wrap:anywhere]"><DialogTitle>{preserve ? "Rozpocząć nową sprawę, zachowując zapis?" : "Usunąć nieczytelny zapis?"}</DialogTitle><DialogDescription>{preserve ? "Wszystkie zapisane sprawy tej aplikacji zostaną zachowane w tej przeglądarce. Nie można otworzyć bieżącej sprawy. Nowa sprawa otrzyma pusty formularz i nowy identyfikator." : "Wszystkie zapisane sprawy tej aplikacji zostaną usunięte z tej przeglądarki, ponieważ nie można odczytać bieżącego zapisu. Nowa sprawa otrzyma pusty formularz i nowy identyfikator. Tej operacji nie można cofnąć."}</DialogDescription></DialogHeader>
      <DialogFooter className="min-w-0 sm:flex-wrap"><Button ref={cancel} type="button" variant="outline" className="min-h-11" onClick={() => setOpen(false)}>Anuluj</Button><Button type="button" className="h-auto min-h-11 max-w-full whitespace-normal [overflow-wrap:anywhere]" onClick={() => { onConfirm(); setOpen(false); }}>{preserve ? "Zachowaj zapis i rozpocznij nową sprawę" : "Usuń zapis i rozpocznij nową sprawę"}</Button></DialogFooter>
    </DialogContent></Dialog>
  </div>;
}
