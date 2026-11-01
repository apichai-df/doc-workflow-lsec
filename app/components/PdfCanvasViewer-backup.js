'use client'

import {
  useEffect,
  useRef,
  useState,
} from 'react'

import {
  getDocument,
  GlobalWorkerOptions,
} from 'pdfjs-dist'

GlobalWorkerOptions.workerSrc =
  '/pdf.worker.min.mjs'

export default function PdfCanvasViewer({
  url,
  pageNumber,
  onPageCount,
  layers,
  onLayerChange,
  selectedLayerId,
  onSelectLayer,
}) {
  const containerRef = useRef(null)
  const canvasRef = useRef(null)
  const renderTaskRef = useRef(null)

  const [pageSize, setPageSize] = useState({
    width: 1,
    height: 1,
  })

  const dragRef = useRef(null)
  const resizeRef = useRef(null)

  useEffect(() => {
    if (!url) return

    let cancelled = false
    let pdfDocument = null

    async function renderPage() {
      try {
        const loadingTask = getDocument(url)

        pdfDocument =
          await loadingTask.promise

        if (cancelled) return

        onPageCount?.(
          pdfDocument.numPages
        )

        const safePage = Math.max(
          1,
          Math.min(
            pdfDocument.numPages,
            Number(pageNumber) || 1
          )
        )

        const pdfPage =
          await pdfDocument.getPage(
            safePage
          )

        const containerWidth =
          containerRef.current
            ?.clientWidth || 800

        const naturalViewport =
          pdfPage.getViewport({
            scale: 1,
          })

        const scale =
          containerWidth /
          naturalViewport.width

        const viewport =
          pdfPage.getViewport({
            scale,
          })

        const canvas =
          canvasRef.current

        const context =
          canvas.getContext('2d')

        const outputScale =
          window.devicePixelRatio || 1

        canvas.width =
          Math.floor(
            viewport.width *
              outputScale
          )

        canvas.height =
          Math.floor(
            viewport.height *
              outputScale
          )

        canvas.style.width =
          `${viewport.width}px`

        canvas.style.height =
          `${viewport.height}px`

        setPageSize({
          width: viewport.width,
          height: viewport.height,
        })

        renderTaskRef.current?.cancel()

        renderTaskRef.current =
          pdfPage.render({
            canvasContext: context,
            viewport,
            transform:
              outputScale !== 1
                ? [
                    outputScale,
                    0,
                    0,
                    outputScale,
                    0,
                    0,
                  ]
                : null,
          })

        await renderTaskRef.current.promise
      } catch (error) {
        if (
          error?.name !==
          'RenderingCancelledException'
        ) {
          console.error(
            'PDF PAGE RENDER ERROR',
            error
          )
        }
      }
    }

    renderPage()

    const resizeObserver =
      new ResizeObserver(() => {
        renderPage()
      })

    if (containerRef.current) {
      resizeObserver.observe(
        containerRef.current
      )
    }

    return () => {
      cancelled = true
      resizeObserver.disconnect()
      renderTaskRef.current?.cancel()
      pdfDocument?.destroy()
    }
  }, [
    url,
    pageNumber,
    onPageCount,
  ])

  function beginMove(event, layer) {
    event.preventDefault()

    const rectangle =
      containerRef.current
        .getBoundingClientRect()

    dragRef.current = {
      id: layer.id,
      startX: event.clientX,
      startY: event.clientY,
      originalX:
        Number(layer.x_ratio),
      originalY:
        Number(layer.y_ratio),
      containerWidth:
        rectangle.width,
      containerHeight:
        rectangle.height,
    }

    event.currentTarget
      .setPointerCapture(
        event.pointerId
      )

    onSelectLayer?.(layer.id)
  }

  function moveLayer(event) {
    const drag = dragRef.current

    if (!drag) return

    const layer = layers.find(
      item => item.id === drag.id
    )

    if (!layer) return

    const deltaX =
      (
        event.clientX -
        drag.startX
      ) /
      drag.containerWidth

    const deltaY =
      (
        event.clientY -
        drag.startY
      ) /
      drag.containerHeight

    const nextX = Math.max(
      0,
      Math.min(
        1 -
          Number(
            layer.width_ratio
          ),
        drag.originalX + deltaX
      )
    )

    const nextY = Math.max(
      0,
      Math.min(
        1 -
          Number(
            layer.height_ratio
          ),
        drag.originalY + deltaY
      )
    )

    onLayerChange?.(
      layer.id,
      {
        x_ratio: nextX,
        y_ratio: nextY,
      }
    )
  }

  function beginResize(event, layer) {
    event.preventDefault()
    event.stopPropagation()

    resizeRef.current = {
      id: layer.id,
      startX: event.clientX,
      startY: event.clientY,
      originalWidth:
        Number(layer.width_ratio),
      originalHeight:
        Number(layer.height_ratio),
      containerWidth:
        pageSize.width,
      containerHeight:
        pageSize.height,
    }

    event.currentTarget
      .setPointerCapture(
        event.pointerId
      )
  }

  function resizeLayer(event) {
    const resize = resizeRef.current

    if (!resize) return

    const widthDelta =
      (
        event.clientX -
        resize.startX
      ) /
      resize.containerWidth

    const heightDelta =
      (
        event.clientY -
        resize.startY
      ) /
      resize.containerHeight

    onLayerChange?.(
      resize.id,
      {
        width_ratio: Math.max(
          0.04,
          Math.min(
            0.7,
            resize.originalWidth +
              widthDelta
          )
        ),

        height_ratio: Math.max(
          0.02,
          Math.min(
            0.35,
            resize.originalHeight +
              heightDelta
          )
        ),
      }
    )
  }

  const visibleLayers =
    layers.filter(
      layer =>
        Number(
          layer.page_number
        ) === Number(pageNumber) &&
        layer.image_data
    )

  return (
    <div
      ref={containerRef}
      className="pdfCanvasContainer"
    >
      <canvas
        ref={canvasRef}
        className="pdfCanvas"
      />

      <div className="pdfOverlaySurface">
        {visibleLayers.map(
          layer => (
            <div
              key={layer.id}
              className={
                `signatureOverlay ${
                  selectedLayerId ===
                  layer.id
                    ? 'selected'
                    : ''
                }`
              }
              style={{
                left:
                  `${Number(
                    layer.x_ratio
                  ) * 100}%`,

                top:
                  `${Number(
                    layer.y_ratio
                  ) * 100}%`,

                width:
                  `${Number(
                    layer.width_ratio
                  ) * 100}%`,

                height:
                  `${Number(
                    layer.height_ratio
                  ) * 100}%`,
              }}
              onPointerDown={event =>
                beginMove(
                  event,
                  layer
                )
              }
              onPointerMove={
                moveLayer
              }
              onPointerUp={() => {
                dragRef.current = null
              }}
            >
              {layer.image_data}

              {selectedLayerId ===
                layer.id && (
                <button
                  type="button"
                  className="signatureResizeHandle"
                  aria-label="ปรับขนาดลายเซ็น"
                  onPointerDown={
                    event =>
                      beginResize(
                        event,
                        layer
                      )
                  }
                  onPointerMove={
                    resizeLayer
                  }
                  onPointerUp={() => {
                    resizeRef.current =
                      null
                  }}
                />
              )}
            </div>
          )
        )}
      </div>
    </div>
  )
}