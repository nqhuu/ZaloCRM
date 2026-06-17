param(
  [string]$DataRoot = "D:\ZaloCrmDB"
)

$directories = @(
  "app-files",
  "postgres",
  "redis",
  "minio",
  "backups"
)

New-Item -ItemType Directory -Force -Path $DataRoot | Out-Null

foreach ($directory in $directories) {
  New-Item -ItemType Directory -Force -Path (Join-Path $DataRoot $directory) | Out-Null
}

Write-Host "Prepared persistent data directories under $DataRoot"
