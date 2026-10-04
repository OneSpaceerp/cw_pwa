# Copyright (c) 2026, Nest Software Development & C-Water
# For license information, please see license.txt

"""Web Push for the phone app.

Standard Web Push with VAPID, sent straight from this site to the browser
vendors' push services (Google, Apple, Mozilla). There is no relay server and no
Firebase project: the site holds one key pair, generated on first use and kept in
CW PWA Settings.

A push is sent for every Notification Log about a visit or a service request, so
the phone is told about exactly the events the Alerts tab already lists.
"""

import base64
import json

import frappe
from frappe.utils import strip_html

SETTINGS = "CW PWA Settings"
SUBSCRIPTION = "CW Push Subscription"
NOTIFIED_DOCTYPES = ("CW Site Visit", "CW Service Request")
APP_ROUTE = "/cw"
# Push services answer 404 or 410 once a subscription is gone for good.
GONE = (404, 410)


def _b64url(data: bytes) -> str:
	return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


def ensure_keys() -> dict:
	"""Return {"public", "private", "subject"}, creating the key pair the first time."""
	settings = frappe.get_single(SETTINGS)
	private = settings.get_password("vapid_private_key", raise_exception=False)
	if not settings.vapid_public_key or not private:
		from cryptography.hazmat.primitives import serialization
		from cryptography.hazmat.primitives.asymmetric import ec

		key = ec.generate_private_key(ec.SECP256R1())
		private = _b64url(key.private_numbers().private_value.to_bytes(32, "big"))
		settings.vapid_private_key = private
		settings.vapid_public_key = _b64url(
			key.public_key().public_bytes(
				serialization.Encoding.X962, serialization.PublicFormat.UncompressedPoint
			)
		)
		settings.flags.ignore_permissions = True
		settings.save()
		frappe.db.commit()  # nosemgrep - the key must exist before any browser subscribes to it

	return {
		"public": settings.vapid_public_key,
		"private": private,
		"subject": settings.vapid_subject or "mailto:info@cw-eg.com",
	}


def is_enabled() -> bool:
	return bool(frappe.db.get_single_value(SETTINGS, "enable_push"))


def public_key() -> str | None:
	"""The key browsers subscribe with, or None when push is off or unavailable.

	Never raises: this is called while the app starts, and a site that has not been
	migrated yet must still be able to sign people in.
	"""
	try:
		if not is_enabled():
			return None
		return ensure_keys()["public"]
	except Exception:
		frappe.log_error(title="CW PWA: could not prepare push keys")
		return None


def save_subscription(subscription: dict, user_agent: str | None = None) -> str:
	"""Remember a browser's push subscription for the signed-in user."""
	endpoint = (subscription or {}).get("endpoint")
	keys = (subscription or {}).get("keys") or {}
	if not endpoint or not str(endpoint).startswith("https://") or not keys.get("p256dh") or not keys.get("auth"):
		frappe.throw(frappe._("That is not a valid push subscription."))

	values = {
		"user": frappe.session.user,
		"endpoint": endpoint,
		"p256dh": keys["p256dh"],
		"auth": keys["auth"],
		"user_agent": (user_agent or "")[:140],
		"last_seen": frappe.utils.now_datetime(),
	}
	# A phone handed to another engineer keeps its endpoint: move it to the new user.
	existing = frappe.db.get_value(SUBSCRIPTION, {"endpoint": endpoint}, "name")
	if existing:
		frappe.db.set_value(SUBSCRIPTION, existing, values)
		return existing

	doc = frappe.get_doc({"doctype": SUBSCRIPTION, **values})
	doc.insert(ignore_permissions=True)
	return doc.name


def remove_subscription(endpoint: str) -> None:
	frappe.db.delete(SUBSCRIPTION, {"endpoint": endpoint, "user": frappe.session.user})


def on_notification_log(doc, method=None):
	"""doc_event: queue a push for alerts about visits and service requests."""
	if doc.document_type not in NOTIFIED_DOCTYPES or not doc.for_user:
		return
	try:
		wanted = is_enabled() and frappe.db.exists(SUBSCRIPTION, {"user": doc.for_user})
	except Exception:
		# A push problem must never stop the alert itself from being saved.
		frappe.log_error(title="CW PWA: could not queue a push")
		return
	if not wanted:
		return

	url = APP_ROUTE + "/alerts"
	if doc.document_type == "CW Site Visit" and doc.document_name:
		url = f"{APP_ROUTE}/visits/{doc.document_name}"

	frappe.enqueue(
		"cw_pwa.push.send_to_user",
		queue="short",
		enqueue_after_commit=True,
		user=doc.for_user,
		title=strip_html(doc.subject or "")[:120],
		body=strip_html(doc.email_content or "")[:240] if doc.email_content != doc.subject else "",
		url=url,
		tag=f"{doc.document_type}:{doc.document_name}",
	)


def send_to_user(user: str, title: str, body: str = "", url: str = APP_ROUTE, tag: str | None = None) -> dict:
	"""Send one notification to every device the user registered. Returns counts."""
	from pywebpush import WebPushException, webpush

	keys = ensure_keys()
	payload = json.dumps({"title": title, "body": body, "url": url, "tag": tag})
	sent = failed = removed = 0

	for row in frappe.get_all(SUBSCRIPTION, filters={"user": user}, fields=["name", "endpoint", "p256dh", "auth"]):
		try:
			webpush(
				subscription_info={"endpoint": row.endpoint, "keys": {"p256dh": row.p256dh, "auth": row.auth}},
				data=payload,
				vapid_private_key=keys["private"],
				vapid_claims={"sub": keys["subject"]},
				ttl=24 * 60 * 60,
				timeout=10,
			)
			sent += 1
		except WebPushException as error:
			status = getattr(error.response, "status_code", None)
			if status in GONE:
				frappe.delete_doc(SUBSCRIPTION, row.name, ignore_permissions=True, force=True)
				removed += 1
			else:
				failed += 1
				frappe.log_error(title="CW PWA: push failed", message=f"{status}: {error}")
		except Exception:
			failed += 1
			frappe.log_error(title="CW PWA: push failed")

	return {"sent": sent, "failed": failed, "removed": removed}
