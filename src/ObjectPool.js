// Tiny object pool: notes and effects are recycled instead of garbage collected.
export class ObjectPool {
  constructor(factory) {
    this.factory = factory;
    this.free = [];
    this.created = 0;
  }

  acquire() {
    const o = this.free.pop();
    if (o) return o;
    this.created++;
    return this.factory();
  }

  release(o) {
    this.free.push(o);
  }
}
