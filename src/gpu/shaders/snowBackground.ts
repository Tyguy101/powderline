import { MeshBasicNodeMaterial } from 'three/webgpu';
import { cos, float, mix, sin, uniform, uv, vec3 } from 'three/tsl';

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
  const broad = sin(wx.mul(0.055).add(wy.mul(0.018))).mul(0.5).add(0.5);
  const grain = sin(wx.mul(0.31).add(float(seed % 997))).mul(cos(wy.mul(0.22))).mul(0.5).add(0.5);
  const streak = sin(wx.mul(0.04).sub(wy.mul(0.17))).mul(0.5).add(0.5);
  const base = mix(vec3(0.72, 0.9, 0.94), vec3(0.95, 0.985, 0.985), p.y);
  const shade = broad.mul(0.045).add(grain.mul(0.018)).add(streak.mul(0.012));
  const material = new MeshBasicNodeMaterial();
  material.colorNode = base.add(vec3(shade));
  material.depthWrite = false;
  return { material, worldX, worldY, viewWidth, viewHeight };
}
