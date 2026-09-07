Add-Type -AssemblyName System.Drawing
$imgPath = "src-tauri/icons/icon.png"
$img = [System.Drawing.Bitmap]::FromFile((Resolve-Path $imgPath).Path)
$c1 = $img.GetPixel(0,0)
$c2 = $img.GetPixel($img.Width - 1, 0)
Write-Host "좌상단 모서리 (0,0): A=$($c1.A), R=$($c1.R), G=$($c1.G), B=$($c1.B)"
Write-Host "우상단 모서리: A=$($c2.A), R=$($c2.R), G=$($c2.G), B=$($c2.B)"
$img.Dispose()
