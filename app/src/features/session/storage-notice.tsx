import { STORAGE_NOTICES, STORAGE_RECOVERY_NOTICE, type StorageWarning } from "./session-adapter";
export function StorageNotice({ warning }: { warning: StorageWarning | null }) {
  if (warning === null) return null;
  return (
    <p role="status" aria-live="polite" aria-atomic="true" className="border-l-4 border-[#ff5a00] bg-[#fff3e8] p-4 text-sm text-[#222222]">
      <strong>{STORAGE_NOTICES[warning]}</strong>{" "}{STORAGE_RECOVERY_NOTICE}
    </p>
  );
}
