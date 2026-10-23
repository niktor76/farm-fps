import './style.css';
import { Menu } from './ui/menu.js';
import { Results } from './ui/results.js';
import { Game } from './game.js';
import { AudioEngine } from './audio/audio.js';

const canvas = document.querySelector('#scene');
const uiRoot = document.querySelector('#ui-root');

const audio = new AudioEngine();
let game = null;
let lastSettings = null;

const menu = new Menu(uiRoot, {
  onPlay: (settings) => {
    menu.hide();
    startMatch(settings);
  }
});

const results = new Results(uiRoot, {
  onPlayAgain: () => {
    results.hide();
    startMatch(lastSettings);
  },
  onMainMenu: () => {
    results.hide();
    menu.show();
  }
});

function startMatch(settings) {
  if (game) game.dispose();

  lastSettings = settings;
  audio.resume();
  audio.setVolume(settings.volume);

  game = new Game({
    canvas,
    uiRoot,
    settings,
    audio,
    onMatchEnd: (fighters) => {
      const localFighterId = game.player.id;
      results.show(fighters, localFighterId);
    }
  });

  game.start();

  // Development only: lets the frame and draw-call counters be read from
  // outside. Stripped from production builds.
  if (import.meta.env.DEV) window.farmFps = game;
}

menu.show();
