import { SIMULATION } from '../config/tunables.js';

/**
 * Fixed-timestep loop with an accumulator.
 *
 * Simulation advances in constant steps so the game plays identically at 60 and
 * 144 Hz. The accumulator is clamped so one slow frame cannot cascade into an
 * unbounded catch-up run.
 */
export class GameLoop {
  constructor({ onFixedStep, onRender }) {
    this.onFixedStep = onFixedStep;
    this.onRender = onRender;
    this.accumulator = 0;
    this.lastTime = 0;
    this.running = false;
    this.frameHandle = 0;
    this.elapsed = 0;
    this.tick = this.tick.bind(this);
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.lastTime = performance.now();
    this.accumulator = 0;
    this.frameHandle = requestAnimationFrame(this.tick);
  }

  stop() {
    this.running = false;
    cancelAnimationFrame(this.frameHandle);
  }

  tick(now) {
    if (!this.running) return;
    this.frameHandle = requestAnimationFrame(this.tick);

    const frameSeconds = Math.min(
      (now - this.lastTime) / 1000,
      SIMULATION.maximumAccumulatedSeconds
    );
    this.lastTime = now;
    this.accumulator += frameSeconds;

    const step = SIMULATION.fixedStepSeconds;
    while (this.accumulator >= step) {
      this.elapsed += step;
      this.onFixedStep(step, this.elapsed);
      this.accumulator -= step;
    }

    this.onRender(frameSeconds, this.accumulator / step);
  }
}
