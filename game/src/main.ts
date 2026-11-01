import { Game } from './game';

const container = document.getElementById('app')!;

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
