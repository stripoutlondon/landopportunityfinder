param(
    [Parameter(Mandatory = $true)]
    [string] $GmlPath,

    [string] $BaseUrl = "https://www.landopportunityfinder.com",

    [string] $WorkDirectory = "work/hmlr-inspire"
)

$ErrorActionPreference = "Stop"
$resolvedGml = (Resolve-Path -LiteralPath $GmlPath).Path
$workPath = [System.IO.Path]::GetFullPath((Join-Path (Get-Location) $WorkDirectory))
$workspacePath = [System.IO.Path]::GetFullPath((Get-Location).Path)
if (-not $workPath.StartsWith($workspacePath, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "Work directory must remain inside the repository workspace."
}
New-Item -ItemType Directory -Path $workPath -Force | Out-Null

$candidatesPath = Join-Path $workPath "candidates.json"
$matchesPath = Join-Path $workPath "matches.json"
$secureSecret = Read-Host "Atlas ingestion secret" -AsSecureString
$atlasSecret = [System.Net.NetworkCredential]::new("", $secureSecret).Password

try {
    if ([string]::IsNullOrWhiteSpace($atlasSecret)) {
        throw "Atlas ingestion secret is required."
    }
    $headers = @{ Authorization = "Bearer $atlasSecret" }
    $candidates = Invoke-RestMethod `
        -Method Get `
        -Uri "$($BaseUrl.TrimEnd('/'))/api/enrichment/hmlr/inspire/candidates" `
        -Headers $headers
    $candidates | ConvertTo-Json -Depth 20 | Set-Content -LiteralPath $candidatesPath -Encoding UTF8

    & npx tsx scripts/match-hmlr-inspire.ts `
        --gml $resolvedGml `
        --candidates $candidatesPath `
        --output $matchesPath
    if ($LASTEXITCODE -ne 0) {
        throw "The local INSPIRE matcher failed."
    }

    $payload = Get-Content -LiteralPath $matchesPath -Raw
    $result = Invoke-RestMethod `
        -Method Post `
        -Uri "$($BaseUrl.TrimEnd('/'))/api/enrichment/hmlr/inspire/matches" `
        -Headers $headers `
        -ContentType "application/json" `
        -Body $payload
    $result
}
finally {
    Remove-Variable atlasSecret, secureSecret -ErrorAction SilentlyContinue
}
