/** 32-bit avalanche hash. Shader implementations must preserve unsigned overflow. */
export function hashCoordinates(seed: number, x: number, y: number, category = 0): number {
  let value = (seed ^ Math.imul(x, 0x9e3779b1) ^ Math.imul(y, 0x85ebca77) ^ category) >>> 0;
  value ^= value >>> 16;
  value = Math.imul(value, 0x7feb352d) >>> 0;
  value ^= value >>> 15;
  value = Math.imul(value, 0x846ca68b) >>> 0;
  return (value ^ (value >>> 16)) >>> 0;
}

export function hashUnit(seed: number, x: number, y: number, category = 0): number {
  return hashCoordinates(seed, x, y, category) / 0x1_0000_0000;
}
