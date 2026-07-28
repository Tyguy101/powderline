import { Game } from './Game';
import { GAME_CONFIG } from './config';

function showCompatibility(root: HTMLElement, error?: unknown): void {
  const message = error instanceof Error ? error.message : 'WebGPU is not available in this browser.';
  root.innerHTML = `<main class="compatibility">
    <div class="compat-card">
      <span class="eyebrow">GPU CHECK</span>
      <h1>A newer trail is needed.</h1>
      <p>Powderline currently requires WebGPU. Try current Chrome, Edge, or another browser with WebGPU enabled.</p>
      <details><summary>Technical detail</summary><code>${message}</code></details>
    </div>
  </main>`;
}

export async function bootstrap(): Promise<void> {
  const root = document.querySelector<HTMLElement>('#app');
  if (!root) throw new Error('Application root is missing.');
  if (!('gpu' in navigator)) {
    showCompatibility(root);
    return;
  }
  try {
    const game = new Game(root, GAME_CONFIG);
    await game.start();
  } catch (error) {
    console.error('WebGPU initialization failed', error);
    showCompatibility(root, error);
  }
}
