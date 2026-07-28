import { MeshBasicNodeMaterial } from 'three/webgpu';
import { cos, float, mix, sin, uniform, uv, vec3 } from 'three/tsl';

export interface SnowShader {
  readonly material: MeshBasicNodeMaterial;
  readonly worldX: ReturnType<typeof uniform>;
  readonly worldY: ReturnType<typeof uniform>;
}

export function createSnowShader(seed: number): SnowShader {
  const worldX = uniform(0);
  const worldY = uniform(0);
  const p = uv();
  const wx = p.x.mul(15).add(worldX.mul(0.025));
  const wy = p.y.mul(24).add(worldY.mul(0.018));
  const broad = sin(wx.mul(1.7).add(wy.mul(0.42))).mul(0.5).add(0.5);
  const grain = sin(wx.mul(7.1).add(float(seed % 997))).mul(cos(wy.mul(4.3))).mul(0.5).add(0.5);
  const streak = sin(wx.mul(0.85).sub(wy.mul(3.8))).mul(0.5).add(0.5);
  const base = mix(vec3(0.72, 0.9, 0.94), vec3(0.94, 0.98, 0.98), p.y);
  const shade = broad.mul(0.045).add(grain.mul(0.022)).add(streak.mul(0.012));
  const material = new MeshBasicNodeMaterial();
  material.colorNode = base.add(vec3(shade));
  material.depthWrite = false;
  return { material, worldX, worldY };
}
