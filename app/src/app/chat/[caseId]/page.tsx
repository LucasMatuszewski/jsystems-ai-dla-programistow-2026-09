import { CaseShell } from "@/features/case-shell/case-shell";

export default async function CaseChatPage({ params }: { params: Promise<{ caseId: string }> }) {
  const { caseId } = await params;
  return <CaseShell screen="chat" caseId={caseId} />;
}
