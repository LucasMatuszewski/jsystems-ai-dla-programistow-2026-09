"""Synthetic ticket exercise. Two behaviors are deliberately unfinished."""


def summarize_ticket(ticket):
    return f"{ticket['id']}: {ticket['title']}"


def normalize_title(title):
    return title.strip()


def classify_priority(ticket):
    return "normal"
