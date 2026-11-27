param([string]$Source = 'client/test-artifacts/task6/extended-after')
Add-Type -AssemblyName System.Drawing
$qaImageRoot = (Resolve-Path -LiteralPath $Source).Path
$qaSheetRoot = Join-Path $qaImageRoot 'sheets'
New-Item -ItemType Directory -Force -Path $qaSheetRoot | Out-Null
$qaGroups = Get-ChildItem -LiteralPath $qaImageRoot -Filter 'visual-*.png' | Group-Object { $_.BaseName -replace '-\d+$','' }
foreach ($qaGroup in $qaGroups) {
  $qaBitmap = [System.Drawing.Bitmap]::new(1700,1500)
  $qaGraphics = [System.Drawing.Graphics]::FromImage($qaBitmap)
  $qaGraphics.Clear([System.Drawing.Color]::White)
  $qaFont = [System.Drawing.Font]::new('Segoe UI',12)
  $qaWidths = @(1920,1366,820,390,360)
  for ($qaIndex=0; $qaIndex -lt 5; $qaIndex++) {
    $qaFile = $qaGroup.Group | Where-Object { $_.BaseName.EndsWith('-'+$qaWidths[$qaIndex]) }
    if (-not $qaFile) { continue }
    $qaImage = [System.Drawing.Image]::FromFile($qaFile.FullName)
    $qaGraphics.DrawString($qaGroup.Name+' '+$qaWidths[$qaIndex],$qaFont,[System.Drawing.Brushes]::Black,($qaIndex*340),0)
    $qaScale = 330.0 / $qaImage.Width
    $qaHeight = [Math]::Min(1000,[int]($qaImage.Height*$qaScale))
    $qaSourceHeight = [int]($qaHeight/$qaScale)
    $qaGraphics.DrawImage($qaImage,[System.Drawing.Rectangle]::new(($qaIndex*340),30,330,$qaHeight),[System.Drawing.Rectangle]::new(0,0,$qaImage.Width,$qaSourceHeight),[System.Drawing.GraphicsUnit]::Pixel)
    if ($qaImage.Height -gt $qaSourceHeight) {
      $qaBottom = [Math]::Min($qaImage.Height,500)
      $qaGraphics.DrawString('Bottom (full image retained)',$qaFont,[System.Drawing.Brushes]::Black,($qaIndex*340),1040)
      $qaGraphics.DrawImage($qaImage,[System.Drawing.Rectangle]::new(($qaIndex*340),1070,330,[int]($qaBottom*$qaScale)),[System.Drawing.Rectangle]::new(0,($qaImage.Height-$qaBottom),$qaImage.Width,$qaBottom),[System.Drawing.GraphicsUnit]::Pixel)
    }
    $qaImage.Dispose()
  }
  $qaBitmap.Save((Join-Path $qaSheetRoot ($qaGroup.Name+'.png')),[System.Drawing.Imaging.ImageFormat]::Png)
  $qaFont.Dispose(); $qaGraphics.Dispose(); $qaBitmap.Dispose()
}
Write-Output ('Created '+$qaGroups.Count+' visual comparison sheets.')
