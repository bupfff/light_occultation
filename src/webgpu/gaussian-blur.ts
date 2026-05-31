/**
 * Two-pass separable Gaussian blur for WebGPU.
 * Creates a blur pyramid with multiple blur levels for progressive blur sampling.
 */

const GAUSSIAN_BLUR_SHADER = /* wgsl */ `
  struct BlurUniforms {
    direction: vec2f,      // (1,0) for horizontal, (0,1) for vertical
    radius: f32,           // blur radius in pixels
    resolution: vec2f,     // texture resolution
    _padding: f32,
  }

  @group(0) @binding(0) var inputTexture: texture_2d<f32>;
  @group(0) @binding(1) var inputSampler: sampler;
  @group(0) @binding(2) var<uniform> uniforms: BlurUniforms;

  struct VertexOutput {
    @builtin(position) position: vec4f,
    @location(0) uv: vec2f,
  }

  @vertex
  fn vs_main(@builtin(vertex_index) vertexIndex: u32) -> VertexOutput {
    var pos = array<vec2f, 4>(
      vec2f(-1.0, 1.0),
      vec2f(1.0, 1.0),
      vec2f(-1.0, -1.0),
      vec2f(1.0, -1.0)
    );
    var uv = array<vec2f, 4>(
      vec2f(0.0, 0.0),
      vec2f(1.0, 0.0),
      vec2f(0.0, 1.0),
      vec2f(1.0, 1.0)
    );

    var output: VertexOutput;
    output.position = vec4f(pos[vertexIndex], 0.0, 1.0);
    output.uv = uv[vertexIndex];
    return output;
  }

  @fragment
  fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
    let radius = uniforms.radius;

    // Skip blur for negligible radius
    if (radius < 0.5) {
      return textureSampleLevel(inputTexture, inputSampler, uv, 0.0);
    }

    let texelSize = uniforms.direction / uniforms.resolution;

    // Gaussian parameters
    let sigma = max(radius * 0.4, 1.0);
    let coeff = -0.5 / (sigma * sigma);

    var color = vec4f(0.0);
    var totalWeight = 0.0;

    // 25-tap Gaussian sampling (from -12 to +12)
    let steps = 12;
    for (var i = -steps; i <= steps; i = i + 1) {
      let fi = f32(i);
      let offset = fi * (radius / f32(steps));
      let weight = exp(offset * offset * coeff);
      let sampleUV = clamp(uv + texelSize * offset, vec2f(0.0), vec2f(1.0));
      color = color + textureSampleLevel(inputTexture, inputSampler, sampleUV, 0.0) * weight;
      totalWeight = totalWeight + weight;
    }

    return color / totalWeight;
  }
`

export interface BlurPyramidLevel {
  texture: GPUTexture
  radius: number
}

export class GaussianBlur {
  private device: GPUDevice
  private pipeline: GPURenderPipeline
  private sampler: GPUSampler
  private uniformBuffer: GPUBuffer
  private bindGroupLayout: GPUBindGroupLayout
  private tempTexture: GPUTexture | null = null
  private tempTextureWidth = 0
  private tempTextureHeight = 0

  constructor(device: GPUDevice, format: GPUTextureFormat) {
    this.device = device

    const shaderModule = device.createShaderModule({
      code: GAUSSIAN_BLUR_SHADER,
    })

    this.bindGroupLayout = device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
        { binding: 1, visibility: GPUShaderStage.FRAGMENT, sampler: { type: 'filtering' } },
        { binding: 2, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
      ],
    })

    this.pipeline = device.createRenderPipeline({
      layout: device.createPipelineLayout({ bindGroupLayouts: [this.bindGroupLayout] }),
      vertex: { module: shaderModule, entryPoint: 'vs_main' },
      fragment: {
        module: shaderModule,
        entryPoint: 'fs_main',
        targets: [{ format }],
      },
      primitive: { topology: 'triangle-strip' },
    })

    this.sampler = device.createSampler({
      magFilter: 'linear',
      minFilter: 'linear',
      addressModeU: 'clamp-to-edge',
      addressModeV: 'clamp-to-edge',
    })

    this.uniformBuffer = device.createBuffer({
      size: 32, // vec2f + f32 + vec2f + f32 padding = 24 bytes, aligned to 32
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    })
  }

  private ensureTempTexture(width: number, height: number, format: GPUTextureFormat): void {
    if (this.tempTexture && this.tempTextureWidth === width && this.tempTextureHeight === height) {
      return
    }

    this.tempTexture?.destroy()
    this.tempTexture = this.device.createTexture({
      size: [width, height],
      format,
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.RENDER_ATTACHMENT,
    })
    this.tempTextureWidth = width
    this.tempTextureHeight = height
  }

  /**
   * Apply two-pass separable Gaussian blur to a texture.
   * @param source Source texture to blur
   * @param target Target texture to write result (can be same as source if using intermediate)
   * @param radius Blur radius in pixels
   */
  blur(source: GPUTexture, target: GPUTexture, radius: number): void {
    const width = source.width
    const height = source.height
    const format = source.format

    this.ensureTempTexture(width, height, format)
    if (!this.tempTexture) return

    // Pass 1: Horizontal blur (source -> temp)
    this.blurPass(source, this.tempTexture, radius, 1, 0, width, height)

    // Pass 2: Vertical blur (temp -> target)
    this.blurPass(this.tempTexture, target, radius, 0, 1, width, height)
  }

  private blurPass(
    source: GPUTexture,
    target: GPUTexture,
    radius: number,
    dirX: number,
    dirY: number,
    width: number,
    height: number
  ): void {
    // Update uniforms
    const uniformData = new Float32Array([
      dirX, dirY,           // direction
      radius,               // radius
      0,                    // padding
      width, height,        // resolution
      0, 0,                 // padding to 32 bytes
    ])
    this.device.queue.writeBuffer(this.uniformBuffer, 0, uniformData)

    const bindGroup = this.device.createBindGroup({
      layout: this.bindGroupLayout,
      entries: [
        { binding: 0, resource: source.createView() },
        { binding: 1, resource: this.sampler },
        { binding: 2, resource: { buffer: this.uniformBuffer } },
      ],
    })

    const commandEncoder = this.device.createCommandEncoder()
    const renderPass = commandEncoder.beginRenderPass({
      colorAttachments: [{
        view: target.createView(),
        loadOp: 'clear',
        storeOp: 'store',
      }],
    })

    renderPass.setPipeline(this.pipeline)
    renderPass.setBindGroup(0, bindGroup)
    renderPass.draw(4)
    renderPass.end()

    this.device.queue.submit([commandEncoder.finish()])
  }

  destroy(): void {
    this.tempTexture?.destroy()
    this.uniformBuffer.destroy()
  }
}

/**
 * Manages a pyramid of pre-blurred textures at different blur radii.
 * Uses a 2D texture array for efficient shader binding.
 * Used for efficient progressive blur by interpolating between levels.
 */
export class BlurPyramid {
  private device: GPUDevice
  private gaussianBlur: GaussianBlur
  private format: GPUTextureFormat

  // Blur pyramid as a 2D texture array
  private pyramidTexture: GPUTexture | null = null
  private pyramidWidth = 0
  private pyramidHeight = 0

  // Temporary textures for blur operations
  private tempTextures: GPUTexture[] = []

  // Blur levels: 0 = original, then increasing blur radii
  // These radii are in CSS pixels (will be multiplied by DPR)
  readonly blurRadii = [0, 8, 16, 32, 64]
  readonly levelCount = 5

  constructor(device: GPUDevice, format: GPUTextureFormat) {
    this.device = device
    this.format = format
    this.gaussianBlur = new GaussianBlur(device, format)
  }

  /**
   * The blur pyramid texture array.
   */
  get texture(): GPUTexture | null {
    return this.pyramidTexture
  }

  /**
   * Generate blur pyramid from source texture.
   * Creates multiple blur levels for progressive blur sampling.
   */
  generate(source: GPUTexture, dpr: number): void {
    const width = source.width
    const height = source.height

    // Ensure we have the right textures
    this.ensureTextures(width, height)
    if (!this.pyramidTexture) return

    // Copy source to level 0
    const commandEncoder = this.device.createCommandEncoder()
    commandEncoder.copyTextureToTexture(
      { texture: source },
      { texture: this.pyramidTexture, origin: { x: 0, y: 0, z: 0 } },
      [width, height]
    )
    this.device.queue.submit([commandEncoder.finish()])

    // Generate each blur level (blur from original for quality)
    for (let i = 1; i < this.levelCount; i++) {
      const radius = this.blurRadii[i] * dpr

      // Blur source -> temp texture
      this.gaussianBlur.blur(source, this.tempTextures[i - 1], radius)

      // Copy temp texture to pyramid layer
      const copyEncoder = this.device.createCommandEncoder()
      copyEncoder.copyTextureToTexture(
        { texture: this.tempTextures[i - 1] },
        { texture: this.pyramidTexture, origin: { x: 0, y: 0, z: i } },
        [width, height]
      )
      this.device.queue.submit([copyEncoder.finish()])
    }
  }

  private ensureTextures(width: number, height: number): void {
    // Check if we need to recreate textures
    if (this.pyramidTexture &&
        this.pyramidWidth === width &&
        this.pyramidHeight === height) {
      return
    }

    // Destroy old textures
    this.pyramidTexture?.destroy()
    for (const tex of this.tempTextures) {
      tex.destroy()
    }
    this.tempTextures = []

    this.pyramidWidth = width
    this.pyramidHeight = height

    // Create pyramid texture array
    this.pyramidTexture = this.device.createTexture({
      size: [width, height, this.levelCount],
      format: this.format,
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
    })

    // Create temp textures for blur operations (one less than levels since level 0 is copy)
    for (let i = 1; i < this.levelCount; i++) {
      const texture = this.device.createTexture({
        size: [width, height],
        format: this.format,
        usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC,
      })
      this.tempTextures.push(texture)
    }
  }

  /**
   * Create a view for the entire pyramid array.
   */
  createView(): GPUTextureView | null {
    return this.pyramidTexture?.createView({
      dimension: '2d-array',
      arrayLayerCount: this.levelCount,
    }) ?? null
  }

  destroy(): void {
    this.pyramidTexture?.destroy()
    this.pyramidTexture = null
    for (const tex of this.tempTextures) {
      tex.destroy()
    }
    this.tempTextures = []
    this.gaussianBlur.destroy()
  }
}
