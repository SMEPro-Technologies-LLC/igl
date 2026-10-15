#!/usr/bin/env python3
"""Static landing pages for the views that carry the site's substance.

The site is one page with hash routes (#how, #docs, #enterprise). Search engines
and link previews want one address per topic with its own title and
description, so this script writes a plain HTML page for each of those views:
same head, styles, header and footer as index.html, the view's content shown
instead of hidden, a page-specific title, description and canonical, and the
JSON-LD for a WebPage. The interactive parts (the developer console, the User
Center, the Contact Sales form) stay on the main page; the generated pages link
to them.

Run at deploy time (deploy-site.yml) after gen_reference.py:
    python3 platform/site/gen_pages.py platform/site/index.html platform/site
"""
import json, os, re, sys

src, out_dir = sys.argv[1], sys.argv[2]
with open(src, encoding="utf-8") as f:
    html = f.read()

PAGES = [
    {
        "slug": "how-it-works",
        "view": "how",
        "title": "How IGL works: identity, boundary, intent and trace, checked before execution",
        "description": "How Identity Governed Logic runs AI work under rules that are checked before the work happens: who is acting, what they may do, why, and a signed record of what happened.",
    },
    {
        "slug": "docs",
        "view": "docs",
        "title": "IGL API reference: 46 operations, purposes, projections, receipts and MCP tools",
        "description": "The complete reference for the IGL Governed Identity Platform API: authentication, tenancy, purpose-bounded projections, policies, agents, workflows, audit, webhooks, schemas and the seven MCP tools.",
    },
    {
        "slug": "enterprise",
        "view": "enterprise",
        "title": "IGL Enterprise: governed identity for regulated teams and AI agents",
        "description": "What an enterprise deployment of IGL includes: tenants, purpose profiles, policies that fail closed, signed receipts, an audit chain the database refuses to edit, and an operator console.",
    },
]

head_end = html.index("</head>")
head = html[:head_end]
body_start = html.index("<body")
body_open = html[body_start:html.index(">", body_start) + 1]
header = html[html.index('<header class="nav">'):html.index("</header>") + len("</header>")]
footer = html[html.index("<footer>"):html.index("</footer>") + len("</footer>")]
scripts_start = html.index("</footer>") + len("</footer>")
tail = html[scripts_start:]

def view_html(view):
    m = re.search(r'<section class="view[^"]*" (?:id="[^"]*" )?data-view="%s" hidden>' % re.escape(view), html)
    if not m:
        raise SystemExit("no view " + view)
    start = m.start()
    # the view ends at the first "\n</section>" that closes it: count nested sections
    depth, i = 0, start
    while True:
        o = html.find("<section", i)
        c = html.find("</section>", i)
        if c == -1:
            raise SystemExit("unterminated view " + view)
        if o != -1 and o < c:
            depth += 1; i = o + 8
        else:
            depth -= 1; i = c + 10
            if depth == 0:
                return html[start:i].replace(" hidden>", ">", 1)

def page_head(p):
    h = head
    h = re.sub(r"<title>.*?</title>", "<title>%s</title>" % p["title"], h, count=1)
    h = re.sub(r'<meta name="description" content="[^"]*">', '<meta name="description" content="%s">' % p["description"], h, count=1)
    h = h.replace('<link rel="canonical" href="https://id-me.ai/">', '<link rel="canonical" href="https://id-me.ai/%s/">' % p["slug"])
    h = re.sub(r'<meta property="og:title" content="[^"]*">', '<meta property="og:title" content="%s">' % p["title"], h, count=1)
    h = re.sub(r'<meta property="og:description" content="[^"]*">', '<meta property="og:description" content="%s">' % p["description"], h, count=1)
    h = h.replace('<meta property="og:url" content="https://id-me.ai/">', '<meta property="og:url" content="https://id-me.ai/%s/">' % p["slug"])
    h = re.sub(r'<meta name="twitter:title" content="[^"]*">', '<meta name="twitter:title" content="%s">' % p["title"], h, count=1)
    h = re.sub(r'<meta name="twitter:description" content="[^"]*">', '<meta name="twitter:description" content="%s">' % p["description"], h, count=1)
    # page-level structured data replaces the home page's set
    ld = [{"@context": "https://schema.org", "@type": "WebPage", "name": p["title"], "description": p["description"], "url": "https://id-me.ai/%s/" % p["slug"], "isPartOf": {"@type": "WebSite", "name": "IGL, Identity Governed Logic", "url": "https://id-me.ai/"}, "publisher": {"@type": "Organization", "name": "SMEPro Technologies LLC"}},
          {"@context": "https://schema.org", "@type": "BreadcrumbList", "itemListElement": [{"@type": "ListItem", "position": 1, "name": "IGL", "item": "https://id-me.ai/"}, {"@type": "ListItem", "position": 2, "name": p["title"].split(":")[0], "item": "https://id-me.ai/%s/" % p["slug"]}]}]
    h = re.sub(r'<script type="application/ld\+json">.*?</script>\n', '<script type="application/ld+json">%s</script>\n' % json.dumps(ld, separators=(",", ":")), h, count=1, flags=re.S)
    return h

# On a static page, links to other views go to their own pages where one exists
# and back to the main page otherwise; anchors inside the page stay as they are.
VIEW_LINKS = {"how": "/how-it-works/", "docs": "/docs/", "enterprise": "/enterprise/", "top": "/", "sales": "/#sales", "console": "/#console", "account": "/#account", "faq": "/#faq"}
def absolutize(fragment):
    # the docs sidebar links carry data-sec="<section id>"; on the static page they become in-page anchors
    fragment = re.sub(r'href="#docs" data-sec="([a-z-]+)"', r'href="#\1" data-sec="\1"', fragment)
    return re.sub(r'href="#([a-z-]+)"', lambda m: 'href="%s"' % VIEW_LINKS[m.group(1)] if m.group(1) in VIEW_LINKS else m.group(0), fragment)

for p in PAGES:
    body = view_html(p["view"])
    page = page_head(p) + "</head>\n" + body_open + "\n" + absolutize(header) + '\n<main id="main">\n' + absolutize(body) + "\n</main>\n" + absolutize(footer) + "\n</body>\n</html>\n"
    d = os.path.join(out_dir, p["slug"]); os.makedirs(d, exist_ok=True)
    with open(os.path.join(d, "index.html"), "w", encoding="utf-8", newline="\n") as f:
        f.write(page)
    print("wrote", p["slug"], len(page), "bytes")

# sitemap with every page
urls = ["https://id-me.ai/"] + ["https://id-me.ai/%s/" % p["slug"] for p in PAGES] + ["https://id-me.ai/#console", "https://id-me.ai/#account", "https://id-me.ai/#sales"]
with open(os.path.join(out_dir, "sitemap.xml"), "w", encoding="utf-8", newline="\n") as f:
    f.write('<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n')
    for u in urls:
        f.write("  <url><loc>%s</loc><changefreq>weekly</changefreq></url>\n" % u)
    f.write("</urlset>\n")
print("sitemap", len(urls), "urls")
