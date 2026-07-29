import { MeshBasicNodeMaterial, StorageTexture } from 'three/webgpu';
import type { Node } from 'three/webgpu';
import {
  abs,
  clamp,
  cos,
  exp,
  float,
  floor,
  mix,
  sin,
  texture,
  uniform,
  uv,
  vec2,
  vec3,
} from 'three/tsl';
import {
  SNOW_MASK_CELL_SIZE,
  SNOW_MASK_RELAX_SECONDS,
  SNOW_MASK_SIZE,
} from '../PersistentSnowMask';

export interface SnowShader {
  readonly material: MeshBasicNodeMaterial;
  readonly worldX: ReturnType<typeof uniform>;
  readonly worldY: ReturnType<typeof uniform>;
  readonly viewWidth: ReturnType<typeof uniform>;
  readonly viewHeight: ReturnType<typeof uniform>;
}

function sampleMask(
  maskTexture: StorageTexture,
  world: Node<'vec2'>,
  time: Node<'float'>,
  resetTime: Node<'float'>,
): Node<'float'> {
  const globalCell = floor(world.div(SNOW_MASK_CELL_SIZE));
  const texel = globalCell.sub(
    floor(globalCell.div(SNOW_MASK_SIZE)).mul(SNOW_MASK_SIZE),
  );
  const normalizedUv = texel.add(0.5).div(SNOW_MASK_SIZE);
  const stored = texture(maskTexture, normalizedUv) as Node<'vec4'>;
  const age = clamp(time.sub(stored.w), 0, SNOW_MASK_RELAX_SECONDS * 4);
  const page = floor(globalCell.div(SNOW_MASK_SIZE));
  const validPage = float(1)
    .sub(clamp(abs(stored.y.sub(page.x)).add(abs(stored.z.sub(page.y))).mul(10), 0, 1));
  const validTime = float(1).sub(clamp(resetTime.sub(stored.w).mul(100), 0, 1));
  return stored.x
    .mul(exp(age.div(SNOW_MASK_RELAX_SECONDS).negate()))
    .mul(validPage)
    .mul(validTime) as Node<'float'>;
}

export function createSnowShader(
  seed: number,
  maskTexture: StorageTexture,
  maskTime: ReturnType<typeof uniform>,
  maskResetTime: ReturnType<typeof uniform>,
): SnowShader {
  const worldX = uniform(0);
  const worldY = uniform(0);
  const viewWidth = uniform(80);
  const viewHeight = uniform(80);
  const p = uv();
  const timeNode = maskTime as unknown as Node<'float'>;
  const resetTimeNode = maskResetTime as unknown as Node<'float'>;
  const wx = p.x.sub(0.5).mul(viewWidth).add(worldX);
  const wy = float(0.5).sub(p.y).mul(viewHeight).add(worldY);
  const broad = sin(wx.mul(0.055).add(wy.mul(0.018))).mul(0.5).add(0.5);
  const grain = sin(wx.mul(0.31).add(float(seed % 997))).mul(cos(wy.mul(0.22))).mul(0.5).add(0.5);
  const streak = sin(wx.mul(0.04).sub(wy.mul(0.17))).mul(0.5).add(0.5);
  const world = vec2(wx, wy);
  const mask = sampleMask(maskTexture, world, timeNode, resetTimeNode);
  const powderEdge = mask
    .mul(sin(wx.mul(19).add(wy.mul(13))).mul(0.5).add(0.5))
    .mul(0.38);
  const base = mix(vec3(0.72, 0.9, 0.94), vec3(0.95, 0.985, 0.985), p.y);
  const shade = broad.mul(0.045).add(grain.mul(0.018)).add(streak.mul(0.012));
  const material = new MeshBasicNodeMaterial();
  const trackedSnow = mix(
    base.add(vec3(shade)),
    vec3(0.36, 0.61, 0.68),
    mask.mul(0.74),
  );
  material.colorNode = mix(trackedSnow, vec3(0.98, 1, 1), powderEdge.mul(0.5));
  material.depthWrite = false;
  return { material, worldX, worldY, viewWidth, viewHeight };
}
