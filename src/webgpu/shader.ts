import shaderCode from '../glass/shaders/glass.wgsl?raw'

export function createPipeline(
  device: GPUDevice,
  format: GPUTextureFormat,
  bindGroupLayout: GPUBindGroupLayout
): GPURenderPipeline {
  const shaderModule = device.createShaderModule({ code: shaderCode })

  const pipelineLayout = device.createPipelineLayout({
    bindGroupLayouts: [bindGroupLayout],
  })

  return device.createRenderPipeline({
    layout: pipelineLayout,
    vertex: {
      module: shaderModule,
      entryPoint: 'vs_main',
    },
    fragment: {
      module: shaderModule,
      entryPoint: 'fs_main',
      targets: [{ format }],
    },
    primitive: {
      topology: 'triangle-strip',
    },
  })
}

export function createBindGroupLayout(device: GPUDevice): GPUBindGroupLayout {
  return device.createBindGroupLayout({
    entries: [
      {
        binding: 0,
        visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
        buffer: { type: 'uniform' },
      },
      {
        binding: 1,
        visibility: GPUShaderStage.FRAGMENT,
        texture: { sampleType: 'float' },
      },
      {
        binding: 2,
        visibility: GPUShaderStage.FRAGMENT,
        sampler: { type: 'filtering' },
      },
      {
        binding: 3,
        visibility: GPUShaderStage.FRAGMENT,
        texture: { sampleType: 'float' },
      },
      {
        binding: 4,
        visibility: GPUShaderStage.FRAGMENT,
        sampler: { type: 'filtering' },
      },
      {
        binding: 5,
        visibility: GPUShaderStage.FRAGMENT,
        texture: { sampleType: 'float' },
      },
      {
        binding: 6,
        visibility: GPUShaderStage.FRAGMENT,
        texture: { sampleType: 'float' },
      },
      {
        binding: 7,
        visibility: GPUShaderStage.FRAGMENT,
        buffer: { type: 'read-only-storage' },
      },
      {
        binding: 8,
        visibility: GPUShaderStage.FRAGMENT,
        texture: { sampleType: 'float', viewDimension: '2d-array' },
      },
    ],
  })
}

export function createBindGroup(
  device: GPUDevice,
  layout: GPUBindGroupLayout,
  uniformBuffer: GPUBuffer,
  texture: GPUTexture,
  sampler: GPUSampler,
  iconTexture: GPUTexture,
  iconSampler: GPUSampler,
  iconLeftTexture: GPUTexture,
  iconRightTexture: GPUTexture,
  circlePresetBuffer: GPUBuffer,
  blurPyramidView: GPUTextureView | null = null
): GPUBindGroup {
  return device.createBindGroup({
    layout,
    entries: [
      { binding: 0, resource: { buffer: uniformBuffer } },
      { binding: 1, resource: texture.createView() },
      { binding: 2, resource: sampler },
      { binding: 3, resource: iconTexture.createView() },
      { binding: 4, resource: iconSampler },
      { binding: 5, resource: iconLeftTexture.createView() },
      { binding: 6, resource: iconRightTexture.createView() },
      { binding: 7, resource: { buffer: circlePresetBuffer } },
      { binding: 8, resource: blurPyramidView ?? createFallbackArrayTextureView(device) },
    ],
  })
}

// Create a 1x1 fallback texture array for when blur pyramid isn't available
function createFallbackArrayTextureView(device: GPUDevice): GPUTextureView {
  const texture = device.createTexture({
    size: [1, 1, 5],
    format: 'rgba8unorm',
    usage: GPUTextureUsage.TEXTURE_BINDING,
  })
  return texture.createView({ dimension: '2d-array', arrayLayerCount: 5 })
}
