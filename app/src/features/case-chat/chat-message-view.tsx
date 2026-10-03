import type { CaseMessage, ReplyState } from "@/lib/contracts/messages";
import { Message, MessageContent, MessageResponse } from "@/components/ai-elements/message";

export const CHAT_ASSESSMENT_NOTICE = "To wstępna ocena, a nie ostateczna decyzja. Pracownik musi zweryfikować fakty i właściwą procedurę przed podjęciem decyzji.";
export function ChatMessageView({ message, state }: { message: CaseMessage; state?: ReplyState }) {
  const assistant = message.role === "assistant";
  return <Message from={message.role} className="max-w-full min-w-0"><MessageContent className="w-full min-w-0">
    <article aria-label={assistant ? "Wiadomość asystenta" : "Wiadomość pracownika"} data-message-id={message.id} className="grid min-w-0 gap-3 rounded-[16px] border bg-card p-4 [overflow-wrap:anywhere] sm:p-6">
      <p className="text-sm text-muted-foreground">{assistant ? "Asystent" : "Pracownik"}</p>
      <div data-message-content>{assistant ? <MessageResponse skipHtml controls={false} isAnimating={state === "streaming"}>{message.parts.map(part => part.text).join("")}</MessageResponse> : <p className="whitespace-pre-wrap">{message.parts.map(part => part.text).join("")}</p>}</div>
      {assistant && <p data-assessment-notice className="border-l-4 border-primary bg-[#fff3e8] p-4">{CHAT_ASSESSMENT_NOTICE}</p>}
      {assistant && (state === "failed" || state === "interrupted") && <p className="text-sm text-muted-foreground">Ta odpowiedź nie została ukończona.</p>}
    </article>
  </MessageContent></Message>;
}
