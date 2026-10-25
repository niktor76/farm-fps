/**
 * In-match pause overlay.
 *
 * It opens when pointer lock is lost, not when Escape is pressed. The browser
 * swallows that first Escape as its own unlock gesture and never delivers the
 * keydown to the page, so losing the lock IS the signal. Tabbing away routes
 * here too, so the game never runs on unseen.
 *
 * Resume is a button rather than another Escape, because the Pointer Lock spec
 * requires a re-lock straight after the unlock gesture to fail even when a
 * transient activation is available. A click is a fresh gesture and succeeds.
 *
 * The exits sit behind a gap: nobody should quit a match while reaching for
 * Resume.
 */
export class Pause {
  /**
   * @param {HTMLElement} root
   * @param {{ onResume: () => void, onRestart: () => void, onMainMenu: () => void }} handlers
   */
  constructor(root, handlers) {
    this.handlers = handlers;

    this.container = document.createElement('div');
    this.container.className = 'pause is-hidden';

    const panel = document.createElement('div');
    panel.className = 'pause-panel';

    const title = document.createElement('div');
    title.className = 'pause-title';
    title.textContent = 'Paused';

    const hint = document.createElement('div');
    hint.className = 'pause-hint';
    hint.textContent = 'The match is frozen, clock included.';

    panel.appendChild(title);
    panel.appendChild(hint);
    panel.appendChild(this.buildResumeRow());
    panel.appendChild(this.buildExitRow());

    this.container.appendChild(panel);
    root.appendChild(this.container);
  }

  buildResumeRow() {
    const row = document.createElement('div');
    row.className = 'pause-row';

    this.resumeButton = document.createElement('button');
    this.resumeButton.type = 'button';
    this.resumeButton.className = 'pause-button pause-button--primary';
    this.resumeButton.textContent = 'Resume';
    this.resumeButton.addEventListener('click', () => this.handlers.onResume());

    row.appendChild(this.resumeButton);
    return row;
  }

  buildExitRow() {
    const row = document.createElement('div');
    row.className = 'pause-row pause-row--exits';

    const restartButton = document.createElement('button');
    restartButton.type = 'button';
    restartButton.className = 'pause-button';
    restartButton.textContent = 'Restart match';
    restartButton.addEventListener('click', () => this.handlers.onRestart());

    const mainMenuButton = document.createElement('button');
    mainMenuButton.type = 'button';
    mainMenuButton.className = 'pause-button';
    mainMenuButton.textContent = 'Main menu';
    mainMenuButton.addEventListener('click', () => this.handlers.onMainMenu());

    row.appendChild(restartButton);
    row.appendChild(mainMenuButton);
    return row;
  }

  get visible() {
    return !this.container.classList.contains('is-hidden');
  }

  show() {
    this.container.classList.remove('is-hidden');
    this.resumeButton.focus();
  }

  hide() {
    this.container.classList.add('is-hidden');
  }
}
