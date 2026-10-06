import { DataTexture, NearestFilter, RGBAFormat, SRGBColorSpace, UnsignedByteType } from 'three'
import type { RgbaImage } from '../core/image/rgba-image'

/**
 * Textur im Minecraft-Look: Nearest-Neighbor ohne Mipmaps, damit Pixel scharf bleiben.
 * `flipY = false`: Zeile 0 der Bilddaten liegt bei v = 0, passend zu den UVs aus `cube-geometry.ts`.
 */
export function createPixelTexture(image: RgbaImage): DataTexture {
  const texture = new DataTexture(image.data, image.width, image.height, RGBAFormat, UnsignedByteType)
  texture.magFilter = NearestFilter
  texture.minFilter = NearestFilter
  texture.generateMipmaps = false
  texture.flipY = false
  texture.colorSpace = SRGBColorSpace
  texture.needsUpdate = true
  return texture
}
