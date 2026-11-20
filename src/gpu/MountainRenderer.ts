import {
  BufferAttribute, BufferGeometry, Color, DoubleSide, DynamicDrawUsage, Mesh, MeshBasicNodeMaterial, PlaneGeometry,
} from 'three/webgpu';
import type { MountainRun } from '../simulation/MountainRun';
import {
  FORK_LENGTH, LANE_SPACING, TRAILS, pathCenter, pathHalfWidth, type Section,
} from '../world/EndlessMountain';
import { createAvalancheShader } from './shaders/avalanche';

const PALETTE = {
  pine: ['#b8dbd9', '#a2c9c5', '#d7ece9'],
  gate: ['#b5d1e8', '#a8c3db', '#d4e6f2'],
  air: ['#d2cbeb', '#b9b4db', '#e2dcf1'],
  chute: ['#8398a7', '#546d80', '#acc2cc'],
  avalanche: ['#b8cbd9', '#9cb3c5', '#d8e4ea'],
} as const;
const WARM: [string, string] = ['#ed764d', '#bd443d'];
const BLUE: [string, string] = ['#4e9cde', '#285b97'];

class CourseMesh {
  readonly mesh: Mesh<BufferGeometry, MeshBasicNodeMaterial>;
  private readonly positions: BufferAttribute;
  private readonly colors: BufferAttribute;
  private readonly palette = new Map<string, Color>();
  private vertex = 0;
  x = 0;
  y = 0;

  constructor(capacity: number, layer: number) {
    this.positions = new BufferAttribute(new Float32Array(capacity * 3), 3).setUsage(DynamicDrawUsage);
    this.colors = new BufferAttribute(new Float32Array(capacity * 3), 3).setUsage(DynamicDrawUsage);
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', this.positions);
    geometry.setAttribute('color', this.colors);
    const material = new MeshBasicNodeMaterial({ side: DoubleSide, vertexColors: true });
    this.mesh = new Mesh(geometry, material);
    this.mesh.position.z = layer;
    this.mesh.frustumCulled = false;
    geometry.setDrawRange(0, 0);
  }

  clear(x: number, y: number): void {
    this.x = x;
    this.y = y;
    this.vertex = 0;
  }

  place(cameraX: number, cameraY: number): void {
    this.mesh.position.x = this.x - cameraX;
    this.mesh.position.y = cameraY - this.y;
  }

  triangle(color: string, x1: number, y1: number, x2: number, y2: number, x3: number, y3: number): void {
    if (this.vertex + 3 > this.positions.count) return;
    let tint = this.palette.get(color);
    if (!tint) {
      tint = new Color(color);
      this.palette.set(color, tint);
    }
    this.positions.setXYZ(this.vertex, x1 - this.x, this.y - y1, 0);
    this.positions.setXYZ(this.vertex + 1, x2 - this.x, this.y - y2, 0);
    this.positions.setXYZ(this.vertex + 2, x3 - this.x, this.y - y3, 0);
    for (let i = 0; i < 3; i += 1) this.colors.setXYZ(this.vertex + i, tint.r, tint.g, tint.b);
    this.vertex += 3;
  }

  strip(color: string, left: number, right: number, y: number, nextLeft: number, nextRight: number, nextY: number): void {
    this.triangle(color, left, y, right, y, nextLeft, nextY);
    this.triangle(color, right, y, nextRight, nextY, nextLeft, nextY);
  }

  box(color: string, x: number, y: number, width: number, height: number): void {
    this.strip(color, x - width / 2, x + width / 2, y - height / 2,
      x - width / 2, x + width / 2, y + height / 2);
  }

  finish(): void {
    this.mesh.geometry.setDrawRange(0, this.vertex);
    this.positions.clearUpdateRanges();
    this.colors.clearUpdateRanges();
    this.positions.addUpdateRange(0, this.vertex * 3);
    this.colors.addUpdateRange(0, this.vertex * 3);
    this.positions.needsUpdate = true;
    this.colors.needsUpdate = true;
  }
}

export class MountainRenderer {
  private readonly terrain = new CourseMesh(4800, -0.34);
  private readonly course = new CourseMesh(2400, -0.26);
  private readonly avalanche = createAvalancheShader();
  private readonly powder = new Mesh(new PlaneGeometry(1, 1), this.avalanche.material);
  readonly meshes = [this.terrain.mesh, this.course.mesh, this.powder];
  private revision = -1;
  private band = Number.NaN;
  private bandHeight = 0;

  get drawCalls(): number {
    return Number(this.terrain.mesh.geometry.drawRange.count > 0) +
      Number(this.course.mesh.geometry.drawRange.count > 0) + Number(this.powder.visible);
  }

  update(run: MountainRun, cameraX: number, cameraY: number, viewHeight: number): void {
    const band = Math.floor(cameraY / 18);
    if (run.revision !== this.revision || band !== this.band || viewHeight !== this.bandHeight) {
      this.revision = run.revision;
      this.band = band;
      this.bandHeight = viewHeight;
      const min = band * 18 - viewHeight / 2 - 22;
      const max = band * 18 + viewHeight / 2 + 40;
      this.terrain.clear(run.section.center, band * 18);
      this.course.clear(run.section.center, band * 18);
      for (const section of [run.previous, run.section]) {
        if (section && min < section.end && max > section.start - 35) this.section(section, min, max);
      }
      this.terrain.finish();
      this.course.finish();
    }
    this.terrain.place(cameraX, cameraY);
    this.course.place(cameraX, cameraY);
    this.updatePowder(run, cameraX, cameraY, viewHeight);
  }

  private section(section: Section, min: number, max: number): void {
    const { center, start, end, trail, opening, slide } = section;
    const [light, dark, rim] = PALETTE[trail];
    for (let y = start + Math.max(0, Math.floor((min - start) / 5)) * 5; y < Math.min(max, end); y += 5) {
      const next = Math.min(end, y + 5);
      const a = pathCenter(section, y);
      const b = pathCenter(section, next);
      const wa = pathHalfWidth(section, y);
      const wb = pathHalfWidth(section, next);
      for (const side of [-1, 1]) {
        const edge = a + wa * side;
        const endEdge = b + wb * side;
        if (trail === 'chute') {
          const thickness = 12 + 5 * Math.cos(y * 0.14);
          const nextThickness = 12 + 5 * Math.cos(next * 0.14);
          this.terrain.strip(rim, edge, edge + thickness * side, y,
            endEdge, endEdge + nextThickness * side, next);
          this.course.strip(light, edge, edge + (thickness - 2) * side, y,
            endEdge, endEdge + (nextThickness - 2) * side, next);
          this.course.triangle(dark, edge + thickness * side, y, edge + 1.3 * side, y, endEdge + nextThickness * 0.52 * side, next);
          this.course.triangle('#c1d4de', edge, y, edge + 3.8 * side, y, endEdge, next);
        } else if (trail === 'pine' || trail === 'avalanche') {
          const thickness = 2.5 + 1.3 * Math.cos(y * 0.17);
          const nextThickness = 2.5 + 1.3 * Math.cos(next * 0.17);
          this.terrain.strip(rim, edge - side, edge + thickness * side, y,
            endEdge - side, endEdge + nextThickness * side, next);
          this.course.strip(light, edge, edge + 0.6 * side, y, endEdge, endEdge + 0.6 * side, next);
        } else {
          this.terrain.strip(rim, edge - 1.6 * side, edge + 1.6 * side, y,
            endEdge - 1.6 * side, endEdge + 1.6 * side, next);
          this.course.strip(light, edge - 0.22 * side, edge + 0.22 * side, y,
            endEdge - 0.22 * side, endEdge + 0.22 * side, next);
        }
      }
    }
    if (opening && start + 34 >= min && start - 30 < max) this.summit(center, start);
    if (trail === 'pine') {
      const y = start + 365 + section.variant * 44;
      if (y >= min - 16 && y <= max + 16) {
        const x = center + ((section.id & 1) === 0 ? 24 : -24);
        this.terrain.strip('#d6e8e7', x - 11, x + 5, y - 12, x - 6, x + 13, y + 16);
        this.beacon(x, y + 9, '#197a6c');
      }
    }
    for (let i = 0; i < section.gates.length; i += 1) {
      const gate = section.gates[i]!;
      if (gate.y < min || gate.y > max) continue;
      const [flag, pole] = i % 2 ? BLUE : WARM;
      this.terrain.box(i % 2 ? '#bed9f1' : '#f2cebf', gate.x, gate.y, 2 * gate.halfWidth, 1.05);
      for (const x of [gate.x - gate.halfWidth, gate.x + gate.halfWidth]) {
        this.course.box('#4f677e', x + 0.42, gate.y + 0.3, 0.75, 2.6);
        this.course.box(pole, x, gate.y - 1, 0.56, 4.5);
        this.course.triangle(flag, x, gate.y - 3, x + Math.sign(x - gate.x) * 2.8,
          gate.y - 2.4, x, gate.y - 0.6);
      }
      this.terrain.triangle(i % 2 ? '#d9e7f2' : '#f1e6df', gate.x - 10, gate.y - 1,
        gate.x, gate.y - 11, gate.x + 10, gate.y - 1);
    }
    for (const ramp of section.features) {
      if (ramp.type !== 'ramp' || ramp.y + 57 < min || ramp.y - 17 > max) continue;
      this.terrain.strip('#dce0f2', ramp.x - 2.5, ramp.x + 2.5, ramp.y - 16,
        ramp.x - 6.4, ramp.x + 6.4, ramp.y + 53);
      for (let y = ramp.y + 20; y < ramp.y + 54; y += 6) {
        this.course.box('#a5abd0', ramp.x - 5, y, 0.32, 1.85);
        this.course.box('#a5abd0', ramp.x + 5, y, 0.32, 1.85);
      }
      this.chevron(ramp.x, ramp.y - 10, 2.2, '#ab75ac');
    }
    if (slide && slide.shelterStart < max && slide.shelterEnd > min) {
      for (const side of [-1, 1]) {
        const edge = center + slide.shelterEdge * side;
        const outer = center + 41 * side;
        const first = Math.max(min - 4, slide.shelterStart);
        const last = Math.min(max + 4, slide.shelterEnd);
        this.terrain.strip('#c9e8e0', edge, outer, first, edge, outer, last);
        this.course.strip('#61a99c', edge, edge + side * 0.62, first, edge, edge + side * 0.62, last);
        for (let y = slide.shelterStart + 4; y <= last; y += 19) {
          if (y >= first) this.chevron(edge + side * 7, y, 3, '#439486');
        }
        if (slide.shelterStart >= min && slide.shelterStart <= max) {
          this.beacon(edge + side * 10, slide.shelterStart, '#177c71');
        }
      }
    }
    if (end - FORK_LENGTH < max) this.junction(section);
  }

  private summit(x: number, y: number): void {
    this.terrain.strip('#d4e9ed', x - 40, x + 40, y - 18, x - 21, x + 21, y + 34);
    for (const side of [-1, 1]) {
      this.course.box('#95bec6', x + side * 23, y + 8, 20, 9);
      this.course.box('#517b89', x + side * 23, y + 6, 19, 1.25);
      this.course.box('#547895', x + side * 16, y + 6, 0.7, 5);
      this.beacon(x + side * 10, y + 13, '#267e83');
    }
    this.course.box('#abc9d2', x, y - 10, 38, 10);
    this.course.box('#445c6f', x, y - 14, 37, 7);
    this.course.triangle('#c1d9e2', x - 20, y - 13, x, y - 23, x + 20, y - 13);
    this.course.triangle('#f0f8f6', x - 19.5, y - 14, x, y - 23, x + 4, y - 14);
    for (let i = -2; i <= 2; i += 1) this.course.box('#ffdd91', x + i * 5, y - 11.5, 2.3, 1.35);
    this.chevron(x, y + 17, 4, '#45978c');
  }

  private junction(section: Section): void {
    const { center, end } = section;
    const entry = end - FORK_LENGTH;
    this.terrain.strip('#d5e8eb', center - 36, center + 36, entry,
      center - 36, center + 36, end);
    for (const offer of section.offers) {
      const x = center + offer.lane * LANE_SPACING;
      const color = TRAILS[offer.trail].color;
      this.terrain.strip('#edf5f6', x * 0.66 + center * 0.34 - 5, x * 0.66 + center * 0.34 + 5, entry,
        x - (offer.lane < 0 ? 18.8 : 8.65), x + (offer.lane > 0 ? 18.8 : 8.65), end);
      this.beacon(x - 6.5, end - 16, color);
      this.beacon(x + 6.5, end - 16, color);
      this.chevron(x, end - 12, 3.8, color);
      this.chevron(x, end - 5, 3.1, color);
    }
    for (const offset of [-LANE_SPACING / 2, LANE_SPACING / 2]) {
      for (let y = end - 21; y < end; y += 3.35) this.course.box('#86aab5', center + offset, y, 0.43, 1.65);
    }
  }

  private beacon(x: number, y: number, color: string): void {
    this.course.box('#476674', x + 0.8, y + 0.15, 0.63, 5);
    this.course.box('#f0f7f8', x, y - 1, 0.62, 5);
    this.course.strip(color, x - 1.9, x + 1.9, y - 4.6, x - 1.6, x + 1.6, y - 2.15);
  }

  private chevron(x: number, y: number, width: number, color: string): void {
    this.course.triangle(color, x - width, y - 1.2, x + width, y - 1.2, x, y + 1.8);
    this.course.triangle('#e6f1f4', x - width * 0.6, y - 1.28, x + width * 0.6, y - 1.28, x, y + 0.2);
  }

  private updatePowder(run: MountainRun, x: number, y: number, height: number): void {
    const { slide, center } = run.section;
    const front = run.front;
    this.powder.visible = !!slide && run.front > 0 &&
      front > y - height / 2 - 3 && front - 44 < y + height / 2;
    if (!this.powder.visible || !slide) return;
    this.avalanche.phase.value = front - run.section.start;
    this.avalanche.halfWidth.value = slide.shelterEdge;
    this.powder.scale.set(slide.shelterEdge * 2, 46, 1);
    this.powder.position.set(center - x, y - front + 21, 0.43);
  }
}
