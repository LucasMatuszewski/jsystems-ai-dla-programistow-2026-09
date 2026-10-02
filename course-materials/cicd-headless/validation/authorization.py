"""Synthetic PR-Agent integration fixture; no production callers or real data."""


def may_read_invoice(actor_id, owner_id, is_admin=False):
    """Allow only the invoice owner or an administrator to read an invoice."""
    return actor_id != owner_id or is_admin
