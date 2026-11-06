/**
 * Anggaran permintaan jendela geser (D-006): Jupiter tanpa key mengizinkan 20 permintaan per 60 detik
 * (perilaku langsung 2026-11-04). Anggaran dihitung per klien dan disisakan sedikit untuk swap itu sendiri.
 */
export class SlidingWindowLimiter {
  private stamps: number[] = [];
  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
    private readonly now: () => number = Date.now,
  ) {}

  private prune(): void {
    const cutoff = this.now() - this.windowMs;
    while (this.stamps.length && (this.stamps[0] ?? 0) <= cutoff) this.stamps.shift();
  }

  /** Mengambil satu slot. false bila anggaran habis. */
  tryAcquire(): boolean {
    this.prune();
    if (this.stamps.length >= this.limit) return false;
    this.stamps.push(this.now());
    return true;
  }

  remaining(): number {
    this.prune();
    return Math.max(0, this.limit - this.stamps.length);
  }

  /** Milidetik sampai slot berikutnya tersedia. */
  retryAfterMs(): number {
    this.prune();
    if (this.stamps.length < this.limit) return 0;
    const oldest = this.stamps[0] ?? this.now();
    return Math.max(0, oldest + this.windowMs - this.now());
  }
}

/** Cache TTL kecil dengan penggabungan permintaan sama (request coalescing). */
export class CoalescingCache<V> {
  private store = new Map<string, { at: number; value: V }>();
  private inflight = new Map<string, Promise<V>>();
  constructor(
    private readonly ttlMs: number,
    private readonly now: () => number = Date.now,
  ) {}

  peek(key: string): V | undefined {
    const hit = this.store.get(key);
    return hit && this.now() - hit.at < this.ttlMs ? hit.value : undefined;
  }

  /** Nilai terakhir meskipun sudah kedaluwarsa, untuk menampilkan data lama saat penyegaran. */
  stale(key: string): V | undefined {
    return this.store.get(key)?.value;
  }

  async get(key: string, load: () => Promise<V>): Promise<V> {
    const fresh = this.peek(key);
    if (fresh !== undefined) return fresh;
    const pending = this.inflight.get(key);
    if (pending) return pending;
    const p = load()
      .then((value) => {
        this.store.set(key, { at: this.now(), value });
        return value;
      })
      .finally(() => this.inflight.delete(key));
    this.inflight.set(key, p);
    return p;
  }
}
