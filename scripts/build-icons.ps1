<#
  Builds the app icons from the existing Gunit mark.

  The source is public/assets/Gunit-transparent.png — the same mark the app
  already uses — composited onto Paper (#fbf9f5), the page colour of the app, so
  the icon on a home screen reads as the thing it opens. Nothing is redrawn.

    icon-192.png           192 x 192   purpose "any"       mark at its own framing
    icon-512.png           512 x 512   purpose "any"
    icon-maskable-512.png  512 x 512   purpose "maskable"  mark scaled to 80% so its
                                                            card corners stay inside the
                                                            circle Android crops to
    apple-touch-icon.png   180 x 180   iOS home screen (opaque: iOS paints transparency black)

  Why the maskable one is smaller: the mark fills about 49% x 69% of its canvas,
  which puts its corners 42% from the centre. Android's safe zone is a circle
  of radius 40%. At 80% scale they sit at 34%, with room to spare.

  Run from the repository root with Windows PowerShell:
    powershell -ExecutionPolicy Bypass -File scripts/build-icons.ps1

  Uses System.Drawing, which ships with Windows. The PNGs are committed; this
  only needs running again if the mark changes.
#>

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$root = Split-Path -Parent $PSScriptRoot
$source = Join-Path $root 'public\assets\Gunit-transparent.png'
$outDir = Join-Path $root 'public\icons'
New-Item -ItemType Directory -Force -Path $outDir | Out-Null

# Paper, from --color-paper: oklch(0.982 0.006 85).
$paper = [System.Drawing.Color]::FromArgb(255, 0xfb, 0xf9, 0xf5)

function Write-Icon([string]$name, [int]$size, [double]$scale) {
  $mark = [System.Drawing.Image]::FromFile($source)
  try {
    $canvas = New-Object System.Drawing.Bitmap $size, $size, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $g = [System.Drawing.Graphics]::FromImage($canvas)
    try {
      $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
      $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
      $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
      $g.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
      $g.Clear($paper)
      $side = [int][Math]::Round($size * $scale)
      $offset = [int][Math]::Round(($size - $side) / 2)
      $g.DrawImage($mark, $offset, $offset, $side, $side)
    } finally { $g.Dispose() }
    $path = Join-Path $outDir $name
    $canvas.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
    $canvas.Dispose()
    Write-Output ('{0,-24} {1}x{1}  {2,7:N0} bytes' -f $name, $size, (Get-Item $path).Length)
  } finally { $mark.Dispose() }
}

Write-Icon 'icon-192.png' 192 1.0
Write-Icon 'icon-512.png' 512 1.0
Write-Icon 'icon-maskable-512.png' 512 0.8
Write-Icon 'apple-touch-icon.png' 180 1.0
