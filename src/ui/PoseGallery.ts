import { SKIER_POSES, type SkierPoseName } from '../simulation/SkierPose';

export class PoseGallery {
  private readonly root: HTMLElement;
  private selected: SkierPoseName | null = null;
  private visible = false;

  constructor(
    host: HTMLElement,
    private readonly onPoseChange: (pose: SkierPoseName | null) => void,
    private readonly onMarkerChange: (visible: boolean) => void,
    markersVisible: boolean,
    initialVisible: boolean,
  ) {
    this.root = document.createElement('section');
    this.root.className = 'pose-gallery';
    this.root.setAttribute('aria-label', 'Development pose inspector');
    this.root.innerHTML = `<div class="pose-gallery__header">
      <div><span>DEV INSPECTOR</span><strong>Skier poses</strong></div>
      <button type="button" data-action="close" aria-label="Close pose inspector">×</button>
    </div>
    <div class="pose-gallery__grid">
      ${SKIER_POSES.map((pose) => `<button type="button" data-pose="${pose}">${pose.replace('-', ' ')}</button>`).join('')}
    </div>
    <label class="marker-toggle"><input type="checkbox" ${markersVisible ? 'checked' : ''}/> Camera scale markers</label>`;
    host.append(this.root);
    this.root.addEventListener('click', (event) => {
      const target = event.target as HTMLElement;
      if (target.dataset.action === 'close') this.setVisible(false);
      const pose = target.dataset.pose as SkierPoseName | undefined;
      if (pose) this.select(pose);
    });
    this.root.querySelector('input')?.addEventListener('change', (event) => {
      this.onMarkerChange((event.target as HTMLInputElement).checked);
    });
    addEventListener('keydown', this.onKeyDown);
    if (initialVisible) {
      this.setVisible(true);
      this.select('neutral');
    }
  }

  private setVisible(visible: boolean): void {
    this.visible = visible;
    this.root.classList.toggle('visible', visible);
    if (!visible) this.select(null);
  }

  private select(pose: SkierPoseName | null): void {
    this.selected = pose;
    this.onPoseChange(pose);
    for (const button of this.root.querySelectorAll<HTMLButtonElement>('[data-pose]')) {
      button.classList.toggle('selected', button.dataset.pose === pose);
    }
  }

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (event.code === 'KeyG') {
      event.preventDefault();
      this.setVisible(!this.visible);
    }
    if (event.code === 'Escape' && this.visible) this.setVisible(false);
    if (!this.visible || !this.selected) return;
    const index = SKIER_POSES.indexOf(this.selected);
    if (event.code === 'BracketRight') {
      this.select(SKIER_POSES[(index + 1) % SKIER_POSES.length] ?? null);
    }
    if (event.code === 'BracketLeft') {
      this.select(SKIER_POSES[(index - 1 + SKIER_POSES.length) % SKIER_POSES.length] ?? null);
    }
  };
}
