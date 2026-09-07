Add-Type -AssemblyName System.Drawing
$imgPath = "src-tauri/icons/app-icon.png"
if (Test-Path $imgPath) {
    $img = [System.Drawing.Bitmap]::FromFile((Resolve-Path $imgPath).Path)
    $c1 = $img.GetPixel(0,0)
    Write-Host "app-icon.png 좌상단 모서리: A=$($c1.A), R=$($c1.R), G=$($c1.G), B=$($c1.B)"
    $img.Dispose()
} else {
    Write-Host "app-icon.png 없음"
}
