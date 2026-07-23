param(
    [Parameter(Mandatory = $true)]
    [string] $CcodZip,

    [Parameter(Mandatory = $true)]
    [string] $InspireZip,

    [string] $OutputDirectory = "work/hmlr-prepared",

    [string] $District = "HERTSMERE"
)

$ErrorActionPreference = "Stop"

Add-Type -AssemblyName System.IO.Compression.FileSystem
Add-Type -AssemblyName Microsoft.VisualBasic

function Resolve-SafeInput([string] $Path) {
    $resolved = (Resolve-Path -LiteralPath $Path).Path
    if (-not [System.IO.Path]::IsPathRooted($resolved)) {
        throw "Expected an absolute input path: $Path"
    }
    return $resolved
}

function Convert-ToCsvField([AllowNull()][string] $Value) {
    if ($null -eq $Value) {
        return '""'
    }
    return '"' + $Value.Replace('"', '""') + '"'
}

$ccodPath = Resolve-SafeInput $CcodZip
$inspirePath = Resolve-SafeInput $InspireZip
$outputPath = [System.IO.Path]::GetFullPath((Join-Path (Get-Location) $OutputDirectory))
$workspacePath = [System.IO.Path]::GetFullPath((Get-Location).Path)

if (-not $outputPath.StartsWith($workspacePath, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "Output directory must remain inside the repository workspace."
}

New-Item -ItemType Directory -Path $outputPath -Force | Out-Null

$ccodOutput = Join-Path $outputPath "CCOD_HERTSMERE.csv"
$inspireOutput = Join-Path $outputPath "Hertsmere_Land_Registry_Cadastral_Parcels.gml"
$manifestOutput = Join-Path $outputPath "manifest.json"

$ccodArchive = [System.IO.Compression.ZipFile]::OpenRead($ccodPath)
try {
    $csvEntry = $ccodArchive.Entries |
        Where-Object { $_.FullName.EndsWith(".csv", [System.StringComparison]::OrdinalIgnoreCase) } |
        Select-Object -First 1

    if ($null -eq $csvEntry) {
        throw "The CCOD archive does not contain a CSV file."
    }

    $entryStream = $csvEntry.Open()
    $reader = [Microsoft.VisualBasic.FileIO.TextFieldParser]::new($entryStream)
    $writer = [System.IO.StreamWriter]::new($ccodOutput, $false, [System.Text.UTF8Encoding]::new($false))

    try {
        $reader.TextFieldType = [Microsoft.VisualBasic.FileIO.FieldType]::Delimited
        $reader.SetDelimiters(",")
        $reader.HasFieldsEnclosedInQuotes = $true
        $reader.TrimWhiteSpace = $false

        if ($reader.EndOfData) {
            throw "The CCOD CSV is empty."
        }

        $headers = $reader.ReadFields()
        $districtIndex = [Array]::IndexOf($headers, "District")
        if ($districtIndex -lt 0) {
            throw "The CCOD CSV does not contain a District column."
        }

        $writer.WriteLine(($headers | ForEach-Object { Convert-ToCsvField $_ }) -join ",")
        $rowsSeen = 0
        $rowsAccepted = 0

        while (-not $reader.EndOfData) {
            $fields = $reader.ReadFields()
            $rowsSeen += 1
            if ($fields.Count -le $districtIndex) {
                continue
            }
            if (-not [string]::Equals($fields[$districtIndex], $District, [System.StringComparison]::OrdinalIgnoreCase)) {
                continue
            }
            $writer.WriteLine(($fields | ForEach-Object { Convert-ToCsvField $_ }) -join ",")
            $rowsAccepted += 1
        }
    }
    finally {
        $writer.Dispose()
        $reader.Dispose()
        $entryStream.Dispose()
    }
}
finally {
    $ccodArchive.Dispose()
}

$inspireArchive = [System.IO.Compression.ZipFile]::OpenRead($inspirePath)
try {
    $gmlEntry = $inspireArchive.Entries |
        Where-Object { $_.FullName.EndsWith(".gml", [System.StringComparison]::OrdinalIgnoreCase) } |
        Select-Object -First 1

    if ($null -eq $gmlEntry) {
        throw "The INSPIRE archive does not contain a GML file."
    }

    $sourceStream = $gmlEntry.Open()
    $targetStream = [System.IO.File]::Create($inspireOutput)
    try {
        $sourceStream.CopyTo($targetStream)
    }
    finally {
        $targetStream.Dispose()
        $sourceStream.Dispose()
    }
}
finally {
    $inspireArchive.Dispose()
}

$gmlText = [System.IO.File]::ReadAllText($inspireOutput)
$polygonMatch = [regex]::Match($gmlText, 'numberReturned="(?<count>\d+)"')
$polygonCount = if ($polygonMatch.Success) { [int] $polygonMatch.Groups["count"].Value } else { $null }

$manifest = [ordered]@{
    generatedAt = [DateTimeOffset]::UtcNow.ToString("o")
    district = $District
    ccod = [ordered]@{
        sourceArchive = [System.IO.Path]::GetFileName($ccodPath)
        outputFile = [System.IO.Path]::GetFileName($ccodOutput)
        rowsSeen = $rowsSeen
        rowsAccepted = $rowsAccepted
        sha256 = (Get-FileHash -LiteralPath $ccodOutput -Algorithm SHA256).Hash.ToLowerInvariant()
    }
    inspire = [ordered]@{
        sourceArchive = [System.IO.Path]::GetFileName($inspirePath)
        outputFile = [System.IO.Path]::GetFileName($inspireOutput)
        polygons = $polygonCount
        coordinateReferenceSystem = "EPSG:27700"
        sha256 = (Get-FileHash -LiteralPath $inspireOutput -Algorithm SHA256).Hash.ToLowerInvariant()
    }
}

$manifest | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $manifestOutput -Encoding utf8

Write-Output ($manifest | ConvertTo-Json -Depth 5)
