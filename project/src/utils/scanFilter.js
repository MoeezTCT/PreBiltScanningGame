// Decides when a barcode read becomes a scan. Pure logic: no camera, no DOM, no clock of its
// own, so it can be tested exhaustively.
//
// A camera read is only a hint. Pointed at the same label, a decoder returns the right value
// most of the time and now and then something else (a different number each time). Counting
// every read as a new box is what let one label be "scanned" again and again. Three rules:
//
//   1. Confirm.  A value counts only after it has been read `minReads` times within
//                `windowMs`, and at least `dominance` times as often as anything else read
//                in that window. A stray misread is different every time, so it never
//                gets there.
//   2. Once.     A value that already counted never counts again in this game, however
//                long the camera stays on it. (Reading it again only produces a "duplicate"
//                notice, at most one per `noticeMs`.)
//   3. Pace.     After a scan counts, reads are ignored for `cooldownMs`.
//
// Values are never compared for similarity: box labels are often sequential
// ("TCT-abc-0001", "TCT-abc-0002") and differ by a single character on purpose.

const NONE = Object.freeze({ type: 'none' });

export class ScanFilter {
  constructor({ minReads = 3, windowMs = 2000, dominance = 2, cooldownMs = 700, noticeMs = 2000 } = {}) {
    this.minReads = minReads;
    this.windowMs = windowMs;
    this.dominance = dominance;
    this.cooldownMs = cooldownMs;
    this.noticeMs = noticeMs;
    this.reset();
  }

  // A new game starts with nothing scanned.
  reset() {
    this.accepted = new Set();
    this.reads = [];
    this.quietUntil = -Infinity;
    this.lastNoticeAt = -Infinity;
  }

  get count() {
    return this.accepted.size;
  }

  has(code) {
    return this.accepted.has(code);
  }

  // Feed one decoded value. `at` is a timestamp in milliseconds (any steady clock).
  // Returns { type: 'accepted' | 'duplicate', code } or { type: 'none' }.
  read(value, at = Date.now()) {
    const code = typeof value === 'string' ? value.trim() : '';
    if (!code || at < this.quietUntil) return NONE;

    this.reads.push({ code, at });
    const oldest = at - this.windowMs;
    while (this.reads.length > 0 && this.reads[0].at < oldest) this.reads.shift();

    // Most frequent value in the window, and how often the runner-up was seen.
    const tally = new Map();
    for (const read of this.reads) tally.set(read.code, (tally.get(read.code) || 0) + 1);
    let top = null;
    let topCount = 0;
    let runnerUp = 0;
    for (const [candidate, seen] of tally) {
      if (seen > topCount) {
        runnerUp = topCount;
        top = candidate;
        topCount = seen;
      } else if (seen > runnerUp) {
        runnerUp = seen;
      }
    }
    if (topCount < this.minReads || topCount < this.dominance * runnerUp) return NONE;

    if (this.accepted.has(top)) {
      // Still looking at a box that already counted. Forget these reads so the notice is not
      // raised again for every frame.
      this.reads = this.reads.filter((read) => read.code !== top);
      if (at - this.lastNoticeAt < this.noticeMs) return NONE;
      this.lastNoticeAt = at;
      return { type: 'duplicate', code: top };
    }

    this.accepted.add(top);
    this.reads = [];
    this.quietUntil = at + this.cooldownMs;
    return { type: 'accepted', code: top };
  }
}
