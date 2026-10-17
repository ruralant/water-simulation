import { mat4, vec3, type Mat4, type Vec3 } from 'wgpu-matrix';

/**
 * Orbit camera around a target point. World axes: x east, y up, z south,
 * so yaw 0 looks north from the south side of the target.
 */
export class OrbitCamera {
  target: Vec3 = vec3.create(0, 0, 0);
  distance = 300;
  yaw = 0.6;
  pitch = 0.75;
  fovY = Math.PI / 4;
  minDistance = 5;
  maxDistance = 5000;

  /** Point at the middle of a grid of the given world extent and pull back to see all of it. */
  frame(sizeX: number, sizeZ: number, relief: number): void {
    const size = Math.max(sizeX, sizeZ);
    this.target = vec3.create(sizeX / 2, relief / 2, sizeZ / 2);
    this.distance = size * 0.9;
    this.maxDistance = size * 4;
  }

  eye(): Vec3 {
    const cp = Math.cos(this.pitch);
    return vec3.add(
      this.target,
      vec3.create(
        this.distance * cp * Math.sin(this.yaw),
        this.distance * Math.sin(this.pitch),
        this.distance * cp * Math.cos(this.yaw),
      ),
    );
  }

  viewProjection(aspect: number): Mat4 {
    const near = Math.max(0.1, this.distance * 0.005);
    const far = this.distance * 20 + 2000;
    const proj = mat4.perspective(this.fovY, aspect, near, far);
    const view = mat4.lookAt(this.eye(), this.target, [0, 1, 0]);
    return mat4.multiply(proj, view);
  }

  orbit(dYaw: number, dPitch: number): void {
    this.yaw += dYaw;
    this.pitch = Math.min(Math.PI / 2 - 0.01, Math.max(0.05, this.pitch + dPitch));
  }

  zoom(factor: number): void {
    this.distance = Math.min(this.maxDistance, Math.max(this.minDistance, this.distance * factor));
  }

  /** Pan in the ground plane by screen-space fractions of the view. */
  pan(dxFrac: number, dyFrac: number): void {
    const scale = this.distance * Math.tan(this.fovY / 2) * 2;
    const right = vec3.create(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    const forward = vec3.create(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    vec3.addScaled(this.target, right, -dxFrac * scale, this.target);
    vec3.addScaled(this.target, forward, dyFrac * scale, this.target);
  }

  /** Ray through a point in normalised device coordinates (x, y in [-1, 1], y up). */
  ray(ndcX: number, ndcY: number, aspect: number): { origin: Vec3; dir: Vec3 } {
    const inv = mat4.inverse(this.viewProjection(aspect));
    const near = vec3.transformMat4([ndcX, ndcY, 0], inv);
    const far = vec3.transformMat4([ndcX, ndcY, 1], inv);
    return { origin: near, dir: vec3.normalize(vec3.subtract(far, near)) };
  }
}

/** Mouse/touch controls: drag to orbit, right-drag or shift-drag to pan, wheel or pinch to zoom. */
export function attachOrbitControls(camera: OrbitCamera, el: HTMLElement, onChange: () => void): void {
  const pointers = new Map<number, { x: number; y: number }>();
  let panning = false;
  let pinchDist = 0;

  el.addEventListener('contextmenu', (e) => e.preventDefault());
  el.addEventListener('pointerdown', (e) => {
    el.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    panning = e.button === 2 || e.shiftKey;
    if (pointers.size === 2) pinchDist = pinchDistance();
  });
  const release = (e: PointerEvent) => {
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinchDist = 0;
  };
  el.addEventListener('pointerup', release);
  el.addEventListener('pointercancel', release);
  el.addEventListener('pointermove', (e) => {
    const prev = pointers.get(e.pointerId);
    if (!prev) return;
    const dx = e.clientX - prev.x;
    const dy = e.clientY - prev.y;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 2) {
      const d = pinchDistance();
      if (pinchDist > 0 && d > 0) camera.zoom(pinchDist / d);
      pinchDist = d;
      camera.pan(dx / el.clientHeight / 2, dy / el.clientHeight / 2);
    } else if (panning) {
      camera.pan(dx / el.clientHeight, dy / el.clientHeight);
    } else {
      camera.orbit(-dx * 0.005, dy * 0.005);
    }
    onChange();
  });
  el.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      camera.zoom(Math.exp(e.deltaY * 0.001));
      onChange();
    },
    { passive: false },
  );

  function pinchDistance(): number {
    const [a, b] = [...pointers.values()];
    return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
  }
}
