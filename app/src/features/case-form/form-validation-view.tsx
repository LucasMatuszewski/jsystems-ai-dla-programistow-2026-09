export function FormValidationView({ id, messages }: { id: string; messages?: readonly string[] }) {
  if (!messages?.length) return null;
  return <div id={id} className="text-sm text-destructive">{messages.map((message, index) => <p key={index}>{message}</p>)}</div>;
}
