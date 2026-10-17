import { OrbitCamera, attachOrbitControls } from './render/camera';
import { LAND_COVER_COLOURS, cssColour } from './render/palette';
import { TerrainRenderer, type ColourMode, type TerrainSettings } from './render/terrainRenderer';
import { pickCell } from './scene/pick';
import { cellToBng, loadScene, type SceneData } from './scene/sceneData';

const DEPTH_FORMAT: GPUTextureFormat = 'depth32float';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

function showMessage(text: string): void {
  const el = $('message');
  el.textContent = text;
  el.hidden = false;
}

async function initGpu(canvas: HTMLCanvasElement) {
  if (!navigator.gpu) {
    throw new Error('This browser does not support WebGPU. Try a recent Chrome, Edge, Safari or Firefox.');
  }
  const adapter = await navigator.gpu.requestAdapter();
  if (!adapter) throw new Error('No suitable GPU adapter found.');
  const device = await adapter.requestDevice();
  device.addEventListener('uncapturederror', (e) => console.error('WebGPU error:', e.error.message));
  device.lost.then((info) => {
    if (info.reason !== 'destroyed') showMessage(`GPU device lost: ${info.message}`);
  });
  const context = canvas.getContext('webgpu');
  if (!context) throw new Error('Could not create a WebGPU canvas context.');
  const format = navigator.gpu.getPreferredCanvasFormat();
  context.configure({ device, format, alphaMode: 'opaque' });
  return { device, context, format };
}

function populatePanel(scene: SceneData): void {
  const { meta } = scene;
  $('scene-name').textContent = meta.name;
  $('scene-size').textContent =
    `${meta.width * meta.cellSize} × ${meta.height * meta.cellSize} m @ ${meta.cellSize} m`;
  $('attribution').textContent = meta.attribution.join(' · ');
  $('legend').replaceChildren(
    ...meta.landCover.map(({ code, name }) => {
      const li = document.createElement('li');
      const swatch = document.createElement('i');
      swatch.style.background = cssColour(LAND_COVER_COLOURS[code] ?? [1, 0, 1]);
      li.append(swatch, name);
      return li;
    }),
  );
}

async function main(): Promise<void> {
  const canvas = $<HTMLCanvasElement>('view');
  const sceneId = new URLSearchParams(location.search).get('scene') ?? 'synthetic';
  if (!/^[\w-]+$/.test(sceneId)) throw new Error(`Invalid scene name "${sceneId}"`);

  const [{ device, context, format }, scene] = await Promise.all([
    initGpu(canvas),
    loadScene(`${import.meta.env.BASE_URL}data/${sceneId}`),
  ]);
  populatePanel(scene);

  const terrain = new TerrainRenderer(device, format, DEPTH_FORMAT, scene);
  const settings: TerrainSettings = { verticalScale: 1, colourMode: 'landCover' };

  const camera = new OrbitCamera();
  camera.frame(terrain.extent.x, terrain.extent.z, scene.meta.stats.groundMax - scene.meta.stats.groundMin);

  let depthTexture: GPUTexture | null = null;
  let frameRequested = false;
  const requestFrame = () => {
    if (!frameRequested) {
      frameRequested = true;
      requestAnimationFrame(render);
    }
  };

  function render(): void {
    frameRequested = false;
    const colour = context.getCurrentTexture();
    if (!depthTexture || depthTexture.width !== colour.width || depthTexture.height !== colour.height) {
      depthTexture?.destroy();
      depthTexture = device.createTexture({
        size: [colour.width, colour.height],
        format: DEPTH_FORMAT,
        usage: GPUTextureUsage.RENDER_ATTACHMENT,
      });
    }
    const encoder = device.createCommandEncoder();
    const pass = encoder.beginRenderPass({
      colorAttachments: [
        { view: colour.createView(), clearValue: [0.78, 0.84, 0.89, 1], loadOp: 'clear', storeOp: 'store' },
      ],
      depthStencilAttachment: {
        view: depthTexture.createView(),
        depthClearValue: 1,
        depthLoadOp: 'clear',
        depthStoreOp: 'discard',
      },
    });
    terrain.draw(pass, camera.viewProjection(colour.width / colour.height), settings);
    pass.end();
    device.queue.submit([encoder.finish()]);
  }

  new ResizeObserver(() => {
    const dpr = Math.min(window.devicePixelRatio, 2);
    canvas.width = Math.max(1, Math.round(canvas.clientWidth * dpr));
    canvas.height = Math.max(1, Math.round(canvas.clientHeight * dpr));
    requestFrame();
  }).observe(canvas);

  attachOrbitControls(camera, canvas, requestFrame);

  $<HTMLSelectElement>('colour-mode').addEventListener('change', (e) => {
    settings.colourMode = (e.target as HTMLSelectElement).value as ColourMode;
    requestFrame();
  });
  $<HTMLInputElement>('vscale').addEventListener('input', (e) => {
    settings.verticalScale = Number((e.target as HTMLInputElement).value);
    $('vscale-out').textContent = `${settings.verticalScale.toFixed(1)}×`;
    requestFrame();
  });

  const landCoverNames = new Map(scene.meta.landCover.map((c) => [c.code, c.name]));
  canvas.addEventListener('pointermove', (e) => {
    if (e.buttons !== 0) return;
    const rect = canvas.getBoundingClientRect();
    const ndcX = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    const ndcY = 1 - ((e.clientY - rect.top) / rect.height) * 2;
    const { origin, dir } = camera.ray(ndcX, ndcY, rect.width / rect.height);
    const hit = pickCell(
      { ...scene.meta, surface: scene.surface, baseElevation: terrain.baseElevation, verticalScale: settings.verticalScale },
      origin,
      dir,
    );
    if (!hit) return;
    const i = hit.row * scene.meta.width + hit.col;
    const { easting, northing } = cellToBng(scene.meta, hit.col, hit.row);
    $('ro-bng').textContent = `${easting.toFixed(1)}, ${northing.toFixed(1)}`;
    $('ro-ground').textContent = `${scene.ground[i]!.toFixed(2)} m`;
    $('ro-building').textContent = scene.buildingHeight[i]! > 0 ? `${scene.buildingHeight[i]!.toFixed(1)} m` : '–';
    $('ro-landcover').textContent = landCoverNames.get(scene.landCover[i]!) ?? '?';
  });
}

main().catch((err: unknown) => {
  console.error(err);
  showMessage(err instanceof Error ? err.message : String(err));
});
