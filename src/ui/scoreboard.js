/**
 * Hold-Tab scoreboard listing every fighter with kills, deaths and ratio.
 *
 * Owned by PH-10-scoreboard.
 */

/** Table sort order: most kills first, fewer deaths breaks a kill tie, name keeps the order stable. */
export function compareFighters(a, b) {
  if (b.kills !== a.kills) return b.kills - a.kills;
  if (a.deaths !== b.deaths) return a.deaths - b.deaths;
  return a.name.localeCompare(b.name);
}

export function sortFighters(fighters) {
  return [...fighters].sort(compareFighters);
}

/** Deaths of zero must not print Infinity; show the kill count instead, as shipped shooters do. */
export function killDeathRatio(fighter) {
  return fighter.deaths === 0 ? String(fighter.kills) : (fighter.kills / fighter.deaths).toFixed(2);
}

/**
 * The fighters tied for first place by kills, then by fewer deaths. A single
 * entry means a clear winner; more than one means a draw between them. Name
 * never breaks this tie, unlike the table order.
 */
export function determineOutcome(fighters) {
  if (fighters.length === 0) throw new Error('determineOutcome requires at least one fighter');

  const sorted = sortFighters(fighters);
  const best = sorted[0];
  const winners = sorted.filter(
    (fighter) => fighter.kills === best.kills && fighter.deaths === best.deaths
  );

  return { isDraw: winners.length > 1, winners };
}

function colorToCss(color) {
  return `#${color.toString(16).padStart(6, '0')}`;
}

function buildCell(className, text) {
  const cell = document.createElement('div');
  cell.className = className;
  cell.textContent = text;
  return cell;
}

/**
 * Builds the shared fighter table: a header row plus one row per fighter,
 * sorted by sortFighters. Used by both the scoreboard and the results screen
 * so the two never drift apart.
 */
export function buildScoreTable(fighters, localFighterId) {
  const table = document.createElement('div');
  table.className = 'score-table';

  const header = document.createElement('div');
  header.className = 'score-row score-row--header';
  header.appendChild(buildCell('score-cell-rank', '#'));
  header.appendChild(buildCell('score-cell-swatch', ''));
  header.appendChild(buildCell('score-cell-name', 'Name'));
  header.appendChild(buildCell('score-cell-kills', 'Kills'));
  header.appendChild(buildCell('score-cell-deaths', 'Deaths'));
  header.appendChild(buildCell('score-cell-ratio', 'K/D'));
  table.appendChild(header);

  const sorted = sortFighters(fighters);
  sorted.forEach((fighter, index) => {
    const row = document.createElement('div');
    row.className = 'score-row';
    row.classList.toggle('is-local-player', fighter.id === localFighterId);

    const swatchCell = document.createElement('div');
    swatchCell.className = 'score-cell-swatch';
    const swatch = document.createElement('span');
    swatch.className = 'score-swatch';
    swatch.style.backgroundColor = colorToCss(fighter.color);
    swatchCell.appendChild(swatch);

    row.appendChild(buildCell('score-cell-rank', String(index + 1)));
    row.appendChild(swatchCell);
    row.appendChild(buildCell('score-cell-name', fighter.name));
    row.appendChild(buildCell('score-cell-kills', String(fighter.kills)));
    row.appendChild(buildCell('score-cell-deaths', String(fighter.deaths)));
    row.appendChild(buildCell('score-cell-ratio', killDeathRatio(fighter)));

    table.appendChild(row);
  });

  return table;
}

export class Scoreboard {
  /** @param {HTMLElement} root */
  constructor(root) {
    this.container = document.createElement('div');
    this.container.className = 'scoreboard is-hidden';

    this.panel = document.createElement('div');
    this.panel.className = 'scoreboard-panel';

    const heading = document.createElement('div');
    heading.className = 'scoreboard-heading';
    heading.textContent = 'Scoreboard';
    this.panel.appendChild(heading);

    this.tableSlot = document.createElement('div');
    this.panel.appendChild(this.tableSlot);

    this.container.appendChild(this.panel);
    root.appendChild(this.container);
  }

  /** @param {import('../entities/fighter.js').Fighter[]} fighters */
  show(fighters, localFighterId) {
    this.tableSlot.replaceChildren(buildScoreTable(fighters, localFighterId));
    this.container.classList.remove('is-hidden');
  }

  hide() {
    this.container.classList.add('is-hidden');
  }
  dispose() {
    this.container.remove();
  }

}
