# Envia UN lead de prueba al dashboard.
# La app de Windows (BuscadorSubredditsZombies) debe hacer este mismo POST
# por cada post o comentario. Esta app no publica nada en Reddit.
#
# Antes de correrlo:
#   $env:REDDIT_INGEST_URL = "https://TU-DOMINIO.vercel.app/api/leads/ingest"
#   $env:REDDIT_INGEST_SECRET = "el mismo valor que en Vercel"
#   powershell -File .\scripts\send-lead-example.ps1

$ErrorActionPreference = "Stop"

$url = $env:REDDIT_INGEST_URL
if ([string]::IsNullOrWhiteSpace($url)) {
  throw "Define REDDIT_INGEST_URL, por ejemplo https://TU-DOMINIO.vercel.app/api/leads/ingest"
}

$secret = $env:REDDIT_INGEST_SECRET
if ([string]::IsNullOrWhiteSpace($secret)) {
  throw "Define REDDIT_INGEST_SECRET (el mismo secreto que en Vercel)."
}

$lead = @{
  url        = "https://www.reddit.com/r/firetvstick/comments/abc123/busco_iptv_para_firestick/"
  subreddit  = "firetvstick"
  title      = "Busco IPTV para Firestick"
  body       = "Se me cayo mi IPTV y quiero otra opcion. Uso Firestick en Mexico."
  author     = "ejemplo_mx"
  created_at = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
  kind       = "post"
  local_score = 8
  keywords   = @("busco iptv", "iptv firestick")
}

$json = $lead | ConvertTo-Json -Depth 5 -Compress
$bytes = [System.Text.Encoding]::UTF8.GetBytes($json)

$response = Invoke-RestMethod `
  -Method Post `
  -Uri $url `
  -Headers @{ Authorization = "Bearer $secret" } `
  -ContentType "application/json; charset=utf-8" `
  -Body $bytes

$response | ConvertTo-Json -Depth 6
