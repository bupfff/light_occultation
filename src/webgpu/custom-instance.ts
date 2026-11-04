import type { BackgroundTextureLoader } from './texture-loader'
import { sampleCustomShape, type CustomShape } from './custom-shape'
import {
  GlassInstance,
  DEFAULT_GLASS_INSTANCE_CONFIG,
  type GlassInstanceConfig,
} from './glass-instance'

export interface CustomInstanceConfig extends GlassInstanceConfig {
  shape: CustomShape
  scale: number
  sdfLayer: number
}

export const MIN_CUSTOM_SCALE = 0.25
export const MAX_CUSTOM_SCALE = 2.5

export class CustomInstance extends GlassInstance {
  readonly shapeType = 2
  shape: CustomShape
  scale: number

  constructor(
    device: GPUDevice,
    textureLoader: BackgroundTextureLoader,
    emptyTexture: GPUTexture,
    config: Partial<GlassInstanceConfig> & Pick<CustomInstanceConfig, 'shape' | 'sdfLayer'> & { scale?: number },
    onTextureChange: () => void
  ) {
    super(device, textureLoader, emptyTexture, { ...DEFAULT_GLASS_INSTANCE_CONFIG, ...config }, onTextureChange)
    this.shape = config.shape
    this.scale = config.scale ?? 1
    this.customSdfLayer = config.sdfLayer
  }

  /** Signed distance in CSS pixels from a point relative to the shape's center. */
  distanceTo(x: number, y: number): number {
    return sampleCustomShape(this.shape, x / this.scale, y / this.scale) * this.scale
  }

  getEffectiveRadius(_canvasWidth: number, _canvasHeight: number, dpr: number): number {
    return this.shape.inradius * this.scale * dpr
  }

  getHalfDimensions(_canvasWidth: number, _canvasHeight: number, dpr: number): { width: number; height: number } {
    return {
      width: this.shape.halfWidth * this.scale * dpr,
      height: this.shape.halfHeight * this.scale * dpr,
    }
  }

  protected writeShapeSpecificData(data: Float32Array, index: number, dpr: number): number {
    const toDevicePixels = this.scale * dpr
    data[2] = 1.0
    data[index++] = this.shape.halfWidth * 2 * toDevicePixels
    data[index++] = this.shape.halfHeight * 2 * toDevicePixels
    data[index++] = this.shape.inradius * toDevicePixels
    data[index++] = this.shape.domain * toDevicePixels
    return index
  }
}
