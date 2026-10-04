# Copyright (c) 2026, Nest Software Development & C-Water
# For license information, please see license.txt

"""The mobile app's own endpoints. Visit data comes from `cw_visit.api.v1`."""

import frappe

from cw_visit.api import v1 as visit_api
from cw_visit.permissions import has_app_access


@frappe.whitelist(allow_guest=True)
def boot() -> dict:
	"""Session bootstrap: who is signed in, plus the CSRF token for later writes.

	Open to guests on purpose, so a signed-out phone gets a clean "Guest" answer and
	shows the login screen. A guest receives nothing else. The token is tied to the
	caller's own session and is only readable same-origin.
	"""
	if frappe.session.user == "Guest":
		return {"user": "Guest", "site_name": frappe.local.site}

	token = frappe.sessions.get_csrf_token()
	frappe.db.commit()  # nosemgrep - persists a token minted on this GET
	return {**visit_api.bootstrap(), "csrf_token": token, "site_name": frappe.local.site}


def has_app_permission() -> bool:
	"""Show the app tile only to people who can use it."""
	return has_app_access()
