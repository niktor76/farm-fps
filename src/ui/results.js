import { buildScoreTable, determineOutcome } from './scoreboard.js';

/**
 * End of match screen: winner, final table, play again.
 *
 * Owned by PH-10-scoreboard.
 */
export class Results {
  /**
   * @param {HTMLElement} root
   * @param {{ onPlayAgain: () => void, onMainMenu: () => void }} handlers
   */
  constructor(root, handlers) {
    this.handlers = handlers;

    this.container = document.createElement('div');
    this.container.className = 'results is-hidden';

    this.panel = document.createElement('div');
    this.panel.className = 'results-panel';

    this.announcementElement = document.createElement('div');
    this.announcementElement.className = 'results-announcement';

    this.subtitleElement = document.createElement('div');
    this.subtitleElement.className = 'results-subtitle';

    this.tableSlot = document.createElement('div');
    this.tableSlot.className = 'results-table-slot';

    this.panel.appendChild(this.announcementElement);
    this.panel.appendChild(this.subtitleElement);
    this.panel.appendChild(this.tableSlot);
    this.panel.appendChild(this.buildButtonRow());

    this.container.appendChild(this.panel);
    root.appendChild(this.container);
  }

  buildButtonRow() {
    const row = document.createElement('div');
    row.className = 'results-button-row';

    this.playAgainButton = document.createElement('button');
    this.playAgainButton.type = 'button';
    this.playAgainButton.className = 'results-button results-button--primary';
    this.playAgainButton.textContent = 'Play again';
    this.playAgainButton.addEventListener('click', () => this.handlers.onPlayAgain());

    const mainMenuButton = document.createElement('button');
    mainMenuButton.type = 'button';
    mainMenuButton.className = 'results-button';
    mainMenuButton.textContent = 'Main menu';
    mainMenuButton.addEventListener('click', () => this.handlers.onMainMenu());

    row.appendChild(this.playAgainButton);
    row.appendChild(mainMenuButton);
    return row;
  }

  /** @param {import('../entities/fighter.js').Fighter[]} fighters */
  show(fighters, localFighterId) {
    const { isDraw, winners } = determineOutcome(fighters);

    if (isDraw) {
      const names = winners.map((fighter) => fighter.name).join(', ');
      this.announcementElement.classList.remove('is-victory');
      this.announcementElement.textContent = 'Draw';
      this.subtitleElement.textContent = `${names} tied at ${killCount(winners[0].kills)}`;
    } else {
      const winner = winners[0];
      const localPlayerWon = winner.id === localFighterId;
      this.announcementElement.classList.toggle('is-victory', localPlayerWon);
      this.announcementElement.textContent = localPlayerWon ? 'Victory!' : `${winner.name} wins`;
      this.subtitleElement.textContent = killCount(winner.kills);
    }

    this.tableSlot.replaceChildren(buildScoreTable(fighters, localFighterId));
    this.container.classList.remove('is-hidden');
    this.playAgainButton.focus();
  }

  hide() {
    this.container.classList.add('is-hidden');
  }
}

function killCount(kills) {
  return kills === 1 ? '1 kill' : `${kills} kills`;
}
