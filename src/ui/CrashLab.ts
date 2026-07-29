export interface CrashLabSettings {
  obstacleType: 'tree' | 'rock';
  speed: number;
  angle: number;
  contactOffset: number;
  airborne: boolean;
  severityBias: number;
  variation: number;
}

export class CrashLab {
  private readonly root: HTMLElement;
  private variation = 0;

  constructor(
    host: HTMLElement,
    onImpact: (settings: CrashLabSettings) => string,
    onReset: () => void,
    initiallyVisible: boolean,
  ) {
    this.root = document.createElement('aside');
    this.root.className = `crash-lab${initiallyVisible ? ' visible' : ''}`;
    this.root.innerHTML = `<header><div><span>DEVELOPMENT</span><strong>Crash laboratory</strong></div>
      <button type="button" data-close aria-label="Close crash laboratory">×</button></header>
      <label>Obstacle <select data-field="obstacleType"><option>tree</option><option>rock</option></select></label>
      <label>Impact speed <input data-field="speed" type="range" min="5" max="38" value="27"><output>27</output></label>
      <label>Direction <input data-field="angle" type="range" min="-70" max="70" value="0"><output>0°</output></label>
      <label>Contact offset <input data-field="contactOffset" type="range" min="-100" max="100" value="0"><output>0.00</output></label>
      <label>Severity <input data-field="severityBias" type="range" min="65" max="125" value="100"><output>1.00×</output></label>
      <label class="check"><input data-field="airborne" type="checkbox"> Airborne impact</label>
      <div class="crash-lab__actions"><button data-action="replay">Replay same</button><button data-action="vary">Next variation</button><button data-action="reset">Reset</button></div>
      <p data-result>Press <kbd>F4</kbd> to toggle · variation 0</p>`;
    host.append(this.root);

    const read = (): CrashLabSettings => ({
      obstacleType: this.value<HTMLSelectElement>('obstacleType').value as 'tree' | 'rock',
      speed: Number(this.value<HTMLInputElement>('speed').value),
      angle: Number(this.value<HTMLInputElement>('angle').value),
      contactOffset: Number(this.value<HTMLInputElement>('contactOffset').value) / 100,
      airborne: this.value<HTMLInputElement>('airborne').checked,
      severityBias: Number(this.value<HTMLInputElement>('severityBias').value) / 100,
      variation: this.variation,
    });
    const updateOutputs = (): void => {
      for (const input of this.root.querySelectorAll<HTMLInputElement>('input[type="range"]')) {
        const output = input.nextElementSibling;
        if (!output) continue;
        const field = input.dataset.field;
        output.textContent =
          field === 'angle'
            ? `${input.value}°`
            : field === 'contactOffset'
              ? (Number(input.value) / 100).toFixed(2)
              : field === 'severityBias'
                ? `${(Number(input.value) / 100).toFixed(2)}×`
                : input.value;
      }
    };
    this.root.addEventListener('input', updateOutputs);
    this.root.addEventListener('click', (event) => {
      const target = event.target as HTMLElement;
      if (target.closest('[data-close]')) this.root.classList.remove('visible');
      const action = target.closest<HTMLElement>('[data-action]')?.dataset.action;
      if (action === 'vary') this.variation += 1;
      if (action === 'reset') onReset();
      if (action === 'replay' || action === 'vary') {
        const result = onImpact(read());
        this.root.querySelector('[data-result]')!.textContent =
          `${result} · variation ${this.variation}`;
      }
    });
    addEventListener('keydown', (event) => {
      if (event.code === 'F4') {
        event.preventDefault();
        this.root.classList.toggle('visible');
      }
      if (event.code === 'KeyC' && event.shiftKey && this.root.classList.contains('visible')) {
        const result = onImpact(read());
        this.root.querySelector('[data-result]')!.textContent =
          `${result} · variation ${this.variation}`;
      }
    });
    updateOutputs();
  }

  private value<T extends HTMLElement>(field: string): T {
    return this.root.querySelector<T>(`[data-field="${field}"]`)!;
  }
}
