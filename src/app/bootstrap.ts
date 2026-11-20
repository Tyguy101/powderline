import { Game } from './Game';
import { GAME_CONFIG } from './config';
import { initializeSentry, reportStartupFailure } from '../monitoring/Sentry';

export type StartupFailureKind = 'insecure' | 'unsupported' | 'initialization';

export function classifyStartupFailure(error?: unknown): StartupFailureKind {
  if (!isSecureContext) return 'insecure';
  if (!navigator.gpu) return 'unsupported';
  return error ? 'initialization' : 'unsupported';
}

function showCompatibility(root: HTMLElement, error?: unknown): void {
  const kind = classifyStartupFailure(error);
  const copy = {
    insecure: 'WebGPU needs a secure connection. Open the HTTPS Powderline address, or use the documented local HTTPS workflow.',
    unsupported: 'This browser does not currently expose WebGPU. Try a current Safari, Chrome, or Edge release on supported hardware.',
    initialization: 'This device supports WebGPU, but Powderline could not start the GPU renderer. Reload once, then record the device and browser in the QA matrix if it continues.',
  }[kind];
  root.replaceChildren();
  const main = document.createElement('main');
  main.className = 'compatibility';
  const card = document.createElement('div');
  card.className = 'compat-card';
  card.innerHTML = '<span class="eyebrow">GPU CHECK</span><h1>Powderline could not start.</h1>';
  const explanation = document.createElement('p');
  explanation.textContent = copy;
  const retry = document.createElement('button');
  retry.type = 'button';
  retry.textContent = 'Try again';
  retry.addEventListener('click', () => location.reload());
  const details = document.createElement('details');
  details.innerHTML = '<summary>Technical detail</summary>';
  const technical = document.createElement('code');
  technical.textContent = error instanceof Error ? error.message : `Startup check: ${kind}`;
  details.append(technical);
  card.append(explanation, retry, details);
  main.append(card);
  root.append(main);
  document.body.classList.add('ready');
}

export async function bootstrap(): Promise<void> {
  const root = document.querySelector<HTMLElement>('#app');
  if (!root) throw new Error('Application root is missing.');
  root.innerHTML = '<main class="loading" role="status">Preparing fresh tracks…</main>';
  document.body.classList.add('ready');
  if (GAME_CONFIG.replayError) {
    const card = document.createElement('main');
    card.className = 'compatibility';
    const message = document.createElement('div');
    message.className = 'compat-card';
    const detail = document.createElement('p');
    detail.textContent = GAME_CONFIG.replayError;
    const home = document.createElement('a');
    home.href = location.pathname;
    home.textContent = 'Start a new descent';
    message.append(detail, home);
    card.append(message);
    root.replaceChildren(card);
    return;
  }
  await initializeSentry();
  if (!navigator.gpu) {
    reportStartupFailure(new Error('WebGPU is unavailable.'), 'webgpu-availability');
    showCompatibility(root);
    return;
  }
  try {
    const game = new Game(root, GAME_CONFIG);
    await game.start();
  } catch (error) {
    console.error('WebGPU initialization failed', error);
    reportStartupFailure(error, 'webgpu-initialization');
    showCompatibility(root, error);
  }
}
