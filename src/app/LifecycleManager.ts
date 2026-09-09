export type LifecyclePauseReason = 'background' | 'focus-loss';

export interface LifecycleHooks {
  pause(reason: LifecyclePauseReason): void;
  suspend(): void;
  resume(): void;
  viewportChanged(): void;
}

export class LifecycleManager {
  private suspended = false;

  constructor(private readonly hooks: LifecycleHooks) {
    document.addEventListener('visibilitychange', this.onVisibilityChange);
    addEventListener('pagehide', this.onPageHide);
    addEventListener('pageshow', this.onPageShow);
    addEventListener('blur', this.onBlur);
    addEventListener('orientationchange', this.onViewportChange);
    window.visualViewport?.addEventListener('resize', this.onViewportChange);
    if (document.hidden) this.suspend();
  }

  dispose(): void {
    document.removeEventListener('visibilitychange', this.onVisibilityChange);
    removeEventListener('pagehide', this.onPageHide);
    removeEventListener('pageshow', this.onPageShow);
    removeEventListener('blur', this.onBlur);
    removeEventListener('orientationchange', this.onViewportChange);
    window.visualViewport?.removeEventListener('resize', this.onViewportChange);
  }

  private suspend(): void {
    if (this.suspended) return;
    this.suspended = true;
    this.hooks.pause('background');
    this.hooks.suspend();
  }

  private restore(): void {
    if (!this.suspended) return;
    this.suspended = false;
    this.hooks.resume();
    this.hooks.viewportChanged();
  }

  private readonly onVisibilityChange = (): void => {
    if (document.hidden) this.suspend();
    else this.restore();
  };

  private readonly onPageHide = (): void => this.suspend();
  private readonly onPageShow = (): void => this.restore();
  private readonly onBlur = (): void => this.hooks.pause('focus-loss');
  private readonly onViewportChange = (): void => this.hooks.viewportChanged();
}
