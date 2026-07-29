export class CrashOverlay {
  private readonly root: HTMLElement;
  private readonly distance: HTMLElement;
  private replay = '';

  constructor(
    host: HTMLElement,
    onRestart: () => void,
  ) {
    this.root = document.createElement('section');
    this.root.className = 'crash-overlay';
    this.root.setAttribute('aria-label', 'Run crashed');
    this.root.innerHTML = `<div class="crash-card">
      <span>WIPEOUT</span>
      <strong>Powder happens.</strong>
      <p>You made it <b data-distance>0 m</b> downhill.</p>
      <div><button type="button" data-action="restart">Restart <kbd>R</kbd></button>
      <button type="button" data-action="replay">Copy replay link</button></div>
      <small data-copy-status></small>
    </div>`;
    host.append(this.root);
    this.distance = this.root.querySelector('[data-distance]')!;
    this.root.addEventListener('click', async (event) => {
      const action = (event.target as HTMLElement).closest<HTMLElement>('[data-action]')?.dataset.action;
      if (action === 'restart') onRestart();
      if (action === 'replay') {
        const url = new URL(location.href);
        url.search = '';
        url.searchParams.set('replay', this.replay);
        await navigator.clipboard.writeText(url.toString());
        this.root.querySelector<HTMLElement>('[data-copy-status]')!.textContent =
          'Replay link copied.';
      }
    });
  }

  show(distance: number, replay: string): void {
    this.distance.textContent = `${Math.floor(distance)} m`;
    this.replay = replay;
    this.root.classList.add('visible');
  }

  hide(): void {
    this.root.classList.remove('visible');
    this.root.querySelector<HTMLElement>('[data-copy-status]')!.textContent = '';
  }
}
