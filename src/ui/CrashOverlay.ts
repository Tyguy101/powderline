export class CrashOverlay {
  private readonly root: HTMLElement;
  private readonly distance: HTMLElement;
  private replay = '';

  constructor(
    host: HTMLElement,
    onRestart: () => void,
    onRetry?: () => void,
  ) {
    this.root = document.createElement('section');
    this.root.className = 'crash-overlay';
    this.root.setAttribute('aria-label', 'Run crashed');
    this.root.innerHTML = `<div class="crash-card">
      <span>WIPEOUT</span>
      <strong data-crash-title>Powder happens.</strong>
      <p>You made it <b data-distance>0 m</b> downhill.</p>
      <div>${onRetry ? '<button type="button" data-action="retry">Retry Section <kbd>R</kbd></button>' : ''}
      <button type="button" data-action="restart">${onRetry ? 'Restart at the Top' : 'Restart <kbd>R</kbd>'}</button>
      <button type="button" data-action="replay">Copy replay link</button></div>
      <small data-copy-status></small>
    </div>`;
    host.append(this.root);
    this.distance = this.root.querySelector('[data-distance]')!;
    this.root.addEventListener('click', async (event) => {
      const action = (event.target as HTMLElement).closest<HTMLElement>('[data-action]')?.dataset.action;
      if (action === 'restart') onRestart();
      if (action === 'retry') onRetry?.();
      if (action === 'replay') {
        const url = new URL(location.href);
        const quality = url.searchParams.get('quality');
        url.search = '';
        if (quality) url.searchParams.set('quality', quality);
        url.hash = new URLSearchParams({ replay: this.replay }).toString();
        const status = this.root.querySelector<HTMLElement>('[data-copy-status]')!;
        try {
          await navigator.clipboard.writeText(url.toString());
          status.textContent = 'Replay link copied.';
        } catch {
          status.textContent = 'Could not copy the replay link.';
        }
      }
    });
  }

  show(distance: number, replay: string, family = 'face-plant', avalanche = false,
    replayStatus = 'Replay recording limit reached.', impact?: 'ice' | 'boulder'): void {
    this.distance.textContent = `${Math.floor(distance)} m`;
    const title = this.root.querySelector<HTMLElement>('[data-crash-title]')!;
    title.textContent =
      impact === 'ice' ? 'Hit by falling ice.' : impact === 'boulder' ? 'Caught by a rolling boulder.' :
      avalanche ? 'Caught by the avalanche.' : family === 'obstacle-slam'
        ? 'Tree hugged back.'
        : family === 'rolling-tumble'
          ? 'Cartwheel season.'
          : family === 'side-spin'
            ? 'Style points, maybe.'
            : 'Powder happens.';
    this.replay = replay;
    this.root.querySelector<HTMLButtonElement>('[data-action="replay"]')!.disabled = !replay;
    if (!replay) this.root.querySelector<HTMLElement>('[data-copy-status]')!.textContent = replayStatus;
    this.root.classList.add('visible');
  }

  hide(): void {
    this.root.classList.remove('visible');
    this.root.querySelector<HTMLElement>('[data-copy-status]')!.textContent = '';
  }
}
