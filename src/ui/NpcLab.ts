import type { NpcFall, NpcType } from '../simulation/NpcSystem';

export interface NpcLabSettings {
  active: boolean;
  type: NpcType;
  pose: number;
  fall: NpcFall;
}

export class NpcLab {
  private readonly root: HTMLElement;
  private readonly settings: NpcLabSettings = {
    active: false,
    type: 'speed-skier',
    pose: 0,
    fall: 'none',
  };

  constructor(
    host: HTMLElement,
    private readonly onChange: (settings: Readonly<NpcLabSettings>) => void,
    initialVisible: boolean,
  ) {
    this.root = document.createElement('section');
    this.root.className = 'npc-lab';
    this.root.innerHTML = `<header><div><span>DEV INSPECTOR</span><strong>NPC laboratory</strong></div>
      <button type="button" data-close aria-label="Close NPC laboratory">×</button></header>
      <p>Controlled test slope. Three rigs share one instanced draw call.</p>
      <label>Lead rig <select data-type>
        <option value="speed-skier">Speed skier</option>
        <option value="beginner-skier">Beginner skier</option>
        <option value="snowboarder">Snowboarder</option>
      </select></label>
      <label>Carve / pose <input data-pose type="range" min="-1" max="1" step=".05" value="0"><output>0.00</output></label>
      <label>Fall phase <select data-fall>
        <option value="none">Riding</option><option value="stumble">Stumble</option>
        <option value="spin">Spin fall</option><option value="tumble">Tumble</option>
      </select></label>
      <div class="npc-lab__actions"><button type="button" data-cycle>Cycle rig</button><button type="button" data-replay>Replay motion</button></div>
      <small><kbd>F5</kbd> lab · <kbd>[</kbd>/<kbd>]</kbd> rigs</small>`;
    host.append(this.root);
    this.root.addEventListener('input', this.read);
    this.root.addEventListener('change', this.read);
    this.root.addEventListener('click', (event) => {
      const target = event.target as HTMLElement;
      if (target.hasAttribute('data-close')) this.setVisible(false);
      if (target.hasAttribute('data-cycle')) this.cycle(1);
      if (target.hasAttribute('data-replay')) {
        this.settings.fall = 'none';
        this.emit();
        requestAnimationFrame(() => {
          this.settings.fall = 'tumble';
          (this.root.querySelector('[data-fall]') as HTMLSelectElement).value = 'tumble';
          this.emit();
        });
      }
    });
    addEventListener('keydown', this.keydown);
    if (initialVisible) this.setVisible(true);
  }

  private readonly read = (): void => {
    this.settings.type = (this.root.querySelector('[data-type]') as HTMLSelectElement).value as NpcType;
    this.settings.pose = Number((this.root.querySelector('[data-pose]') as HTMLInputElement).value);
    this.settings.fall = (this.root.querySelector('[data-fall]') as HTMLSelectElement).value as NpcFall;
    this.root.querySelector('output')!.textContent = this.settings.pose.toFixed(2);
    this.emit();
  };

  private readonly keydown = (event: KeyboardEvent): void => {
    if (event.code === 'F5') {
      event.preventDefault();
      this.setVisible(!this.settings.active);
    } else if (this.settings.active && event.code === 'BracketRight') {
      this.cycle(1);
    } else if (this.settings.active && event.code === 'BracketLeft') {
      this.cycle(-1);
    }
  };

  private cycle(direction: number): void {
    const types: NpcType[] = ['speed-skier', 'beginner-skier', 'snowboarder'];
    const index = types.indexOf(this.settings.type);
    this.settings.type = types[(index + direction + types.length) % types.length]!;
    (this.root.querySelector('[data-type]') as HTMLSelectElement).value = this.settings.type;
    this.emit();
  }

  private setVisible(visible: boolean): void {
    this.settings.active = visible;
    this.root.classList.toggle('visible', visible);
    this.emit();
  }

  private emit(): void {
    this.onChange(this.settings);
  }
}
