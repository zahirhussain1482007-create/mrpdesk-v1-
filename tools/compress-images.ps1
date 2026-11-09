param(
  [string]$AssetRoot = "C:\Users\zahir\Downloads\MATTRESS_PRODUCT_ASSETS\MATTRESS_PRODUCT_ASSETS"
)

$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Drawing

$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$OutDir = Join-Path $Root "images"
if (-not (Test-Path $OutDir)) { New-Item -ItemType Directory -Path $OutDir | Out-Null }

$Map = @{
  "sw-pro-latex-plus-royale"         = "Pro_Latex_Plus_Royale"
  "sw-pro-spinetech-luxury"          = "Pro_Spinetech_Luxury"
  "sw-pro-spinetech-premium"         = "Pro_Spinetech_Premium"
  "sw-pro-spinetech-classic-se"      = "Pro_Spinetech_Classic"
  "sw-springfresh-pocket-spring-premium-se" = "Springfresh_Pocket_Spring_Premium"
  "sw-springfresh-pocket-spring-classic-se" = "Springfresh_Pocket_Spring_Classic"
  "sw-nexa-plus-luxury-se"           = "Nexa_Plus_Luxury"
  "sw-nexa-plus-premium"             = "Nexa_Plus_Premium"
  "sw-durafirm-luxury"               = "Durafirm_Luxury"
  "sw-durafirm-latex"                = "Durafirm_Latex"
  "sw-durafirm-premium-se"           = "Durafirm_Premium_Listing1_pp24-25"
  "sw-durafirm-premium-c-se"         = "Durafirm_Premium_Listing2_pp26-27"
  "sw-durafirm-classic-se"           = "Durafirm_Classic_Listing1_pp28-29"
  "sw-durafirm-classic-c-se"         = "Durafirm_Classic_Listing2_pp30-31"
  "sw-fitrest-plus-luxury"           = "FitRest_Plus_Luxury"
  "sw-fitrest-plus-premium-se"       = "FitRest_Plus_Premium"
  "sw-utsav-comfort-premium-s"       = "Utsav_Comfort_Premium"
}

$Codec = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq "image/jpeg" }
$Params = New-Object System.Drawing.Imaging.EncoderParameters(1)
$Params.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter([System.Drawing.Imaging.Encoder]::Quality, [long]80)

foreach ($Key in $Map.Keys) {
  $Source = Join-Path $AssetRoot (Join-Path $Map[$Key] "images\main_product.jpg")
  $Target = Join-Path $OutDir ($Key + ".jpg")
  if (-not (Test-Path $Source)) { Write-Host "MISSING $Source"; continue }

  $Image = [System.Drawing.Image]::FromFile($Source)
  try {
    $MaxWidth = 720
    $Scale = [Math]::Min(1.0, $MaxWidth / $Image.Width)
    $W = [int][Math]::Round($Image.Width * $Scale)
    $H = [int][Math]::Round($Image.Height * $Scale)
    $Bitmap = New-Object System.Drawing.Bitmap($W, $H)
    $Graphics = [System.Drawing.Graphics]::FromImage($Bitmap)
    try {
      $Graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
      $Graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
      $Graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
      $Graphics.DrawImage($Image, 0, 0, $W, $H)
    } finally { $Graphics.Dispose() }
    $Bitmap.Save($Target, $Codec, $Params)
    $Bitmap.Dispose()
  } finally { $Image.Dispose() }
  $KB = [int]((Get-Item $Target).Length / 1024)
  Write-Host "$Key`t${W}x${H}`t${KB} KB"
}
