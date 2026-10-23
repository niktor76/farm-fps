/**
 * Fixed-capacity object pool. Effects and audio voices allocate from here so
 * the frame loop never triggers a garbage collection pause.
 */
export class Pool {
  constructor(createItem, resetItem, capacity) {
    this.createItem = createItem;
    this.resetItem = resetItem;
    this.items = [];
    this.available = [];

    for (let i = 0; i < capacity; i += 1) {
      const item = createItem(i);
      this.items.push(item);
      this.available.push(item);
    }
  }

  /** Returns null when every item is in use; callers skip the effect rather than allocate. */
  acquire() {
    return this.available.pop() ?? null;
  }

  release(item) {
    this.resetItem(item);
    this.available.push(item);
  }

  get activeCount() {
    return this.items.length - this.available.length;
  }
}
