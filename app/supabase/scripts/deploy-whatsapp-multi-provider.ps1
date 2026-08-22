# Deploy ATÔMICO: migration + Edge Functions (evita janela onde webhook Twilio quebra).
# Uso (PowerShell, na pasta app/):
#   .\supabase\scripts\deploy-whatsapp-multi-provider.ps1

$ErrorActionPreference = "Stop"
Set-Location (Split-Path (Split-Path $PSScriptRoot -Parent) -Parent)  # app/

Write-Host "=== 1/2 Migration SQL ===" -ForegroundColor Cyan
supabase db push --yes
if ($LASTEXITCODE -ne 0) { throw "supabase db push falhou" }

Write-Host "=== 2/2 Edge Functions ===" -ForegroundColor Cyan
$functions = @(
  "twilio-whatsapp-webhook",
  "infobip-whatsapp-webhook",
  "infobip-send-test",
  "process-whatsapp-webhook-jobs",
  "process-appointment-reminders",
  "process-appointment-reminder-3h"
)

foreach ($fn in $functions) {
  Write-Host "Deploying $fn ..."
  supabase functions deploy $fn --no-verify-jwt --yes
  if ($LASTEXITCODE -ne 0) { throw "Deploy de $fn falhou" }
}

Write-Host ""
Write-Host "Deploy atômico concluído. Rode o teste de regressão:" -ForegroundColor Green
Write-Host "  .\supabase\scripts\regression-twilio-webhook.ps1" -ForegroundColor Green
