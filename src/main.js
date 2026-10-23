import './style.css';
import { Menu } from './ui/menu.js';
import { Game } from './game.js';
import { AudioEngine } from './audio/audio.js';

const canvas = document.querySelector('#scene');
const uiRoot = document.querySelector('#ui-root');

const audio = new AudioEngine();
let game = null;

const menu = new Menu(uiRoot, {
  onPlay: (settings) => {
    audio.resume();
    audio.setVolume(settings.volume);
    menu.hide();
    startMatch(settings);
  }
});

function startMatch(settings) {
  if (game) game.dispose();

  game = new Game({
    canvas,
    uiRoot,
    settings,
    audio,
    onMatchEnd: () => {
      game.dispose();
      game = null;
      menu.show();
    }
  });

  game.start();

  // Development only: lets the frame and draw-call counters be read from outside.
  // Stripped from production builds, and superseded by the debug panel in PH-11.
  if (import.meta.env.DEV) window.farmFps = game;
}

menu.show();
