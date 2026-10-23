/**
 * Rolling frame statistics. Reported at every milestone gate, since REQ-1 asks
 * for measured frame rates rather than an impression of smoothness.
 */
export class DebugStats {
  constructor(sampleCount = 120) {
    this.samples = new Float32Array(sampleCount);
    this.index = 0;
    this.filled = 0;
    this.drawCalls = 0;
    this.triangles = 0;
    this.programs = 0;
  }

  sampleFrame(frameSeconds, renderer) {
    this.samples[this.index] = frameSeconds * 1000;
    this.index = (this.index + 1) % this.samples.length;
    this.filled = Math.min(this.filled + 1, this.samples.length);

    this.drawCalls = renderer.info.render.calls;
    this.triangles = renderer.info.render.triangles;
    this.programs = renderer.info.programs?.length ?? 0;
  }

  get averageFrameMilliseconds() {
    if (this.filled === 0) return 0;
    let total = 0;
    for (let i = 0; i < this.filled; i += 1) total += this.samples[i];
    return total / this.filled;
  }

  get worstFrameMilliseconds() {
    let worst = 0;
    for (let i = 0; i < this.filled; i += 1) {
      if (this.samples[i] > worst) worst = this.samples[i];
    }
    return worst;
  }

  get framesPerSecond() {
    const average = this.averageFrameMilliseconds;
    return average > 0 ? 1000 / average : 0;
  }
}
