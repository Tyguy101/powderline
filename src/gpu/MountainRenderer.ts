import {
  BufferAttribute, BufferGeometry, Color, DoubleSide, DynamicDrawUsage, Mesh, MeshBasicNodeMaterial, PlaneGeometry,
} from 'three/webgpu';
import type { MountainRun } from '../simulation/MountainRun';
import {
  FORK_BANNER_OFFSET, FORK_COLORS, FORK_ENTRANCE_OFFSET, FORK_GUIDE_OFFSET,
  FORK_LENGTH, LANE_SPACING, jumpGapEdge, pathCenter, pathHalfWidth, type JumpLine, type Section,
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
  private nextGate = -1;

  get drawCalls(): number {
    return Number(this.terrain.mesh.geometry.drawRange.count > 0) +
      Number(this.course.mesh.geometry.drawRange.count > 0) + Number(this.powder.visible);
  }

  update(run: MountainRun, cameraX: number, cameraY: number, viewHeight: number): void {
    const band = Math.floor(cameraY / 18);
    if (run.revision !== this.revision || band !== this.band || viewHeight !== this.bandHeight ||
      run.gateIndex !== this.nextGate) {
      this.revision = run.revision;
      this.band = band;
      this.bandHeight = viewHeight;
      this.nextGate = run.gateIndex;
      const min = band * 18 - viewHeight / 2 - 22;
      const max = band * 18 + viewHeight / 2 + 40;
      this.terrain.clear(run.section.center, band * 18);
      this.course.clear(run.section.center, band * 18);
      for (const section of [run.previous, run.section]) {
        if (section && min < section.end + 32 && max > section.start - 35) {
          this.section(section, min, max, section === run.section ? run.gateIndex : -1);
        }
      }
      this.terrain.finish();
      this.course.finish();
    }
    this.terrain.place(cameraX, cameraY);
    this.course.place(cameraX, cameraY);
    this.updatePowder(run, cameraX, cameraY, viewHeight);
  }

  private section(section: Section, min: number, max: number, nextGate: number): void {
    const { center, start, end, trail, opening, glade } = section;
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
    if (glade && glade.y - 52 < max && glade.y + 47 > min) this.glade(section);
    for (let i = 0; i < section.gates.length; i += 1) {
      const gate = section.gates[i]!;
      if (gate.y < min || gate.y > max) continue;
      const [flag, pole] = i % 2 ? BLUE : WARM;
      if (i === nextGate) {
        this.terrain.strip('#fff0ad', gate.x - gate.halfWidth - 1.5, gate.x + gate.halfWidth + 1.5, gate.y - 2,
          gate.x - gate.halfWidth, gate.x + gate.halfWidth, gate.y + 1.4);
      }
      this.terrain.box(i % 2 ? '#bed9f1' : '#f2cebf', gate.x, gate.y, 2 * gate.halfWidth, 1.05);
      for (const x of [gate.x - gate.halfWidth, gate.x + gate.halfWidth]) {
        this.course.box('#4f677e', x + 0.42, gate.y + 0.3, 0.75, 2.6);
        this.course.box(pole, x, gate.y - 1, 0.56, 4.5);
        this.course.triangle(i === nextGate ? '#edab30' : flag, x, gate.y - 3, x + Math.sign(x - gate.x) * 2.8,
          gate.y - 2.4, x, gate.y - 0.6);
      }
      this.terrain.triangle(i % 2 ? '#d9e7f2' : '#f1e6df', gate.x - 10, gate.y - 1,
        gate.x, gate.y - 11, gate.x + 10, gate.y - 1);
    }
    for (const jump of section.jumps) {
      if (jump.gapEnd + 30 >= min && jump.lip - 35 <= max) this.jump(jump);
    }
    for (const wave of section.waves) {
      if (wave.warningAt > max || wave.trigger + 110 < min) continue;
      const edge = center + wave.safeSide * wave.safeEdge;
      const begin = Math.max(min, wave.warningAt + 19);
      const endFlags = Math.min(max, wave.trigger + 110);
      for (let y = wave.warningAt + 28; y < endFlags; y += 19) {
        if (y < begin) continue;
        this.beacon(edge, y, '#c17a24');
        const x = edge + wave.safeSide * 5.9;
        this.course.triangle('#a56a24', x - wave.safeSide * 4, y - 3.5,
          x - wave.safeSide * 4, y + 3.5, x + wave.safeSide * 3.5, y);
      }
      this.beacon(center - wave.safeSide * 32, wave.warningAt + 21, '#b43f36');
      this.beacon(edge + wave.safeSide * 12, wave.warningAt + 21, '#387a79');
    }
    if (end - FORK_BANNER_OFFSET - 5 < max) this.junction(section);
  }

  private glade(section: Section): void {
    const { islandX: x, y, relaxedSide } = section.glade!;
    const scenic = -relaxedSide;
    this.terrain.strip('#d1e4e8', x - 1.5, x + 2, y - 22, x - 8, x + 6, y - 8);
    this.terrain.strip('#d1e4e8', x - 8, x + 6, y - 8, x - 10.4, x + 8.9, y + 7);
    this.terrain.strip('#c2dade', x - 10.4, x + 8.9, y + 7, x - 6, x + 1.5, y + 27);
    this.course.triangle('#f2f8f9', x - 7, y - 9, x + 4.2, y - 10, x + 5.2, y + 13);
    for (const side of [relaxedSide, scenic]) {
      const wide = side === relaxedSide;
      const entry = section.center + side * (wide ? 4 : 6);
      const apex = section.center + side * (wide ? 13 : 27);
      const width = wide ? 6 : 3.3;
      this.terrain.strip('#eff7f8', entry - 3, entry + 3, y - 43, apex - width, apex + width, y - 4);
      this.terrain.strip('#eff7f8', apex - width, apex + width, y - 4,
        apex - width, apex + width, y + 15);
      this.terrain.strip('#edf6f7', apex - width, apex + width, y + 15,
        section.center + side * 4 - 2, section.center + side * 4 + 2, y + 58);
      this.beacon(entry, y - 32, wide ? '#337f78' : '#47779c');
    }
  }

  private jump(line: JumpLine): void {
    const { x, lip, gapStart, gapEnd, halfWidth, gapHalfWidth, kind } = line;
    const left = x - gapHalfWidth;
    const right = x + gapHalfWidth;
    this.terrain.strip('#ddebf0', x - halfWidth - 2, x + halfWidth + 2, lip - 24,
      x - halfWidth - 1, x + halfWidth + 1, lip + 6);
    this.terrain.strip('#dae9ed', left, right, gapEnd, x - 5.5, x + 5.5, gapEnd + 26);
    this.course.strip('#b6cad6', x - halfWidth - 0.9, x + halfWidth + 0.9, lip - 10.65,
      x - halfWidth - 0.9, x + halfWidth + 0.9, lip + 2.7);
    this.course.strip('#a53a31', x - halfWidth, x + halfWidth, lip - 10,
      x - halfWidth, x + halfWidth, lip);
    this.course.strip('#cd5340', x - halfWidth + 0.55, x + halfWidth - 0.55, lip - 9,
      x - halfWidth + 0.55, x + halfWidth - 0.55, lip - 1.05);
    for (const side of [-1, 1]) {
      this.course.box('#fff2db', x + side * (halfWidth - 0.68), lip - 5, 0.46, 8);
      this.chevron(x + side * (gapHalfWidth + 8.5), lip - 12, 2.4, '#679b9b');
      this.beacon(x + side * (gapHalfWidth + 8.5), lip - 4, '#3d8b81');
      this.beacon(x + side * (gapHalfWidth + 1.4), gapEnd + 1, '#497e91');
    }
    this.chevron(x, lip - 5, 1.75, '#fff3cb');
    this.course.box('#fff3cb', x, lip - 0.25, halfWidth * 2, 0.54);
    for (let i = 0; i < 4; i += 1) {
      const y = gapStart + (gapEnd - gapStart) * i / 4;
      const next = gapStart + (gapEnd - gapStart) * (i + 1) / 4;
      this.terrain.strip(kind === 'crevice' ? '#244c69' : '#a7bac1',
        jumpGapEdge(line, y, -1), jumpGapEdge(line, y, 1), y,
        jumpGapEdge(line, next, -1), jumpGapEdge(line, next, 1), next);
    }
    const upperLeft = jumpGapEdge(line, gapStart, -1);
    const upperRight = jumpGapEdge(line, gapStart, 1);
    const lowerLeft = jumpGapEdge(line, gapEnd, -1);
    const lowerRight = jumpGapEdge(line, gapEnd, 1);
    for (let i = 0; i < 5; i += 1) {
      const a = upperLeft + i * (upperRight - upperLeft) / 5;
      const b = a + (upperRight - upperLeft) / 5;
      if (kind === 'crevice') {
        const low = lowerLeft + i * (lowerRight - lowerLeft) / 5;
        const bottomWidth = (lowerRight - lowerLeft) / 5;
        this.course.triangle('#527c93', a, gapStart, b, gapStart, b - 1.0, gapStart + 4 + (i % 2) * 4);
        this.course.triangle('#95b7c7', low, gapEnd, low + bottomWidth, gapEnd,
          low + bottomWidth * 0.6, gapEnd - 4 - (i % 3) * 2.2);
      } else {
        const y = gapStart + 2 + i % 2 * 3.7;
        this.course.triangle(kind === 'rocks' ? '#627987' : '#41705f',
          a, gapEnd, b, gapEnd, (a + b) / 2, y);
        this.course.triangle('#e3edf0', a + 0.53, y + 3, (a + b) / 2, y, b - 0.4, y + 3);
      }
    }
    this.course.box('#f5fbfc', x, gapEnd + 1, 2 * gapHalfWidth, 0.55);
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
    this.gantry(center, end - FORK_BANNER_OFFSET, 33, '#203c49');
    for (const offer of section.offers) {
      const x = center + offer.lane * LANE_SPACING;
      const color = FORK_COLORS[offer.lane + 1]!;
      this.gantry(x, end - FORK_GUIDE_OFFSET, 16.7, color);
      this.gantry(x, end - FORK_ENTRANCE_OFFSET, 16.7, color);
      const merge = center + offer.lane * 9;
      this.terrain.strip('#e4f0f3', merge - 3, merge + 3, entry + 20, x - 7.4, x + 7.4, end - 44);
      this.terrain.strip('#e4f0f3', x - 7.4, x + 7.4, end - 44, x - 8.6, x + 8.6, end);
      const downhill = x + offer.lane * 4.2;
      this.terrain.strip('#e4f0f3', x - 8.6, x + 8.6, end, downhill - 6.6, downhill + 6.6, end + 15);
      this.terrain.strip('#edf6f7', downhill - 6.6, downhill + 6.6, end + 15,
        downhill - 2, downhill + 2, end + 32);
      for (const offset of [-4.2, 4.2]) {
        this.terrain.strip('#dcebef', merge + offset - 0.24, merge + offset + 0.24, entry + 30,
          x + offset - 0.4, x + offset + 0.4, end - 44);
        this.terrain.strip('#dcebef', x + offset - 0.4, x + offset + 0.4, end - 44,
          x + offset - 0.4, x + offset + 0.4, end);
      }
      this.chevron(x, end - 16, 3.5, '#6a8991');
    }
    for (const offset of [-LANE_SPACING / 2, LANE_SPACING / 2]) {
      const x = center + offset;
      this.terrain.strip('#bcd3dc', x - 0.5, x + 0.5, end - 57, x - 3.1, x + 3.1, end - 41);
      this.terrain.strip('#bcd3dc', x - 3.1, x + 3.1, end - 41, x - 0.3, x + 0.3, end - 5);
      this.course.triangle('#f1f8fa', x, end - 57, x - 2.5, end - 37, x, end - 7);
      this.course.triangle('#d9eaee', x, end - 57, x + 2.2, end - 39, x, end - 7);
    }
  }

  private gantry(x: number, y: number, width: number, color: string): void {
    this.course.box('#51606a', x + 1, y + 2.5, width + 1.2, 0.9);
    this.course.box(color, x, y - 0.55, width, 1.65);
    for (const side of [-1, 1]) {
      const post = x + side * width * 0.49;
      this.course.box('#564936', post, y + 0.1, 0.7, 4.2);
      this.course.box('#f2eee6', post, y + 2.2, 1.5, 1);
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
    const { center } = run.section;
    const wave = run.wave;
    const front = run.front;
    this.powder.visible = !!wave && run.front > 0 &&
      front > y - height / 2 - 3 && front - 55 < y + height / 2;
    if (!this.powder.visible || !wave) return;
    const across = (wave.safeEdge - 43) / 2;
    const halfWidth = (wave.safeEdge + 43) / 2;
    this.avalanche.phase.value = front - run.section.start;
    this.avalanche.halfWidth.value = halfWidth;
    this.avalanche.side.value = wave.safeSide;
    this.avalanche.acrossCenter.value = across;
    this.powder.scale.set(halfWidth * 2, 56, 1);
    this.powder.position.set(center + across * wave.safeSide - x, y - front + 26,
      run.avalanche === 'caught' ? 0.58 : 0.43);
  }
}
