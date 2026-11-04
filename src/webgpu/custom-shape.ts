import type { Point } from './types'

// Side length of each signed distance field in the GPU texture array.
export const CUSTOM_SDF_SIZE = 512

// The drawing fills this much of the field, leaving room for soft shadows.
const DOMAIN_FILL = 0.78
const RESAMPLE_SPACING = 4
const SMOOTHING_PASSES = 3
const MIN_INRADIUS = 8

export interface CustomShape {
  /** Signed distance per texel, in field units where the field spans -1..1. */
  distance: Float32Array
  /** The same distances as 16-bit floats, ready for the GPU. */
  encoded: Uint16Array
  /** Half the field's side length, in CSS pixels at scale 1. */
  domain: number
  halfWidth: number
  halfHeight: number
  /** Distance from the edge to the deepest interior point, in CSS pixels. */
  inradius: number
  centerX: number
  centerY: number
}

/** Evens out point spacing and softens hand jitter, treating the stroke as a closed loop. */
export function smoothStroke(points: readonly Point[]): Point[] {
  if (points.length < 3) return [...points]

  const closed = [...points, points[0]]
  const resampled: Point[] = [points[0]]
  let carried = 0

  for (let i = 1; i < closed.length; i++) {
    let start = closed[i - 1]
    const end = closed[i]
    let segment = Math.hypot(end.x - start.x, end.y - start.y)

    while (carried + segment >= RESAMPLE_SPACING && segment > 0) {
      const t = (RESAMPLE_SPACING - carried) / segment
      const point = { x: start.x + (end.x - start.x) * t, y: start.y + (end.y - start.y) * t }
      resampled.push(point)
      start = point
      segment = Math.hypot(end.x - start.x, end.y - start.y)
      carried = 0
    }

    carried += segment
  }

  let smoothed = resampled
  for (let pass = 0; pass < SMOOTHING_PASSES; pass++) {
    smoothed = smoothed.map((point, index) => {
      const previous = smoothed[(index - 1 + smoothed.length) % smoothed.length]
      const next = smoothed[(index + 1) % smoothed.length]
      return {
        x: previous.x * 0.25 + point.x * 0.5 + next.x * 0.25,
        y: previous.y * 0.25 + point.y * 0.5 + next.y * 0.25,
      }
    })
  }

  return smoothed
}

export function traceStroke(context: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D, points: readonly Point[]): void {
  context.beginPath()
  points.forEach((point, index) => {
    if (index === 0) context.moveTo(point.x, point.y)
    else context.lineTo(point.x, point.y)
  })
  context.closePath()
}

/** Turns closed strokes into a shape, or returns null if they enclose too little area to be glass. */
export function buildCustomShape(strokes: readonly (readonly Point[])[]): CustomShape | null {
  const points = strokes.flat()
  if (points.length < 3) return null

  const minX = Math.min(...points.map((point) => point.x))
  const maxX = Math.max(...points.map((point) => point.x))
  const minY = Math.min(...points.map((point) => point.y))
  const maxY = Math.max(...points.map((point) => point.y))
  const centerX = (minX + maxX) / 2
  const centerY = (minY + maxY) / 2
  const domain = Math.max(maxX - minX, maxY - minY, 1) / 2 / DOMAIN_FILL

  const size = CUSTOM_SDF_SIZE
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) return null

  const pixelsPerUnit = size / (domain * 2)
  context.setTransform(
    pixelsPerUnit,
    0,
    0,
    pixelsPerUnit,
    size / 2 - centerX * pixelsPerUnit,
    size / 2 - centerY * pixelsPerUnit
  )
  context.fillStyle = '#fff'
  // Filling strokes one at a time makes overlaps add together, whatever direction each was drawn.
  for (const stroke of strokes) {
    traceStroke(context, stroke)
    context.fill('nonzero')
  }

  const pixels = context.getImageData(0, 0, size, size).data
  const distance = distanceFieldFromCoverage(pixels, size)
  softenField(distance, size)

  let deepest = 0
  for (const value of distance) deepest = Math.min(deepest, value)

  const inradius = -deepest * domain
  if (inradius < MIN_INRADIUS) return null

  return {
    distance,
    encoded: encodeHalfFloats(distance),
    domain,
    halfWidth: (maxX - minX) / 2,
    halfHeight: (maxY - minY) / 2,
    inradius,
    centerX,
    centerY,
  }
}

/** Signed distance in CSS pixels from a point given relative to the shape's center at scale 1. */
export function sampleCustomShape(shape: CustomShape, x: number, y: number): number {
  const size = CUSTOM_SDF_SIZE
  const limit = 0.99
  const fieldX = x / shape.domain
  const fieldY = y / shape.domain
  const clampedX = Math.min(Math.max(fieldX, -limit), limit)
  const clampedY = Math.min(Math.max(fieldY, -limit), limit)

  const texelX = (clampedX + 1) * 0.5 * size - 0.5
  const texelY = (clampedY + 1) * 0.5 * size - 0.5
  const left = Math.floor(texelX)
  const top = Math.floor(texelY)
  const tx = texelX - left
  const ty = texelY - top
  const at = (column: number, row: number) => shape.distance[row * size + column]

  const upper = at(left, top) * (1 - tx) + at(left + 1, top) * tx
  const lower = at(left, top + 1) * (1 - tx) + at(left + 1, top + 1) * tx
  const inField = upper * (1 - ty) + lower * ty

  return (inField + Math.hypot(fieldX - clampedX, fieldY - clampedY)) * shape.domain
}

function distanceFieldFromCoverage(pixels: Uint8ClampedArray, size: number): Float32Array {
  const count = size * size
  const outside = new Float64Array(count)
  const inside = new Float64Array(count)

  for (let i = 0; i < count; i++) {
    const coverage = pixels[i * 4 + 3] / 255
    if (coverage >= 1) {
      outside[i] = 0
      inside[i] = Number.POSITIVE_INFINITY
    } else if (coverage <= 0) {
      outside[i] = Number.POSITIVE_INFINITY
      inside[i] = 0
    } else {
      // Antialiased edge pixels keep the outline's sub-pixel position.
      const offset = 0.5 - coverage
      outside[i] = Math.max(offset, 0) ** 2
      inside[i] = Math.max(-offset, 0) ** 2
    }
  }

  euclideanDistanceTransform(outside, size)
  euclideanDistanceTransform(inside, size)

  const texelsToField = 2 / size
  const distance = new Float32Array(count)
  for (let i = 0; i < count; i++) {
    distance[i] = (Math.sqrt(outside[i]) - Math.sqrt(inside[i])) * texelsToField
  }
  return distance
}

// Felzenszwalb and Huttenlocher's linear-time squared distance transform.
function euclideanDistanceTransform(grid: Float64Array, size: number): void {
  const line = new Float64Array(size)
  const envelope = new Float64Array(size)
  const parabolas = new Uint16Array(size)
  const boundaries = new Float64Array(size + 1)

  const transformLine = (read: (index: number) => number, write: (index: number, value: number) => void) => {
    for (let i = 0; i < size; i++) line[i] = read(i)

    let top = 0
    parabolas[0] = 0
    boundaries[0] = Number.NEGATIVE_INFINITY
    boundaries[1] = Number.POSITIVE_INFINITY

    for (let q = 1; q < size; q++) {
      if (line[q] === Number.POSITIVE_INFINITY) continue

      let crossing = Number.NEGATIVE_INFINITY
      while (top >= 0) {
        const p = parabolas[top]
        crossing = line[p] === Number.POSITIVE_INFINITY
          ? Number.NEGATIVE_INFINITY
          : (line[q] + q * q - line[p] - p * p) / (2 * (q - p))
        if (crossing > boundaries[top]) break
        top--
      }

      top++
      parabolas[top] = q
      boundaries[top] = crossing
      boundaries[top + 1] = Number.POSITIVE_INFINITY
    }

    top = 0
    for (let q = 0; q < size; q++) {
      while (boundaries[top + 1] < q) top++
      const p = parabolas[top]
      envelope[q] = line[p] === Number.POSITIVE_INFINITY
        ? Number.POSITIVE_INFINITY
        : (q - p) ** 2 + line[p]
    }

    for (let i = 0; i < size; i++) write(i, envelope[i])
  }

  for (let column = 0; column < size; column++) {
    transformLine((i) => grid[i * size + column], (i, value) => { grid[i * size + column] = value })
  }
  for (let row = 0; row < size; row++) {
    transformLine((i) => grid[row * size + i], (i, value) => { grid[row * size + i] = value })
  }
}

// A light box blur rounds off the creases a raw distance field has along its center lines.
function softenField(field: Float32Array, size: number): void {
  const radius = 2
  const buffer = new Float32Array(field.length)

  const blur = (source: Float32Array, target: Float32Array, step: number, crossStep: number) => {
    for (let line = 0; line < size; line++) {
      for (let i = 0; i < size; i++) {
        let total = 0
        for (let offset = -radius; offset <= radius; offset++) {
          const position = Math.min(Math.max(i + offset, 0), size - 1)
          total += source[line * crossStep + position * step]
        }
        target[line * crossStep + i * step] = total / (radius * 2 + 1)
      }
    }
  }

  blur(field, buffer, 1, size)
  blur(buffer, field, size, 1)
}

function encodeHalfFloats(values: Float32Array): Uint16Array {
  const floatView = new Float32Array(1)
  const bitsView = new Uint32Array(floatView.buffer)
  const encoded = new Uint16Array(values.length)

  for (let i = 0; i < values.length; i++) {
    floatView[0] = values[i]
    const bits = bitsView[0]
    const sign = (bits >>> 16) & 0x8000
    const exponent = ((bits >>> 23) & 0xff) - 112
    encoded[i] = exponent <= 0 ? sign : sign | (exponent << 10) | ((bits >>> 13) & 0x3ff)
  }

  return encoded
}
