'use client'

import { useEffect, useRef, useState } from 'react'

export default function PdfCanvasViewer ({
  url,
  pageNumber,
  onPageCount,
  layers = [],
  onLayerChange,
  selectedLayerId,
  onSelectLayer
}) {
  const containerRef = useRef(null)
  const canvasRef = useRef(null)
  const renderTaskRef = useRef(null)
  const pdfRef = useRef(null)
  const dragRef = useRef(null)
  const resizeRef = useRef(null)
  const onPageCountRef = useRef(onPageCount)

  const [pageSize, setPageSize] = useState({ width: 1, height: 1 })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    onPageCountRef.current = onPageCount
  }, [onPageCount])

  useEffect(() => {
    if (!url) return

    let cancelled = false
    let resizeTimer = null
    let observer = null

    async function renderPdf () {
      setLoading(true)
      setError('')

      try {
        // webpack.mjs configures the PDF.js worker correctly for a client component.
        const pdfjs = await import('pdfjs-dist/webpack.mjs')

        if (cancelled) return

        if (!pdfRef.current) {
          const loadingTask = pdfjs.getDocument({
            url,
            withCredentials: false
          })
          pdfRef.current = await loadingTask.promise
          onPageCountRef.current?.(pdfRef.current.numPages)
        }

        const pdf = pdfRef.current
        const safePageNumber = Math.max(
          1,
          Math.min(pdf.numPages, Number(pageNumber) || 1)
        )
        const pdfPage = await pdf.getPage(safePageNumber)

        if (cancelled) return

        const containerWidth = Math.max(
          320,
          containerRef.current?.clientWidth || 800
        )
        const viewportAtOne = pdfPage.getViewport({ scale: 1 })
        const scale = containerWidth / viewportAtOne.width
        const viewport = pdfPage.getViewport({ scale })
        const canvas = canvasRef.current
        const context = canvas.getContext('2d', { alpha: false })
        const outputScale = window.devicePixelRatio || 1

        if (renderTaskRef.current) {
          try {
            renderTaskRef.current.cancel()
            await renderTaskRef.current.promise
          } catch (cancelError) {
            if (cancelError?.name !== 'RenderingCancelledException') {
              console.warn(cancelError)
            }
          }
        }

        canvas.width = Math.floor(viewport.width * outputScale)
        canvas.height = Math.floor(viewport.height * outputScale)
        canvas.style.width = `${viewport.width}px`
        canvas.style.height = `${viewport.height}px`

        setPageSize({ width: viewport.width, height: viewport.height })

        renderTaskRef.current = pdfPage.render({
          canvasContext: context,
          viewport,
          transform: outputScale === 1
            ? null
            : [outputScale, 0, 0, outputScale, 0, 0]
        })

        await renderTaskRef.current.promise

        if (!cancelled) setLoading(false)
      } catch (renderError) {
        if (renderError?.name === 'RenderingCancelledException') return
        console.error('PDF CANVAS RENDER ERROR', renderError)
        if (!cancelled) {
          setLoading(false)
          setError(renderError?.message || 'ไม่สามารถแสดงไฟล์ PDF ได้')
        }
      }
    }

    renderPdf()

    observer = new ResizeObserver(() => {
      clearTimeout(resizeTimer)
      resizeTimer = setTimeout(renderPdf, 180)
    })

    if (containerRef.current) observer.observe(containerRef.current)

    return () => {
      cancelled = true
      clearTimeout(resizeTimer)
      observer?.disconnect()
      renderTaskRef.current?.cancel()
    }
  }, [url, pageNumber])

useEffect(() => {
  return () => {
    const renderTask =
      renderTaskRef.current

    if (
      renderTask &&
      typeof renderTask.cancel === 'function'
    ) {
      try {
        renderTask.cancel()
      } catch (error) {
        if (
          error?.name !==
          'RenderingCancelledException'
        ) {
          console.warn(
            'PDF render cleanup warning',
            error
          )
        }
      }
    }

    renderTaskRef.current = null

    const pdfDocument =
      pdfRef.current

    if (
      pdfDocument &&
      typeof pdfDocument.destroy === 'function'
    ) {
      try {
        const destroyResult =
          pdfDocument.destroy()

        if (
          destroyResult &&
          typeof destroyResult.catch === 'function'
        ) {
          destroyResult.catch(error => {
            console.warn(
              'PDF document cleanup warning',
              error
            )
          })
        }
      } catch (error) {
        console.warn(
          'PDF document cleanup warning',
          error
        )
      }
    }

    pdfRef.current = null
  }
}, [url])

  function beginMove (event, layer) {
    event.preventDefault()
    const rectangle = containerRef.current.getBoundingClientRect()
    dragRef.current = {
      id: layer.id,
      startX: event.clientX,
      startY: event.clientY,
      originalX: Number(layer.x_ratio),
      originalY: Number(layer.y_ratio),
      width: rectangle.width,
      height: rectangle.height
    }
    event.currentTarget.setPointerCapture(event.pointerId)
    onSelectLayer?.(layer.id)
  }

  function moveLayer (event) {
    const drag = dragRef.current
    if (!drag) return
    const layer = layers.find(item => item.id === drag.id)
    if (!layer) return

    const nextX = Math.max(
      0,
      Math.min(
        1 - Number(layer.width_ratio),
        drag.originalX + (event.clientX - drag.startX) / drag.width
      )
    )
    const nextY = Math.max(
      0,
      Math.min(
        1 - Number(layer.height_ratio),
        drag.originalY + (event.clientY - drag.startY) / drag.height
      )
    )
    onLayerChange?.(layer.id, { x_ratio: nextX, y_ratio: nextY })
  }

  function beginResize (event, layer) {
    event.preventDefault()
    event.stopPropagation()
    resizeRef.current = {
      id: layer.id,
      startX: event.clientX,
      startY: event.clientY,
      originalWidth: Number(layer.width_ratio),
      originalHeight: Number(layer.height_ratio)
    }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  function resizeLayer (event) {
    const resize = resizeRef.current
    if (!resize) return
    onLayerChange?.(resize.id, {
      width_ratio: Math.max(
        0.04,
        Math.min(0.7, resize.originalWidth + (event.clientX - resize.startX) / pageSize.width)
      ),
      height_ratio: Math.max(
        0.02,
        Math.min(0.35, resize.originalHeight + (event.clientY - resize.startY) / pageSize.height)
      )
    })
  }

  const visibleLayers = layers.filter(layer =>
    Number(layer.page_number) === Number(pageNumber) && layer.image_data
  )

  return (
    <div ref={containerRef} className='pdfCanvasContainer'>
      {loading && <div className='pdfCanvasMessage'>กำลังแสดง PDF...</div>}
      {error && (
        <div className='pdfCanvasMessage error'>
          <b>ไม่สามารถแสดง PDF</b>
          <span>{error}</span>
          <small>เปิด F12 → Console เพื่อดู PDF CANVAS RENDER ERROR</small>
        </div>
      )}

      <canvas ref={canvasRef} className='pdfCanvas' />

      {!error && (
        <div className='pdfOverlaySurface'>
          {visibleLayers.map(layer => (
            <div
              key={layer.id}
              className={`signatureOverlay ${selectedLayerId === layer.id ? 'selected' : ''}`}
              style={{
                left: `${Number(layer.x_ratio) * 100}%`,
                top: `${Number(layer.y_ratio) * 100}%`,
                width: `${Number(layer.width_ratio) * 100}%`,
                height: `${Number(layer.height_ratio) * 100}%`
              }}
              onPointerDown={event => beginMove(event, layer)}
              onPointerMove={moveLayer}
              onPointerUp={() => { dragRef.current = null }}
            >
              <img src={layer.image_data} alt='ลายเซ็น' />
              {selectedLayerId === layer.id && (
                <button
                  type='button'
                  className='signatureResizeHandle'
                  aria-label='ปรับขนาดลายเซ็น'
                  onPointerDown={event => beginResize(event, layer)}
                  onPointerMove={resizeLayer}
                  onPointerUp={() => { resizeRef.current = null }}
                />
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
