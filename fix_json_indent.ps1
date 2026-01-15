# Read the file
$file = Get-Content "frontend/messages/en.json"

# Flag to track if we need to add indentation
$addIndent = $false
$output = @()

for ($i = 0; $i -lt $file.Count; $i++) {
    $line = $file[$i]
    
    # Check if we hit the knowledgeBase closing brace followed by settings
    if ($line -eq "},") {
        # Check if next line starts with "settings
        if ($i + 1 -lt $file.Count -and $file[$i + 1] -match '^"(settings|settingsAi|settingsChats|connectWhatsapp)"') {
            $addIndent = $true
        }
    }
    
    # Check if this is one of the sections that needs fixing
    if ($line -match '^"(settings|settingsAi|settingsChats|connectWhatsapp)"') {
        $line = "  " + $line
    } elseif ($addIndent -and $line -match '^  "' -and $line -notmatch '^    "') {
        # Content lines that should have 4 spaces
        $line = "  " + $line
    } elseif ($addIndent -and $line -eq "},") {
        $line = "  " + $line
    }
    
    $output += $line
}

$output | Set-Content "frontend/messages/en.json" -Encoding UTF8
