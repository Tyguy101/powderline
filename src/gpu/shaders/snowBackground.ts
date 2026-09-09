import { MeshBasicNodeMaterial } from 'three/webgpu';
import type { Node } from 'three/webgpu';
import { abs, float, fract, mix, smoothstep, uniform, uv, vec3 } from 'three/tsl';

function softWave(value: Node<'float'>): Node<'float'> {
  const triangle = float(1).sub(abs(fract(value).mul(2).sub(1)));
  return smoothstep(0.08, 0.92, triangle);
}

export interface SnowShader {
  readonly material: MeshBasicNodeMaterial;
  readonly worldX: ReturnType<typeof uniform>;
  readonly worldY: ReturnType<typeof uniform>;
  readonly viewWidth: ReturnType<typeof uniform>;
  readonly viewHeight: ReturnType<typeof uniform>;
}

export function createSnowShader(seed: number): SnowShader {
  const worldX = uniform(0);
  const worldY = uniform(0);
  const viewWidth = uniform(80);
  const viewHeight = uniform(80);
  const p = uv();
  const wx = p.x.sub(0.5).mul(viewWidth).add(worldX);
  const wy = float(0.5).sub(p.y).mul(viewHeight).add(worldY);
  // Smooth triangle waves preserve the subtle moving snow bands without four
  // transcendental operations per pixel across the fullscreen background.
  const broad = softWave(wx.mul(0.0088).add(wy.mul(0.0029)));
  const grain = softWave(wx.mul(0.049).add(wy.mul(0.035)).add(float((seed % 997) * 0.01)));
  const streak = softWave(wx.mul(0.0064).sub(wy.mul(0.027)));
  const base = mix(vec3(0.72, 0.9, 0.94), vec3(0.95, 0.985, 0.985), p.y);
  const shade = broad.mul(0.045).add(grain.mul(0.018)).add(streak.mul(0.012));
  const material = new MeshBasicNodeMaterial();
  material.colorNode = base.add(vec3(shade));
  material.depthWrite = false;
  return { material, worldX, worldY, viewWidth, viewHeight };
}
