"use client";
import type { RefObject } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export function NewCaseDialog({ open, onOpenChange, onConfirm, triggerRef }: { open: boolean; onOpenChange: (open: boolean) => void; onConfirm: () => void; triggerRef: RefObject<HTMLButtonElement | null> }) {
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="min-w-0 sm:max-w-lg" showCloseButton={false} onCloseAutoFocus={event => { event.preventDefault(); triggerRef.current?.focus(); }}>
    <DialogHeader className="min-w-0 [overflow-wrap:anywhere]"><DialogTitle>Rozpocząć nową sprawę?</DialogTitle><DialogDescription className="min-w-0 [overflow-wrap:anywhere]">Bieżąca sprawa zostanie zachowana w tej przeglądarce. Trwające przygotowanie oceny zostanie przerwane. Nowa sprawa otrzyma pusty formularz i nowy identyfikator.</DialogDescription></DialogHeader>
    <DialogFooter className="min-w-0 sm:flex-wrap"><Button className="min-h-11 max-w-full" type="button" variant="outline" autoFocus onClick={() => onOpenChange(false)}>Anuluj</Button><Button className="h-auto min-h-11 max-w-full whitespace-normal [overflow-wrap:anywhere]" type="button" onClick={onConfirm}>Rozpocznij nową sprawę</Button></DialogFooter>
  </DialogContent></Dialog>;
}
