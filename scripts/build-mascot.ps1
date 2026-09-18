<#
  Cuts the mascot's poses out of the reference sheet.

  docs/mascot/reference.png is the source of truth for how the red panda
  looks. Nothing here redraws or recolours it: each pose is cropped from that
  sheet at one shared scale, so every pose keeps the same fur, the same
  charcoal and the same proportions as the original.

  Three things are done to each crop, and only these:

    1. The white page behind the panda is made transparent, by flooding in
       from the edges of the crop. A flood rather than a colour key, because
       the cream on the face and ears is close to white and must not go.

    2. The pale ground shadow is taken out, within a band along the bottom
       only. It is drawn back in CSS instead (Mascot.jsx), in the app's own
       colours, because a cream ellipse baked into the image sat like a light
       puddle on the dark theme.

    3. The soft edge where fur met white is un-blended, so a pose placed on a
       dark background does not carry a white fringe.

  Run from the repository root with Windows PowerShell:
    powershell -ExecutionPolicy Bypass -File scripts/build-mascot.ps1

  Uses System.Drawing, which ships with Windows, so it needs nothing
  installed. The PNGs it writes are committed; it only needs running again if
  the reference changes.
#>

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$reference = Join-Path $root 'docs\mascot\reference.png'
$outDir = Join-Path $root 'src\assets\mascot'

$cs = @'
using System;
using System.Collections.Generic;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;
using System.Runtime.InteropServices;

public static class MascotCutter {
    // Background: near-white. Shadow: light and nearly grey, which the cream
    // markings are not (they are warmer, and never in the bottom band).
    const int WHITE = 246;

    static bool IsWhite(byte r, byte g, byte b) { return r >= WHITE && g >= WHITE && b >= WHITE; }

    static bool IsShadow(byte r, byte g, byte b) {
        int max = Math.Max(r, Math.Max(g, b)), min = Math.Min(r, Math.Min(g, b));
        return min >= 196 && (max - min) <= 42;
    }

    // Returns { width, height, shadowLeft, shadowTop, shadowRight, shadowBottom }
    // for the written image, the shadow in its pixels, so the page can draw
    // the ground back exactly where the reference had it.
    public static int[] Cut(string src, string dst, int x0, int y0, int x1, int y1, int band, double scale) {
        int w = x1 - x0 + 1, h = y1 - y0 + 1;
        byte[] px;
        using (var sheet = new Bitmap(src))
        using (var crop = sheet.Clone(new Rectangle(x0, y0, w, h), PixelFormat.Format32bppArgb)) {
            var data = crop.LockBits(new Rectangle(0, 0, w, h), ImageLockMode.ReadOnly, PixelFormat.Format32bppArgb);
            px = new byte[w * h * 4];
            for (int y = 0; y < h; y++) Marshal.Copy(data.Scan0 + y * data.Stride, px, y * w * 4, w * 4);
            crop.UnlockBits(data);
        }

        // 1 + 2: flood from the border. White anywhere; shadow only in the band.
        var clear = new bool[w * h];
        var stack = new Stack<int>();
        Func<int, int, bool> removable = (x, y) => {
            int o = (y * w + x) * 4; byte b = px[o], g = px[o + 1], r = px[o + 2];
            if (IsWhite(r, g, b)) return true;
            return y >= h - band && IsShadow(r, g, b);
        };
        for (int x = 0; x < w; x++) { Seed(stack, clear, removable, x, 0, w); Seed(stack, clear, removable, x, h - 1, w); }
        for (int y = 0; y < h; y++) { Seed(stack, clear, removable, 0, y, w); Seed(stack, clear, removable, w - 1, y, w); }
        while (stack.Count > 0) {
            int i = stack.Pop(); int cx = i % w, cy = i / w;
            for (int d = 0; d < 4; d++) {
                int nx = cx + (d == 0 ? 1 : d == 1 ? -1 : 0), ny = cy + (d == 2 ? 1 : d == 3 ? -1 : 0);
                if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
                int k = ny * w + nx;
                if (clear[k] || !removable(nx, ny)) continue;
                clear[k] = true; stack.Push(k);
            }
        }

        // Where the ground shadow was: every cleared pixel that was not page.
        int sx0 = w, sy0 = h, sx1 = -1, sy1 = -1;
        for (int y = h - band; y < h; y++) for (int x = 0; x < w; x++) {
            int i = y * w + x, o = i * 4;
            if (!clear[i] || IsWhite(px[o + 2], px[o + 1], px[o])) continue;
            if (x < sx0) sx0 = x; if (x > sx1) sx1 = x; if (y < sy0) sy0 = y; if (y > sy1) sy1 = y;
        }

        // Pockets of page the flood could not reach: white enclosed by the
        // drawing, like the gap where a tail curls against the body, or the
        // inside of a Z. Cleared too, with two exceptions, both judged by
        // what surrounds the pocket a few pixels out (the pixels right next
        // to it are antialiased grey, whatever it sits in):
        //   - ringed by near-black: a highlight in an eye, part of the face
        //   - ringed by pale cream: a light spot inside the face markings
        var visited = new bool[w * h];
        for (int start = 0; start < w * h; start++) {
            if (clear[start] || visited[start]) continue;
            int so = start * 4;
            if (!IsWhite(px[so + 2], px[so + 1], px[so])) continue;
            var region = new List<int>();
            long ringSum = 0, ringWarmth = 0; int ringCount = 0;
            stack.Push(start); visited[start] = true;
            while (stack.Count > 0) {
                int i = stack.Pop(); region.Add(i); int cx = i % w, cy = i / w;
                for (int d = 0; d < 4; d++) {
                    int nx = cx + (d == 0 ? 1 : d == 1 ? -1 : 0), ny = cy + (d == 2 ? 1 : d == 3 ? -1 : 0);
                    if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
                    int k = ny * w + nx, ko = k * 4;
                    if (IsWhite(px[ko + 2], px[ko + 1], px[ko])) {
                        if (!visited[k] && !clear[k]) { visited[k] = true; stack.Push(k); }
                    } else {
                        // Step a further three pixels out, past the antialiasing.
                        int dx = nx - cx, dy = ny - cy;
                        int ox = nx + 3 * dx, oy = ny + 3 * dy;
                        if (ox < 0 || oy < 0 || ox >= w || oy >= h) continue;
                        int oo = (oy * w + ox) * 4;
                        ringSum += (px[oo] + px[oo + 1] + px[oo + 2]) / 3; ringCount++;
                        ringWarmth += px[oo + 2] - px[oo]; // red minus blue
                    }
                }
            }
            long ring = ringCount > 0 ? ringSum / ringCount : 128;
            long warmth = ringCount > 0 ? ringWarmth / ringCount : 0;
            // Cream is warm (the face markings run red over blue by 40 or
            // more); page white glimpsed past a green stroke is not, although
            // it is just as light.
            bool partOfTheDrawing = ring < 60 || (ring > 200 && warmth >= 25);
            if (!partOfTheDrawing) foreach (int i in region) clear[i] = true;
        }

        // Distance (in pixels, up to 4) from anything cleared.
        var dist = new int[w * h];
        for (int i = 0; i < dist.Length; i++) dist[i] = clear[i] ? 0 : 99;
        for (int pass = 0; pass < 4; pass++)
            for (int y = 0; y < h; y++) for (int x = 0; x < w; x++) {
                int i = y * w + x; if (dist[i] <= pass) continue;
                for (int dy = -1; dy <= 1; dy++) for (int dx = -1; dx <= 1; dx++) {
                    int nx = x + dx, ny = y + dy;
                    if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
                    if (dist[ny * w + nx] == pass) { dist[i] = Math.Min(dist[i], pass + 1); }
                }
            }

        // 3: un-blend the edge. A pixel near the cleared area is taken to be
        // some interior colour F laid over what was behind it (white, or the
        // shadow in the band) at coverage a. F comes from the nearest pixel
        // that is fully inside; a follows from how far the pixel sits from
        // the backdrop toward F.
        var outPx = new byte[w * h * 4];
        for (int y = 0; y < h; y++) for (int x = 0; x < w; x++) {
            int i = y * w + x, o = i * 4;
            if (clear[i]) continue; // stays transparent (all zero)
            byte b = px[o], g = px[o + 1], r = px[o + 2];
            if (dist[i] >= 3) { outPx[o] = b; outPx[o + 1] = g; outPx[o + 2] = r; outPx[o + 3] = 255; continue; }

            int fr = r, fg = g, fb = b; bool found = false;
            for (int rad = 1; rad <= 4 && !found; rad++)
                for (int dy = -rad; dy <= rad && !found; dy++) for (int dx = -rad; dx <= rad && !found; dx++) {
                    int nx = x + dx, ny = y + dy;
                    if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
                    int j = ny * w + nx; if (dist[j] < 3) continue;
                    int q = j * 4; fb = px[q]; fg = px[q + 1]; fr = px[q + 2]; found = true;
                }

            // The backdrop this pixel was blended over.
            double br = 255, bg = 255, bb = 255;
            if (y >= h - band) { br = 235; bg = 226; bb = 210; }

            double a = 0;
            a = Math.Max(a, Cov(r, fr, br)); a = Math.Max(a, Cov(g, fg, bg)); a = Math.Max(a, Cov(b, fb, bb));
            if (!found) a = 1;
            a = Math.Min(1, Math.Max(0, a));
            outPx[o] = (byte)fb; outPx[o + 1] = (byte)fg; outPx[o + 2] = (byte)fr; outPx[o + 3] = (byte)Math.Round(a * 255);
        }

        using (var cut = new Bitmap(w, h, PixelFormat.Format32bppArgb)) {
            var data = cut.LockBits(new Rectangle(0, 0, w, h), ImageLockMode.WriteOnly, PixelFormat.Format32bppArgb);
            for (int y = 0; y < h; y++) Marshal.Copy(outPx, y * w * 4, data.Scan0 + y * data.Stride, w * 4);
            cut.UnlockBits(data);

            int tw = (int)Math.Round(w * scale), th = (int)Math.Round(h * scale);
            using (var small = new Bitmap(tw, th, PixelFormat.Format32bppArgb))
            using (var gfx = Graphics.FromImage(small)) {
                gfx.CompositingMode = CompositingMode.SourceCopy;
                gfx.InterpolationMode = InterpolationMode.HighQualityBicubic;
                gfx.PixelOffsetMode = PixelOffsetMode.HighQuality;
                gfx.SmoothingMode = SmoothingMode.HighQuality;
                using (var attrs = new ImageAttributes()) {
                    attrs.SetWrapMode(WrapMode.TileFlipXY); // no dark seam at the edges
                    gfx.DrawImage(cut, new Rectangle(0, 0, tw, th), 0, 0, w, h, GraphicsUnit.Pixel, attrs);
                }
                small.Save(dst, ImageFormat.Png);
                return new[] { tw, th,
                    (int)Math.Round(sx0 * scale), (int)Math.Round(sy0 * scale),
                    (int)Math.Round(sx1 * scale), (int)Math.Round(sy1 * scale) };
            }
        }
    }

    // Coverage implied by one channel: where p sits between backdrop k and colour f.
    static double Cov(double p, double f, double k) {
        double span = f - k;
        if (Math.Abs(span) < 8) return 0; // this channel cannot tell them apart
        return (p - k) / span;
    }

    static void Seed(Stack<int> s, bool[] clear, Func<int, int, bool> ok, int x, int y, int w) {
        int i = y * w + x;
        if (!clear[i] && ok(x, y)) { clear[i] = true; s.Push(i); }
    }
}
'@

Add-Type -TypeDefinition $cs -ReferencedAssemblies System.Drawing

# Boxes found by scanning the sheet for everything that is not white, then
# joining each panda with its own marks (the question mark, the Zs, the
# sparkles). The labels under each pose sit on their own rows and are left
# out. One scale for all five, so the panda is the same size in every pose.
$scale = 0.66
$band = 64
$poses = [ordered]@{
  studying  = @(67, 632, 524, 1079)
  thinking  = @(648, 664, 1137, 1083)
  correct   = @(1225, 664, 1687, 1078)
  resting   = @(1780, 683, 2303, 1083)
  celebrate = @(868, 1197, 1445, 1654)
}

$manifest = [ordered]@{}
foreach ($name in $poses.Keys) {
  $b = $poses[$name]
  $dst = Join-Path $outDir "$name.png"
  $r = [MascotCutter]::Cut($reference, $dst, $b[0], $b[1], $b[2], $b[3], $band, $scale)
  $w = $r[0]; $h = $r[1]
  # The shadow as fractions of the image, so it scales with whatever size the
  # page draws the pose at.
  $manifest[$name] = [ordered]@{
    width  = $w
    height = $h
    ground = [ordered]@{
      left   = [Math]::Round($r[2] / $w, 4)
      top    = [Math]::Round($r[3] / $h, 4)
      width  = [Math]::Round(($r[4] - $r[2] + 1) / $w, 4)
      height = [Math]::Round(($r[5] - $r[3] + 1) / $h, 4)
    }
  }
  $f = Get-Item $dst
  Write-Output ('{0,-10} {1}x{2}  {3,7:N0} bytes' -f $name, $w, $h, $f.Length)
}

# Read by Mascot.jsx. Written by this script and nothing else.
$json = $manifest | ConvertTo-Json -Depth 4
[System.IO.File]::WriteAllText((Join-Path $outDir 'poses.json'), $json + "`n", (New-Object System.Text.UTF8Encoding $false))
