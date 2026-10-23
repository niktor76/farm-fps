/**
 * Seeded random number generator (mulberry32).
 * Seeding keeps a match reproducible when debugging bot behaviour.
 */
export class Random {
  constructor(seed = Date.now()) {
    this.state = seed >>> 0;
  }

  next() {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  range(minimum, maximum) {
    return minimum + this.next() * (maximum - minimum);
  }

  integer(minimum, maximumExclusive) {
    return Math.floor(this.range(minimum, maximumExclusive));
  }

  pick(items) {
    return items[this.integer(0, items.length)];
  }

  /** Normally distributed value, mean 0 standard deviation 1 (Box-Muller). */
  gaussian() {
    const u = 1 - this.next();
    const v = this.next();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  shuffled(items) {
    const copy = items.slice();
    for (let i = copy.length - 1; i > 0; i -= 1) {
      const j = this.integer(0, i + 1);
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  }
}

export const random = new Random();
