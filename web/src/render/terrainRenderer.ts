import type { Mat4 } from 'wgpu-matrix';
import type { SceneData } from '../scene/sceneData';
import { LAND_COVER_COLOURS, MAX_LAND_COVER_CLASSES } from './palette';
import shaderSource from './terrain.wgsl?raw';

export type ColourMode = 'landCover' | 'elevation';

export interface TerrainSettings {
  verticalScale: number;
  colourMode: ColourMode;
}

// Must match `struct Uniforms` in terrain.wgsl.
const UNIFORM_BYTES = 64 + 4 * 16 + MAX_LAND_COVER_CLASSES * 16;

export class TerrainRenderer {
  private readonly pipeline: GPURenderPipeline;
  private readonly bindGroup: GPUBindGroup;
  private readonly uniformBuffer: GPUBuffer;
  private readonly indexBuffer: GPUBuffer;
  private readonly indexCount: number;
  private readonly uniformData = new ArrayBuffer(UNIFORM_BYTES);

  constructor(
    private readonly device: GPUDevice,
    colourFormat: GPUTextureFormat,
    depthFormat: GPUTextureFormat,
    private readonly scene: SceneData,
  ) {
    const { width, height } = scene.meta;
    const limit = device.limits.maxTextureDimension2D;
    if (width > limit || height > limit) {
      throw new Error(`Grid ${width} x ${height} exceeds this GPU's texture limit of ${limit}`);
    }

    const surfaceTex = this.uploadTexture('r32float', 4, scene.surface);
    const landCoverTex = this.uploadTexture('r8uint', 1, scene.landCover);

    this.indexBuffer = this.createGridIndices(width, height);
    this.indexCount = (width - 1) * (height - 1) * 6;

    this.uniformBuffer = device.createBuffer({
      size: UNIFORM_BYTES,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    const module = device.createShaderModule({ label: 'terrain', code: shaderSource });
    this.pipeline = device.createRenderPipeline({
      label: 'terrain',
      layout: 'auto',
      vertex: { module, entryPoint: 'vs' },
      fragment: { module, entryPoint: 'fs', targets: [{ format: colourFormat }] },
      primitive: { topology: 'triangle-list', cullMode: 'none' },
      depthStencil: { format: depthFormat, depthWriteEnabled: true, depthCompare: 'less' },
    });
    this.bindGroup = device.createBindGroup({
      layout: this.pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: this.uniformBuffer } },
        { binding: 1, resource: surfaceTex.createView() },
        { binding: 2, resource: landCoverTex.createView() },
      ],
    });
  }

  /** World-space extent of the grid in metres (x east, z south). */
  get extent(): { x: number; z: number } {
    const { width, height, cellSize } = this.scene.meta;
    return { x: width * cellSize, z: height * cellSize };
  }

  get baseElevation(): number {
    return this.scene.meta.stats.groundMin;
  }

  draw(pass: GPURenderPassEncoder, viewProj: Mat4, settings: TerrainSettings): void {
    const { meta } = this.scene;
    const f32 = new Float32Array(this.uniformData);
    const u32 = new Uint32Array(this.uniformData);
    f32.set(viewProj, 0);
    f32.set([meta.cellSize, settings.verticalScale, this.baseElevation, settings.colourMode === 'elevation' ? 1 : 0], 16);
    f32.set([0.45, 0.8, 0.35, 0], 20);
    f32.set([meta.stats.groundMin, meta.stats.groundMax, 0, 0], 24);
    u32.set([meta.width, meta.height, 0, 0], 28);
    LAND_COVER_COLOURS.forEach((c, i) => f32.set([...c, 1], 32 + i * 4));
    this.device.queue.writeBuffer(this.uniformBuffer, 0, this.uniformData);

    pass.setPipeline(this.pipeline);
    pass.setBindGroup(0, this.bindGroup);
    pass.setIndexBuffer(this.indexBuffer, 'uint32');
    pass.drawIndexed(this.indexCount);
  }

  private uploadTexture(format: GPUTextureFormat, bytesPerCell: number, data: Float32Array | Uint8Array): GPUTexture {
    const { width, height } = this.scene.meta;
    const texture = this.device.createTexture({
      size: [width, height],
      format,
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
    });
    this.device.queue.writeTexture({ texture }, data as GPUAllowSharedBufferSource, { bytesPerRow: width * bytesPerCell }, [width, height]);
    return texture;
  }

  private createGridIndices(width: number, height: number): GPUBuffer {
    const indices = new Uint32Array((width - 1) * (height - 1) * 6);
    let k = 0;
    for (let row = 0; row < height - 1; row++) {
      for (let col = 0; col < width - 1; col++) {
        const i = row * width + col;
        indices.set([i, i + width, i + 1, i + 1, i + width, i + width + 1], k);
        k += 6;
      }
    }
    const buffer = this.device.createBuffer({
      size: indices.byteLength,
      usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
    });
    this.device.queue.writeBuffer(buffer, 0, indices);
    return buffer;
  }
}
