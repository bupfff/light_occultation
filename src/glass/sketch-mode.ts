import { buildCustomShape, smoothStroke, traceStroke, type CustomShape } from '../webgpu/custom-shape'
import type { Point } from '../webgpu/types'

const MIN_POINT_SPACING = 2
const DEFAULT_HINT = 'Draw an outline. It closes when you lift, and extra strokes join on.'
const TOO_SMALL_HINT = 'That outline is too thin to hold glass. Draw a wider shape.'

export type SketchPurpose = 'add' | 'redraw'

interface SketchModeOptions {
  onFinish: (shape: CustomShape, purpose: SketchPurpose) => void
  isDrawerLayout: () => boolean
  closeDrawer: () => void
}

function getElement<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id)
  if (!element) {
    throw new Error(`Missing #${id}`)
  }
  return element as T
}

export class SketchMode {
  private overlay = getElement<HTMLElement>('sketchOverlay')
  private canvas = getElement<HTMLCanvasElement>('sketchCanvas')
  private hint = getElement<HTMLElement>('sketchHint')
  private undoButton = getElement<HTMLButtonElement>('sketchUndo')
  private clearButton = getElement<HTMLButtonElement>('sketchClear')
  private cancelButton = getElement<HTMLButtonElement>('sketchCancel')
  private finishButton = getElement<HTMLButtonElement>('sketchFinish')
  private context = this.canvas.getContext('2d')!

  private strokes: Point[][] = []
  private activeStroke: Point[] | null = null
  private purpose: SketchPurpose = 'add'

  get isOpen(): boolean {
    return !this.overlay.hidden
  }

  constructor(private options: SketchModeOptions) {
    this.canvas.addEventListener('pointerdown', this.onPointerDown)
    this.canvas.addEventListener('pointermove', this.onPointerMove)
    this.canvas.addEventListener('pointerup', this.onPointerUp)
    this.canvas.addEventListener('pointercancel', this.onPointerCancel)
    this.undoButton.addEventListener('click', this.undo)
    this.clearButton.addEventListener('click', this.clear)
    this.cancelButton.addEventListener('click', this.close)
    this.finishButton.addEventListener('click', this.finish)
    window.addEventListener('keydown', this.onKeyDown, { capture: true })
    new ResizeObserver(this.fitCanvas).observe(this.overlay)
  }

  open(purpose: SketchPurpose): void {
    if (this.options.isDrawerLayout()) {
      this.options.closeDrawer()
    }

    this.purpose = purpose
    this.strokes = []
    this.activeStroke = null
    this.finishButton.textContent = purpose === 'redraw' ? 'Replace shape' : 'Add shape'
    this.hint.textContent = DEFAULT_HINT
    this.hint.classList.remove('sketch-hint-error')
    this.overlay.hidden = false
    this.fitCanvas()
    this.updateButtons()
    this.canvas.focus()
  }

  private close = (): void => {
    this.activeStroke = null
    this.overlay.hidden = true
  }

  private undo = (): void => {
    this.strokes.pop()
    this.refresh()
  }

  private clear = (): void => {
    this.strokes = []
    this.refresh()
  }

  private finish = (): void => {
    const shape = buildCustomShape(this.strokes)
    if (!shape) {
      this.hint.textContent = TOO_SMALL_HINT
      this.hint.classList.add('sketch-hint-error')
      return
    }

    this.close()
    this.options.onFinish(shape, this.purpose)
  }

  private refresh(): void {
    this.hint.textContent = DEFAULT_HINT
    this.hint.classList.remove('sketch-hint-error')
    this.draw()
    this.updateButtons()
  }

  private updateButtons(): void {
    const hasStrokes = this.strokes.length > 0
    this.undoButton.disabled = !hasStrokes
    this.clearButton.disabled = !hasStrokes
    this.finishButton.disabled = !hasStrokes
  }

  private fitCanvas = (): void => {
    const width = this.overlay.clientWidth
    const height = this.overlay.clientHeight
    if (width === 0 || height === 0) return

    const dpr = window.devicePixelRatio || 1
    this.canvas.width = width * dpr
    this.canvas.height = height * dpr
    this.context.setTransform(dpr, 0, 0, dpr, 0, 0)
    this.draw()
  }

  private draw(): void {
    const { context } = this
    context.clearRect(0, 0, this.canvas.clientWidth, this.canvas.clientHeight)

    const styles = getComputedStyle(this.overlay)
    const accent = styles.getPropertyValue('--bead').trim()
    const fill = styles.getPropertyValue('--bead-wash').trim()

    context.lineJoin = 'round'
    context.lineCap = 'round'
    context.lineWidth = 2

    for (const stroke of this.strokes) {
      traceStroke(context, stroke)
      context.fillStyle = fill
      context.fill('nonzero')
      context.strokeStyle = accent
      context.stroke()
    }

    if (this.activeStroke && this.activeStroke.length > 1) {
      const [first] = this.activeStroke
      const last = this.activeStroke[this.activeStroke.length - 1]

      traceStroke(context, this.activeStroke)
      context.fillStyle = fill
      context.fill('nonzero')

      context.beginPath()
      this.activeStroke.forEach((point, index) => {
        if (index === 0) context.moveTo(point.x, point.y)
        else context.lineTo(point.x, point.y)
      })
      context.strokeStyle = accent
      context.stroke()

      // A dashed line shows where the outline will close on release.
      context.save()
      context.setLineDash([4, 6])
      context.globalAlpha = 0.7
      context.beginPath()
      context.moveTo(last.x, last.y)
      context.lineTo(first.x, first.y)
      context.stroke()
      context.restore()
    }
  }

  private pointFromEvent(event: PointerEvent): Point {
    const bounds = this.canvas.getBoundingClientRect()
    return { x: event.clientX - bounds.left, y: event.clientY - bounds.top }
  }

  private addPoint(point: Point): void {
    const stroke = this.activeStroke
    if (!stroke) return

    const last = stroke[stroke.length - 1]
    if (Math.hypot(point.x - last.x, point.y - last.y) >= MIN_POINT_SPACING) {
      stroke.push(point)
    }
  }

  private onPointerDown = (event: PointerEvent): void => {
    if (event.button !== 0) return
    this.activeStroke = [this.pointFromEvent(event)]
    this.canvas.setPointerCapture(event.pointerId)
    event.preventDefault()
  }

  private onPointerMove = (event: PointerEvent): void => {
    if (!this.activeStroke) return

    const events = event.getCoalescedEvents?.() ?? []
    for (const coalesced of events.length > 0 ? events : [event]) {
      this.addPoint(this.pointFromEvent(coalesced))
    }
    this.draw()
    event.preventDefault()
  }

  private onPointerUp = (event: PointerEvent): void => {
    const stroke = this.activeStroke
    if (!stroke) return

    this.activeStroke = null
    if (this.canvas.hasPointerCapture(event.pointerId)) {
      this.canvas.releasePointerCapture(event.pointerId)
    }

    if (stroke.length >= 3) {
      this.strokes.push(smoothStroke(stroke))
    }
    this.refresh()
  }

  private onPointerCancel = (): void => {
    this.activeStroke = null
    this.draw()
  }

  private onKeyDown = (event: KeyboardEvent): void => {
    if (!this.isOpen) return

    if (event.key === 'Escape') {
      this.close()
    } else if (event.key === 'Enter' && this.strokes.length > 0) {
      this.finish()
    } else if (event.key.toLowerCase() === 'z' && (event.ctrlKey || event.metaKey)) {
      this.undo()
    } else {
      return
    }

    event.preventDefault()
    event.stopImmediatePropagation()
  }
}
