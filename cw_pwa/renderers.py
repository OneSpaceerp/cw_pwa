# Copyright (c) 2026, Nest Software Development & C-Water
# For license information, please see license.txt

import os

from werkzeug.wrappers import Response

import frappe
from frappe.website.page_renderers.base_renderer import BaseRenderer

SERVICE_WORKER_ENDPOINT = "cw-service-worker"
APP_SCOPE = "/cw"


class ServiceWorkerPage(BaseRenderer):
	"""Serves the built service worker at /cw/sw.js.

	Vite writes sw.js into public/frontend, which Frappe exposes under
	/assets/cw_pwa/frontend/. A worker loaded from there could only control that
	asset folder. Serving the same file from /cw/sw.js, with
	Service-Worker-Allowed, lets it control the app itself and keeps the setup
	independent of nginx.
	"""

	def can_render(self):
		return self.path == SERVICE_WORKER_ENDPOINT

	def render(self):
		path = frappe.get_app_path("cw_pwa", "public", "frontend", "sw.js")
		if not os.path.exists(path):
			return Response("// service worker not built", status=404, mimetype="text/javascript")

		with open(path, "rb") as handle:
			body = handle.read()

		response = Response(body, mimetype="text/javascript")
		response.headers["Service-Worker-Allowed"] = APP_SCOPE
		# Browsers must always revalidate the worker, or installed apps never update.
		response.headers["Cache-Control"] = "no-cache"
		return response
