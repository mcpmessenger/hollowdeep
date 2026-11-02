// Touch controls for mobile — a D-pad + action buttons that feed the same
// discrete handleKey() path as the keyboard. Only built on touch devices,
// only shown after the title is dismissed. Tap = one step/turn/action,
// exactly like a keypress (no auto-repeat — parity with keyboard).

export function isTouchDevice(): boolean {
  return 'ontouchstart' in window || navigator.maxTouchPoints > 0;
}

interface BtnDef {
  label: string;
  key: string; // handleKey() key
  big?: boolean;
}

const CSS = `
#touch { position: fixed; inset: 0; z-index: 15; pointer-events: none;
  touch-action: none; -webkit-user-select: none; user-select: none; }
#touch .cluster { position: absolute; pointer-events: none; }
#touch button { pointer-events: auto; touch-action: none;
  -webkit-tap-highlight-color: transparent;
  width: 64px; height: 64px; border-radius: 50%;
  border: 1px solid #6b5320; background: rgba(20, 12, 6, 0.55);
  color: #d8c690; font-size: 24px; line-height: 1;
  text-shadow: 0 0 8px #000; }
#touch button.big { width: 84px; height: 84px; font-size: 32px;
  border-color: #a31212; color: #f0d0a0; }
#touch button:active { background: rgba(120, 70, 20, 0.7); }
/* D-pad: 3x3 grid, arrows at N/W/S/E */
#touch .dpad { left: 12px; bottom: 12px; display: grid;
  grid-template-columns: repeat(3, 64px); grid-template-rows: repeat(3, 64px);
  gap: 6px; }
#touch .dpad [data-pos="n"] { grid-column: 2; grid-row: 1; }
#touch .dpad [data-pos="w"] { grid-column: 1; grid-row: 2; }
#touch .dpad [data-pos="s"] { grid-column: 2; grid-row: 2; }
#touch .dpad [data-pos="e"] { grid-column: 3; grid-row: 2; }
/* Actions: attack big, search + turns around it */
#touch .actions { right: 12px; bottom: 12px; display: grid;
  grid-template-columns: repeat(3, 64px); grid-template-rows: repeat(2, 64px);
  gap: 6px; align-items: center; }
#touch .actions [data-act="atk"] { grid-column: 2; grid-row: 1 / 3; }
#touch .actions [data-act="tl"] { grid-column: 1; grid-row: 1; }
#touch .actions [data-act="tr"] { grid-column: 3; grid-row: 1; }
#touch .actions [data-act="srch"] { grid-column: 1; grid-row: 2; }
#touch .actions [data-act="jrnl"] { grid-column: 3; grid-row: 2; }
/* Get out of the way of the log + minimap on small screens */
body.touch #log { bottom: 216px; }
body.touch #minimap { bottom: 216px; }
body.touch #help { display: none; }
`;

const DPAD: Array<BtnDef & { pos: string }> = [
  { label: '▲', key: 'w', pos: 'n' },
  { label: '◀', key: 'a', pos: 'w' },
  { label: '▼', key: 's', pos: 's' },
  { label: '▶', key: 'd', pos: 'e' },
];

const ACTIONS: Array<BtnDef & { act: string }> = [
  { label: '⚔', key: ' ', act: 'atk', big: true },
  { label: '⟲', key: 'arrowleft', act: 'tl' },
  { label: '⟳', key: 'arrowright', act: 'tr' },
  { label: '⌕', key: 'f', act: 'srch' },
  { label: '📜', key: 'j', act: 'jrnl' },
];

export function initTouchControls(onPress: (key: string) => void): { show: () => void } {
  document.body.classList.add('touch');
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);

  const root = document.createElement('div');
  root.id = 'touch';
  root.style.display = 'none';

  const dpad = document.createElement('div');
  dpad.className = 'cluster dpad';
  for (const b of DPAD) {
    const el = document.createElement('button');
    el.textContent = b.label;
    el.dataset.pos = b.pos;
    el.setAttribute('aria-label', b.key);
    el.addEventListener('touchstart', (e) => {
      e.preventDefault();
      onPress(b.key);
    }, { passive: false });
    // Desktop testing fallback.
    el.addEventListener('mousedown', (e) => {
      e.preventDefault();
      onPress(b.key);
    });
    dpad.appendChild(el);
  }

  const actions = document.createElement('div');
  actions.className = 'cluster actions';
  for (const b of ACTIONS) {
    const el = document.createElement('button');
    el.textContent = b.label;
    el.dataset.act = b.act;
    if (b.big) el.classList.add('big');
    el.setAttribute('aria-label', b.key === ' ' ? 'attack' : b.key);
    el.addEventListener('touchstart', (e) => {
      e.preventDefault();
      onPress(b.key);
    }, { passive: false });
    el.addEventListener('mousedown', (e) => {
      e.preventDefault();
      onPress(b.key);
    });
    actions.appendChild(el);
  }

  // Long-press context menu is not a game action.
  root.addEventListener('contextmenu', (e) => e.preventDefault());

  root.appendChild(dpad);
  root.appendChild(actions);
  document.body.appendChild(root);

  return { show: () => { root.style.display = 'block'; } };
}
