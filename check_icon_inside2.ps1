Add-Type -AssemblyName System.Drawing
$imgPath = "src-tauri/icons/app-icon.png"
$img = [System.Drawing.Bitmap]::FromFile((Resolve-Path $imgPath).Path)
$center = $img.GetPixel($img.Width / 2, $img.Height / 2)
$offset = [math]::Floor($img.Width * 0.15)
$inside = $img.GetPixel($offset, $offset)
Write-Host "app-icon.png 중앙 픽셀: A=$($center.A), R=$($center.R), G=$($center.G), B=$($center.B)"
Write-Host "app-icon.png 15% 안쪽 픽셀: A=$($inside.A), R=$($inside.R), G=$($inside.G), B=$($inside.B)"
$img.Dispose()
