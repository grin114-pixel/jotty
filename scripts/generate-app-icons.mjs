import sharp from 'sharp'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const sourcePath = path.join(root, 'public', 'header-icon.png')
const trimmed = await sharp(sourcePath).trim({ threshold: 12 }).png().toBuffer()

async function createIcon(size, outputName, fillRatio) {
  const contentSize = Math.round(size * fillRatio)
  const padding = Math.floor((size - contentSize) / 2)

  await sharp(trimmed)
    .resize(contentSize, contentSize, {
      fit: 'contain',
      background: { r: 255, g: 255, b: 255, alpha: 1 },
    })
    .extend({
      top: padding,
      bottom: size - contentSize - padding,
      left: padding,
      right: size - contentSize - padding,
      background: { r: 255, g: 255, b: 255, alpha: 1 },
    })
    .png()
    .toFile(path.join(root, 'public', outputName))
}

await createIcon(512, 'app-icon-512.png', 0.95)
await createIcon(192, 'app-icon-192.png', 0.95)
await createIcon(180, 'app-icon-180.png', 0.95)

console.log('Generated app-icon-512.png, app-icon-192.png, app-icon-180.png')
