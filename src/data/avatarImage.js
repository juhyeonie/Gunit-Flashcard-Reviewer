/**
 * Turning a photo into a profile picture: the middle square of it, 256 pixels
 * a side, as WebP — or JPEG where a browser cannot write WebP.
 *
 * Done in the browser, before anything is sent. A phone photo is several
 * megabytes and thousands of pixels across; what is stored is a few
 * kilobytes, which is all a 28-pixel disc in the top bar will ever need.
 *
 * On its own because it is the one part that needs a real canvas. Tests
 * replace this module and exercise everything around it.
 */

/** The side of the stored square, in pixels: sharp at 2× on the largest place it is shown. */
export const AVATAR_PIXELS = 256

/** EXIF rotation applied, so a portrait taken on a phone is not stored on its side. */
function decode(file) {
  if (typeof createImageBitmap === 'function') {
    return createImageBitmap(file, { imageOrientation: 'from-image' })
  }
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const image = new Image()
    image.onload = () => {
      URL.revokeObjectURL(url)
      resolve(image)
    }
    image.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('unreadable'))
    }
    image.src = url
  })
}

const toBlob = (canvas, type, quality) =>
  new Promise((resolve) => canvas.toBlob((blob) => resolve(blob), type, quality))

/**
 * The centred square of `file`, scaled to `size`. Throws on a file the
 * browser cannot decode, whatever its name or type says.
 */
export async function squareAvatar(file, size = AVATAR_PIXELS) {
  const image = await decode(file)
  const width = image.width
  const height = image.height
  if (!width || !height) throw new Error('unreadable')
  const side = Math.min(width, height)

  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const context = canvas.getContext('2d')
  context.imageSmoothingQuality = 'high'
  context.drawImage(image, (width - side) / 2, (height - side) / 2, side, side, 0, 0, size, size)
  image.close?.()

  // A browser that cannot write WebP quietly writes PNG instead, which would
  // be ten times the size; JPEG is the fallback it can always write.
  const webp = await toBlob(canvas, 'image/webp', 0.86)
  if (webp?.type === 'image/webp') return webp

  // JPEG has no transparency: a transparent PNG goes on white rather than black.
  const flat = document.createElement('canvas')
  flat.width = size
  flat.height = size
  const paint = flat.getContext('2d')
  paint.fillStyle = '#ffffff'
  paint.fillRect(0, 0, size, size)
  paint.drawImage(canvas, 0, 0)
  const jpeg = await toBlob(flat, 'image/jpeg', 0.88)
  if (!jpeg) throw new Error('unreadable')
  return jpeg
}

/** A blob as a `data:` URL, which is what is kept on the device for offline. */
export const blobToDataUrl = (blob) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(blob)
  })
