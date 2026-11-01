import { PDFDocument } from 'pdf-lib'
import { createHash } from 'node:crypto'

function dataUrlBytes(dataUrl) {
  const comma = dataUrl.indexOf(',')
  if (comma < 0) throw new Error('รูปภาพลายเซ็นไม่ถูกต้อง')
  return Buffer.from(dataUrl.slice(comma + 1), 'base64')
}

export async function applyLayers(sourceBytes, layers) {
  const pdf = await PDFDocument.load(sourceBytes)
  const pages = pdf.getPages()
  for (const layer of layers) {
    const pageIndex = Number(layer.page_number) - 1
    if (pageIndex < 0 || pageIndex >= pages.length) {
      throw new Error(`ลายเซ็นมีเลขหน้าไม่ถูกต้อง: ${layer.page_number}`)
    }
    if (!layer.image_data) throw new Error('ไม่พบภาพลายเซ็น')
    const bytes = dataUrlBytes(layer.image_data)
    const image = layer.image_data.startsWith('data:image/jpeg')
      ? await pdf.embedJpg(bytes)
      : await pdf.embedPng(bytes)
    const page = pages[pageIndex]
    const width = page.getWidth()
    const height = page.getHeight()
    page.drawImage(image, {
      x: width * Number(layer.x_ratio),
      y: height * (1 - Number(layer.y_ratio) - Number(layer.height_ratio)),
      width: width * Number(layer.width_ratio),
      height: height * Number(layer.height_ratio),
      opacity: Number(layer.opacity) || 1
    })
  }
  return Buffer.from(await pdf.save({ useObjectStreams: true }))
}

export function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex')
}
