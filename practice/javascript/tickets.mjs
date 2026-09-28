// Synthetic ticket data only. The exercises deliberately leave two behaviors unfinished.
export function summarizeTicket(ticket) {
  return `${ticket.id}: ${ticket.title}`;
}

export function normalizeTitle(title) {
  return title.trim();
}

export function classifyPriority(ticket) {
  return "normal";
}
