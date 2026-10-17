// Offscreen renderer for screenshots and visual checks. Works where a WebGPU canvas
// cannot present (headless or virtual displays), since it only renders to a texture.
import { OrbitCamera } from './render/camera';
import { TerrainRenderer, type ColourMode } from './render/terrainRenderer';
import { loadScene } from './scene/sceneData';

const FORMAT: GPUTextureFormat = 'rgba8unorm';
const DEPTH_FORMAT: GPUTextureFormat = 'depth32float';

async function snapshot(): Promise<void> {
  const q = new URLSearchParams(location.search);
  const num = (key: string, fallback: number) => Number(q.get(key) ?? fallback);
  const width = num('w', 1280);
  const height = num('h', 800);
  const sceneId = q.get('scene') ?? 'synthetic';
  if (!/^[\w-]+$/.test(sceneId)) throw new Error(`Invalid scene name "${sceneId}"`);

  const adapter = await navigator.gpu?.requestAdapter();
  if (!adapter) throw new Error('WebGPU is not available');
  const device = await adapter.requestDevice();
  const scene = await loadScene(`${import.meta.env.BASE_URL}data/${sceneId}`);

  const terrain = new TerrainRenderer(device, FORMAT, DEPTH_FORMAT, scene);
  const camera = new OrbitCamera();
  camera.frame(terrain.extent.x, terrain.extent.z, scene.meta.stats.groundMax - scene.meta.stats.groundMin);
  camera.yaw = num('yaw', camera.yaw);
  camera.pitch = num('pitch', camera.pitch);
  camera.zoom(1 / num('zoom', 1));

  const colour = device.createTexture({
    size: [width, height],
    format: FORMAT,
    usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC,
  });
  const depth = device.createTexture({
    size: [width, height],
    format: DEPTH_FORMAT,
    usage: GPUTextureUsage.RENDER_ATTACHMENT,
  });
  const bytesPerRow = Math.ceil((width * 4) / 256) * 256;
  const readback = device.createBuffer({
    size: bytesPerRow * height,
    usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
  });

  const encoder = device.createCommandEncoder();
  const pass = encoder.beginRenderPass({
    colorAttachments: [
      { view: colour.createView(), clearValue: [0.78, 0.84, 0.89, 1], loadOp: 'clear', storeOp: 'store' },
    ],
    depthStencilAttachment: { view: depth.createView(), depthClearValue: 1, depthLoadOp: 'clear', depthStoreOp: 'discard' },
  });
  terrain.draw(pass, camera.viewProjection(width / height), {
    verticalScale: num('vscale', 1),
    colourMode: (q.get('mode') as ColourMode | null) ?? 'landCover',
  });
  pass.end();
  encoder.copyTextureToBuffer({ texture: colour }, { buffer: readback, bytesPerRow }, [width, height]);
  device.queue.submit([encoder.finish()]);
  await readback.mapAsync(GPUMapMode.READ);

  const src = new Uint8Array(readback.getMappedRange());
  const pixels = new Uint8ClampedArray(width * height * 4);
  for (let row = 0; row < height; row++) {
    pixels.set(src.subarray(row * bytesPerRow, row * bytesPerRow + width * 4), row * width * 4);
  }
  readback.unmap();

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  canvas.getContext('2d')!.putImageData(new ImageData(pixels, width, height), 0, 0);
  (document.getElementById('out') as HTMLImageElement).src = canvas.toDataURL('image/png');
  document.getElementById('status')!.textContent = 'done';
}

snapshot().catch((err: unknown) => {
  console.error(err);
  document.getElementById('status')!.textContent = `error: ${err instanceof Error ? err.message : String(err)}`;
});
