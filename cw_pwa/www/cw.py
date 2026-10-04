# Copyright (c) 2026, Nest Software Development & C-Water
# For license information, please see license.txt

"""Controller for /cw. The template beside it (cw.html) is the Vite build output."""

import frappe

# Never cache: the page carries the visitor's own CSRF token.
no_cache = 1


def get_context(context):
	csrf_token = frappe.sessions.get_csrf_token()
	frappe.db.commit()  # nosemgrep - a GET does not persist a freshly minted token on its own

	# A fresh dict keeps website-theme keys out of the app's HTML. Only non-secret
	# values belong here: the page is cached by the service worker for offline start.
	context = frappe._dict()
	context.csrf_token = csrf_token
	context.site_name = frappe.local.site
	context.lang = frappe.local.lang
	return context
