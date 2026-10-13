#!/usr/bin/env python3
"""Ejemplo minimo para BuscadorSubredditsZombies.

Un POST por lead. La nube califica con Gemini y guarda. No publica en Reddit.

Variables:
  REDDIT_INGEST_URL     https://TU-DOMINIO.vercel.app/api/leads/ingest
  REDDIT_INGEST_SECRET  el mismo secreto que en Vercel
"""

import json
import os
import urllib.error
import urllib.request

URL = os.environ.get(
    "REDDIT_INGEST_URL",
    "https://TU-DOMINIO.vercel.app/api/leads/ingest",
)
SECRET = os.environ.get("REDDIT_INGEST_SECRET", "").strip()

if not SECRET:
    raise SystemExit("Define REDDIT_INGEST_SECRET antes de correr este script.")

payload = {
    "url": "https://www.reddit.com/r/firetvstick/comments/abc123/busco_iptv_para_firestick/",
    "subreddit": "firetvstick",
    "title": "Busco IPTV para Firestick",
    "body": "Se me cayó mi IPTV y quiero otra opción. Uso Firestick en México.",
    "author": "ejemplo_mx",
    "created_at": "2026-10-13T04:00:00Z",
    "kind": "post",
    "local_score": 8,
    "keywords": ["busco iptv", "iptv firestick"],
}

data = json.dumps(payload).encode("utf-8")
request = urllib.request.Request(
    URL,
    data=data,
    method="POST",
    headers={
        "Authorization": f"Bearer {SECRET}",
        "Content-Type": "application/json",
    },
)

try:
    with urllib.request.urlopen(request, timeout=60) as response:
        print(response.status)
        print(response.read().decode("utf-8"))
except urllib.error.HTTPError as error:
    print(error.code)
    print(error.read().decode("utf-8"))
    raise SystemExit(1)
