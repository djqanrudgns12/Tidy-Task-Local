Add-Type -AssemblyName System.Drawing
$imgPath = "src-tauri/icons/icon.png"
$img = [System.Drawing.Bitmap]::FromFile((Resolve-Path $imgPath).Path)

# 이미지 중앙 픽셀
$center = $img.GetPixel($img.Width / 2, $img.Height / 2)
# 좌측 상단 모서리에서 10% 안쪽 픽셀 (흰색 배경 영역일 것으로 추정되는 곳)
$offset = [math]::Floor($img.Width * 0.15)
$inside = $img.GetPixel($offset, $offset)

Write-Host "중앙 픽셀: A=$($center.A), R=$($center.R), G=$($center.G), B=$($center.B)"
Write-Host "15% 안쪽 픽셀 (배경 추정 영역): A=$($inside.A), R=$($inside.R), G=$($inside.G), B=$($inside.B)"

$img.Dispose()
