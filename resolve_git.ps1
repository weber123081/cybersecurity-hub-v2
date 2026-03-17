$shell = New-Object -ComObject WScript.Shell
$shortcutPath = "C:\ProgramData\Microsoft\Windows\Start Menu\Programs\Git\Git Bash.lnk"
if (Test-Path $shortcutPath) {
    $shortcut = $shell.CreateShortcut($shortcutPath)
    Write-Host "Target: $($shortcut.TargetPath)"
} else {
    Write-Host "Shortcut not found"
}
