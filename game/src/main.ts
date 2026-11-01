import { Game } from './game';

declare const __BUILD_ID__: string;

const container = document.getElementById('app')!;

// Build stamp — visible in the corner so playtests can prove which build is live.
try {
  const el = document.getElementById('build');
  if (el && typeof __BUILD_ID__ !== 'undefined') el.textContent = `build ${__BUILD_ID__}`;
} catch {
  /* stamp is best-effort */
}

// Boot with error surfacing — the old game's failure mode was silent
// init death. If anything throws here, the player sees it.
try {
  new Game(container);
} catch (err) {
  const el = document.getElementById('center-msg')!;
  el.textContent = `The deep stirs wrong: ${err instanceof Error ? err.message : String(err)}`;
  el.style.opacity = '1';
  console.error(err);
}
