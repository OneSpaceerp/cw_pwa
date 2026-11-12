# Copyright (c) 2026, Nest Software Development & C-Water
# For license information, please see license.txt

"""Sign-in for the native (iOS / Android) app.

The native app runs from its own origin (https://localhost on Android,
capacitor://localhost on iOS), so the browser session cookie of the web app does
not reach the site. Instead the engineer signs in once with username and password
and the phone receives a device token:

- the token is random (256 bits) and only its SHA-256 hash is stored, on CW App Device;
- every request carries it in the X-CW-Device-Token header; `authenticate_device`
  (an auth hook) turns it into the signed-in user;
- an administrator signs a phone out by unticking "Signed In" on its CW App Device;
- disabling the user stops every phone at once.

The user's own API keys are never touched, so integrations using them keep working.
"""

import hashlib
import secrets

import frappe
from frappe import _
from frappe.rate_limiter import rate_limit
from frappe.utils import add_to_date, now_datetime

DEVICE = "CW App Device"
HEADER = "X-CW-Device-Token"
# Where the native app's pages come from. Only these origins are let through CORS.
NATIVE_ORIGINS = ("https://localhost", "capacitor://localhost")
# Only the app's own API, and private files (evidence photos), are opened to the native origins.
NATIVE_PATHS = ("/api/method/cw_", "/private/files/")
LAST_SEEN_EVERY_MINUTES = 10


def _hash(token: str) -> str:
	return hashlib.sha256(token.encode()).hexdigest()


def authenticate_device():
	"""auth hook: a request from the native app, signed in with a device token."""
	request = frappe.local.request
	if not request:
		return

	origin = request.headers.get("Origin")
	if origin in NATIVE_ORIGINS and request.path.startswith(NATIVE_PATHS):
		configured = frappe.conf.allow_cors or []
		if configured != "*":
			configured = configured if isinstance(configured, list) else [configured]
			frappe.local.allow_cors = [*configured, origin]

	token = request.headers.get(HEADER)
	if not token or frappe.session.user not in ("Guest", "", None):
		return

	device = frappe.db.get_value(
		DEVICE, {"token_hash": _hash(token.strip())}, ["name", "user", "enabled", "last_seen"], as_dict=True
	)
	if not device or not device.enabled or not frappe.db.get_value("User", device.user, "enabled"):
		raise frappe.AuthenticationError

	frappe.set_user(device.user)
	frappe.local.cw_device = device.name
	if not device.last_seen or device.last_seen < add_to_date(now_datetime(), minutes=-LAST_SEEN_EVERY_MINUTES):
		frappe.db.set_value(DEVICE, device.name, "last_seen", now_datetime(), update_modified=False)


def current_device() -> str | None:
	return getattr(frappe.local, "cw_device", None)


@frappe.whitelist(allow_guest=True, methods=["POST"])
@rate_limit(limit=10, seconds=10 * 60)
def login(usr: str, pwd: str, device_name: str | None = None, platform: str | None = None,
		  app_version: str | None = None) -> dict:
	"""Check the password and give this phone a device token."""
	from frappe.auth import LoginManager
	from frappe.twofactor import should_run_2fa

	from cw_pwa.api import has_app_permission

	if frappe.get_system_settings("disable_user_pass_login"):
		frappe.throw(_("Login with username and password is not allowed."), frappe.AuthenticationError)

	manager = LoginManager.__new__(LoginManager)
	manager.authenticate(user=usr, pwd=pwd)  # counts failed attempts and locks out like the web login
	user = manager.user

	if should_run_2fa(user):
		frappe.throw(_("Two-factor sign-in is not supported in the app yet. Ask your administrator."),
					 frappe.AuthenticationError)

	frappe.set_user(user)
	if not has_app_permission():
		frappe.throw(_("Your account cannot use the C-Water app."), frappe.PermissionError)

	token = secrets.token_urlsafe(32)
	device = frappe.get_doc(
		{
			"doctype": DEVICE,
			"user": user,
			"device_name": (device_name or "").strip()[:140] or _("Phone"),
			"platform": platform if platform in ("Android", "iOS") else None,
			"app_version": (app_version or "").strip()[:40],
			"enabled": 1,
			"signed_in_on": now_datetime(),
			"last_seen": now_datetime(),
			"token_hash": _hash(token),
		}
	)
	device.insert(ignore_permissions=True)
	frappe.db.commit()  # nosemgrep - the token must exist before the app uses it
	return {"token": token, "user": user, "device": device.name}


@frappe.whitelist(methods=["POST"])
def logout() -> dict:
	"""Sign this phone out: its token stops working."""
	device = current_device()
	if device:
		frappe.db.set_value(DEVICE, device, {"enabled": 0, "push_token": None}, update_modified=False)
	return {"ok": True}


@frappe.whitelist(methods=["POST"])
def register_push_token(token: str) -> dict:
	"""The phone's Firebase Cloud Messaging token, for native notifications."""
	device = current_device()
	if not device:
		frappe.throw(_("Only the native app registers a push token."))
	token = (token or "").strip()
	if not token or len(token) > 4096:
		frappe.throw(_("That is not a valid push token."))
	# A token moves with the phone, not the user: drop it from any other device row.
	for other in frappe.get_all(DEVICE, filters={"push_token": token, "name": ["!=", device]}, pluck="name"):
		frappe.db.set_value(DEVICE, other, "push_token", None, update_modified=False)
	frappe.db.set_value(DEVICE, device, "push_token", token, update_modified=False)
	return {"ok": True}
