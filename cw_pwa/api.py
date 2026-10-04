# Copyright (c) 2026, Nest Software Development & C-Water
# For license information, please see license.txt

"""The mobile app's own endpoints. Visit data comes from `cw_visit.api.v1`."""

import frappe
from frappe import _

from cw_pwa import push
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
	return {
		**visit_api.bootstrap(),
		"csrf_token": token,
		"site_name": frappe.local.site,
		# Public by design: browsers need it to subscribe. Absent when push is off.
		"push_public_key": push.public_key() if has_app_access() else None,
	}


@frappe.whitelist(methods=["POST"])
def subscribe_push(subscription: dict | str) -> dict:
	"""Register this browser to receive notifications for the signed-in user."""
	_require_access()
	if not push.is_enabled():
		frappe.throw(_("Notifications are turned off for this site."))
	user_agent = frappe.get_request_header("User-Agent") if frappe.request else None
	push.save_subscription(frappe.parse_json(subscription), user_agent)
	return {"ok": True}


@frappe.whitelist(methods=["POST"])
def unsubscribe_push(endpoint: str) -> dict:
	_require_access()
	push.remove_subscription(endpoint)
	return {"ok": True}


@frappe.whitelist(methods=["POST"])
def test_push() -> dict:
	"""Send a test notification to the caller's own devices."""
	_require_access()
	return push.send_to_user(
		frappe.session.user,
		title=_("Notifications are working"),
		body=_("You will be told here about new visits and requests."),
		url=push.APP_ROUTE + "/alerts",
		tag="cw-test",
	)


def _require_access():
	if not has_app_access():
		frappe.throw(_("Your account does not have access to Visits."), frappe.PermissionError)


def has_app_permission() -> bool:
	"""Show the app tile only to people who can use it."""
	return has_app_access()
