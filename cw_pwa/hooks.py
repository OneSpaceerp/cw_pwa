app_name = "cw_pwa"
app_title = "C-Water Mobile"
app_publisher = "Nest Software Development"
app_description = "Installable mobile app for C-Water field engineers, served by ERPNext v16"
app_email = "info@nsd-eg.com"
app_license = "mit"

# All visit data and rules live in cw_visit; this app is only the mobile client.
required_apps = ["frappe/erpnext", "cw_visit"]

app_logo_url = "/assets/cw_pwa/manifest/icon-192.png"
app_home = "/cw"

add_to_apps_screen = [
	{
		"name": "cw_pwa",
		"logo": "/assets/cw_pwa/manifest/icon-192.png",
		"title": "C-Water Mobile",
		"route": "/cw",
		"has_permission": "cw_pwa.api.has_app_permission",
	}
]

# The single-page app owns everything under /cw. The page name "cw" pairs
# www/cw.html (build output) with www/cw.py (the boot controller).
# /cw/sw.js is listed first so the service worker is served from inside the
# app's own path and can control it without any web-server configuration.
website_route_rules = [
	{"from_route": "/cw/sw.js", "to_route": "cw-service-worker"},
	{"from_route": "/cw/<path:app_path>", "to_route": "cw"},
]

page_renderer = ["cw_pwa.renderers.ServiceWorkerPage"]

# Every alert about a visit or a service request is also pushed to the user's phones.
doc_events = {
	"Notification Log": {"after_insert": "cw_pwa.push.on_notification_log"},
}
