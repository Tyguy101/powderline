import { MeshBasicNodeMaterial } from 'three/webgpu';
import { abs, float, fract, max, mix, sin, smoothstep, uniform, uv, vec3 } from 'three/tsl';

// The plane covers only the slide path. Its down-slope edge shares the chase
// model's crown, while small billows move through the last few meters.
export function createAvalancheShader() {
  const phase = uniform(0);
  const halfWidth = uniform(22);
  const side = uniform(1);
  const acrossCenter = uniform(0);
  const point = uv();
  const x = point.x.sub(0.5).mul(halfWidth.mul(2));
  const distanceBehindFront = point.y.mul(56).sub(2);
  const crown = max(0, acrossCenter.add(x.mul(side)).add(12)).mul(0.27);
  const billow = sin(x.mul(0.46).add(phase.mul(0.095))).mul(1.2)
    .add(sin(x.mul(1.13).sub(phase.mul(0.17))).mul(0.8));
  const depth = distanceBehindFront.sub(crown);
  const wake = smoothstep(-0.4, 1.8, depth).mul(float(1).sub(smoothstep(29, 45, depth)));
  const foam = smoothstep(-1.1, 0.5, depth).mul(float(1).sub(smoothstep(2.1, 5.3, depth.add(billow))));
  const swirl = sin(depth.mul(0.61).add(x.mul(0.34)).sub(phase.mul(0.4)))
    .add(sin(x.mul(0.84).sub(depth.mul(0.41)).add(phase.mul(0.24))));
  const pockets = smoothstep(-0.7, 1.72, swirl);
  const grain = fract(sin(x.mul(18.32).add(distanceBehindFront.mul(8.33)).add(phase.mul(0.2))).mul(413.7));
  const sparkle = smoothstep(0.94, 1, grain).mul(0.075);
  const edge = float(1).sub(smoothstep(0.975, 1, abs(x).div(halfWidth)));
  const cold = mix(vec3(0.35, 0.52, 0.66), vec3(0.7, 0.84, 0.9), pockets);
  const color = mix(cold, vec3(0.98, 0.99, 1), max(foam, pockets.mul(0.46).add(sparkle)));
  const material = new MeshBasicNodeMaterial();
  material.transparent = true;
  material.depthWrite = false;
  material.colorNode = color;
  material.opacityNode = max(foam.mul(0.98), wake.mul(0.7).add(pockets.mul(wake).mul(0.24))).mul(edge);
  return { material, phase, halfWidth, side, acrossCenter };
}
