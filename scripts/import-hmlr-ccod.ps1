param(
    [string] $CsvPath = "work/hmlr-prepared/CCOD_HERTSMERE.csv",
    [string] $Endpoint = "https://www.landopportunityfinder.com/api/enrichment/hmlr/corporate"
)

$ErrorActionPreference = "Stop"

$resolvedCsvPath = (Resolve-Path -LiteralPath $CsvPath).Path
$fileInfo = Get-Item -LiteralPath $resolvedCsvPath
if ($fileInfo.Length -gt 4MB) {
    throw "The prepared CSV exceeds the safe Vercel request size. Filter it further before importing."
}

$secureSecret = Read-Host "Atlas ingestion secret" -AsSecureString
$secret = [System.Net.NetworkCredential]::new("", $secureSecret).Password
if ([string]::IsNullOrWhiteSpace($secret)) {
    throw "The Atlas ingestion secret is required."
}

Add-Type -AssemblyName System.Net.Http

$client = [System.Net.Http.HttpClient]::new()
$content = [System.Net.Http.MultipartFormDataContent]::new()
$stream = [System.IO.File]::OpenRead($resolvedCsvPath)
$fileContent = [System.Net.Http.StreamContent]::new($stream)

try {
    $client.DefaultRequestHeaders.Authorization =
        [System.Net.Http.Headers.AuthenticationHeaderValue]::new("Bearer", $secret)
    $fileContent.Headers.ContentType =
        [System.Net.Http.Headers.MediaTypeHeaderValue]::new("text/csv")
    $content.Add($fileContent, "file", $fileInfo.Name)

    $response = $client.PostAsync($Endpoint, $content).GetAwaiter().GetResult()
    $body = $response.Content.ReadAsStringAsync().GetAwaiter().GetResult()

    if (-not $response.IsSuccessStatusCode) {
        throw "Atlas returned HTTP $([int] $response.StatusCode): $body"
    }

    $body | ConvertFrom-Json | ConvertTo-Json -Depth 6
}
finally {
    $secret = $null
    $stream.Dispose()
    $fileContent.Dispose()
    $content.Dispose()
    $client.Dispose()
    Remove-Variable secureSecret -ErrorAction SilentlyContinue
}
