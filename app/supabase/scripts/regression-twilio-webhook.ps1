# Regressão pós-deploy: webhook Twilio enfileira job + worker processa (smoke test).
# Requer secrets locais: SUPABASE_SERVICE_ROLE_KEY, TWILIO_AUTH_TOKEN (para assinatura válida).
#
# Uso (PowerShell, na pasta app/):
#   $env:SUPABASE_SERVICE_ROLE_KEY = "..."
#   $env:TWILIO_AUTH_TOKEN = "..."
#   .\supabase\scripts\regression-twilio-webhook.ps1

$ErrorActionPreference = "Stop"

$projectRef = "zdmecbyyfubpmwrzzbqf"
$webhookUrl = "https://$projectRef.supabase.co/functions/v1/twilio-whatsapp-webhook"
$serviceKey = $env:SUPABASE_SERVICE_ROLE_KEY
$twilioToken = $env:TWILIO_AUTH_TOKEN

if (-not $serviceKey) { throw "Defina SUPABASE_SERVICE_ROLE_KEY" }
if (-not $twilioToken) { throw "Defina TWILIO_AUTH_TOKEN para assinatura Twilio válida" }

$testSid = "SM_REGRESSION_" + [guid]::NewGuid().ToString("N").Substring(0, 24)
$testPhone = "whatsapp:+5511999999999"
$body = "Confirmar"
$buttonPayload = "confirmar00000000-0000-4000-8000-000000000001"

# Monta form-urlencoded como Twilio
$formParams = [ordered]@{
  MessageSid = $testSid
  From       = $testPhone
  To         = "whatsapp:+5511888888888"
  Body       = $body
  ButtonPayload = $buttonPayload
}

# Assinatura HMAC-SHA1 (mesmo algoritmo de twilioWhatsapp.ts)
$sortedKeys = $formParams.Keys | Sort-Object
$data = $webhookUrl
foreach ($key in $sortedKeys) { $data += "$key$($formParams[$key])" }

$hmac = New-Object System.Security.Cryptography.HMACSHA1
$hmac.Key = [Text.Encoding]::UTF8.GetBytes($twilioToken)
$hashBytes = $hmac.ComputeHash([Text.Encoding]::UTF8.GetBytes($data))
$signature = [Convert]::ToBase64String($hashBytes)

$formBody = ($formParams.GetEnumerator() | ForEach-Object {
  "{0}={1}" -f [uri]::EscapeDataString($_.Key), [uri]::EscapeDataString($_.Value)
}) -join "&"

Write-Host "POST $webhookUrl (MessageSid=$testSid)" -ForegroundColor Cyan
$response = Invoke-WebRequest -Uri $webhookUrl -Method POST `
  -Headers @{ "X-Twilio-Signature" = $signature; "Content-Type" = "application/x-www-form-urlencoded" } `
  -Body $formBody -UseBasicParsing

Write-Host "Webhook status: $($response.StatusCode)" -ForegroundColor $(if ($response.StatusCode -eq 200) { "Green" } else { "Red" })
if ($response.Content -notmatch "<Response") { throw "Resposta não é TwiML vazio" }

# Verifica job na fila via REST (service role)
$headers = @{
  "apikey"        = $serviceKey
  "Authorization" = "Bearer $serviceKey"
}

$jobQuery = "inbound_message_id=eq.$testSid&provider=eq.twilio&select=id,provider,inbound_message_id,telefone,body,button_payload,status"
$jobUrl = "https://$projectRef.supabase.co/rest/v1/whatsapp_webhook_jobs?$jobQuery"
$jobs = Invoke-RestMethod -Uri $jobUrl -Headers $headers -Method GET

if ($jobs.Count -lt 1) { throw "Job não encontrado na fila (inbound_message_id=$testSid)" }
Write-Host "Job enfileirado: $($jobs[0].id) provider=$($jobs[0].provider)" -ForegroundColor Green

# Invoca worker
$workerUrl = "https://$projectRef.supabase.co/functions/v1/process-whatsapp-webhook-jobs"
$workerResp = Invoke-RestMethod -Uri $workerUrl -Method POST `
  -Headers @{ "Authorization" = "Bearer $serviceKey"; "Content-Type" = "application/json" } `
  -Body "{}"

Write-Host "Worker: claimed=$($workerResp.claimed) done=$($workerResp.done) failed=$($workerResp.failed)" -ForegroundColor Green

# Verifica job done
$jobsAfter = Invoke-RestMethod -Uri $jobUrl -Headers $headers -Method GET
if ($jobsAfter[0].status -ne "done") {
  Write-Warning "Job status=$($jobsAfter[0].status) - verifique agendamento de teste ou last_error"
} else {
  Write-Host "Regressao OK: webhook Twilio enfileirou e worker processou sem erro de schema." -ForegroundColor Green
}
