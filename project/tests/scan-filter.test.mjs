import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ScanFilter } from '../src/utils/scanFilter.js';
import { visibleArea } from '../src/utils/visibleArea.js';

const LABEL = 'TCT-abc-0001';

// Feeds `reads` ([value, atMs] pairs, in time order) and returns every non-empty outcome.
function run(filter, reads) {
  const outcomes = [];
  for (const [value, at] of reads) {
    const outcome = filter.read(value, at);
    if (outcome.type !== 'none') outcomes.push({ ...outcome, at });
  }
  return outcomes;
}

// Small deterministic random numbers, so a "noisy camera" test is repeatable.
function seeded(seed) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

test('the exploit: values read from ONE label, each different, never count', () => {
  // The ten values the old scanner counted as ten boxes while the camera stayed on one label.
  const garbage = ["0249091187898", '09118966', "T'N%ac30303", '09292222', '12927111', '55514026', '51725006', '56111118', '51514976', '09111417'];
  const filter = new ScanFilter();
  // Seen at about 5 reads a second, one after another, even twice in a row.
  const reads = garbage.flatMap((value, i) => [[value, i * 2400], [value, i * 2400 + 300]]);
  assert.deepEqual(run(filter, reads), []);
  assert.equal(filter.count, 0);
});

test('one label held for 30 seconds in a noisy camera counts exactly once', () => {
  const random = seeded(42);
  const filter = new ScanFilter();
  const reads = [];
  for (let at = 0; at < 30_000; at += 60) {
    const roll = random();
    if (roll < 0.3) reads.push([LABEL, at]); // the real value, in about 3 of 10 looks
    else if (roll < 0.38) reads.push([String(Math.floor(random() * 1e8)).padStart(8, '0'), at]); // a made-up number
  }
  const accepted = run(filter, reads).filter((outcome) => outcome.type === 'accepted');
  assert.deepEqual(accepted.map((outcome) => outcome.code), [LABEL]);
  assert.equal(filter.count, 1);
});

test('a value needs minReads reads inside the window', () => {
  const filter = new ScanFilter({ minReads: 3, windowMs: 2000 });
  assert.deepEqual(run(filter, [[LABEL, 0], [LABEL, 100]]), []); // two reads: not yet
  assert.deepEqual(run(filter, [[LABEL, 200]]).map((o) => o.type), ['accepted']); // the third counts

  const spread = new ScanFilter({ minReads: 3, windowMs: 2000 });
  // Three reads, but never three within two seconds.
  assert.deepEqual(run(spread, [[LABEL, 0], [LABEL, 1500], [LABEL, 3000], [LABEL, 4500]]), []);
});

test('a value must clearly beat anything else read at the same moment', () => {
  const tie = new ScanFilter();
  // 3 reads of A against 2 of B: not clear enough, so nothing counts yet.
  assert.deepEqual(run(tie, [['A', 0], ['B', 50], ['A', 100], ['B', 150], ['A', 200]]), []);
  // A fourth read of A makes it clear (4 against 2).
  assert.deepEqual(run(tie, [['A', 250]]).map((o) => o.code), ['A']);
});

test('after a scan counts, reads are ignored while the cooldown runs', () => {
  const filter = new ScanFilter({ cooldownMs: 700 });
  const outcomes = run(filter, [
    ['A', 0], ['A', 50], ['A', 100], // A counts at 100
    ['B', 200], ['B', 300], ['B', 400], ['B', 500], ['B', 600], // all inside the cooldown (until 800)
    ['B', 900], ['B', 950], ['B', 1000] // fresh reads after it
  ]);
  assert.deepEqual(outcomes.map((o) => [o.code, o.at]), [['A', 100], ['B', 1000]]);
});

test('a label that already counted never counts again, however long the camera stays on it', () => {
  const filter = new ScanFilter({ noticeMs: 2000 });
  const reads = [];
  for (let at = 0; at < 20_000; at += 60) reads.push([LABEL, at]);
  const outcomes = run(filter, reads);
  assert.equal(outcomes.filter((o) => o.type === 'accepted').length, 1);
  // Only a gentle reminder now and then ("already scanned"), at most one per noticeMs.
  const notices = outcomes.filter((o) => o.type === 'duplicate');
  assert.ok(notices.length >= 1);
  for (let i = 1; i < notices.length; i += 1) assert.ok(notices[i].at - notices[i - 1].at >= 2000);
});

test('boxes with similar sequential labels all count (values are never compared for likeness)', () => {
  const filter = new ScanFilter();
  const reads = [];
  for (let box = 1; box <= 10; box += 1) {
    const label = `TCT-abc-${String(box).padStart(4, '0')}`;
    for (let i = 0; i < 5; i += 1) reads.push([label, box * 3000 + i * 80]);
  }
  const accepted = run(filter, reads).filter((o) => o.type === 'accepted').map((o) => o.code);
  assert.equal(accepted.length, 10);
  assert.equal(new Set(accepted).size, 10);
});

test('a different box counts after the first, with a stray misread in between', () => {
  const filter = new ScanFilter();
  const outcomes = run(filter, [
    [LABEL, 0], [LABEL, 80], [LABEL, 160], // box 1
    ['TCT-abc-0002', 1000], ['27741412', 1060], ['TCT-abc-0002', 1120], ['TCT-abc-0002', 1180], ['TCT-abc-0002', 1240] // box 2 with one wrong read
  ]);
  assert.deepEqual(outcomes.map((o) => o.code), [LABEL, 'TCT-abc-0002']);
});

test('reset() starts a new game with nothing scanned', () => {
  const filter = new ScanFilter();
  run(filter, [[LABEL, 0], [LABEL, 50], [LABEL, 100]]);
  assert.equal(filter.has(LABEL), true);
  filter.reset();
  assert.equal(filter.count, 0);
  assert.equal(filter.has(LABEL), false);
  assert.deepEqual(run(filter, [[LABEL, 5000], [LABEL, 5050], [LABEL, 5100]]).map((o) => o.type), ['accepted']);
});

test('blank, whitespace-only and non-string values are ignored; padding is trimmed', () => {
  const filter = new ScanFilter();
  for (const bad of ['', '   ', null, undefined, 42, {}]) assert.equal(filter.read(bad, 0).type, 'none');
  const outcomes = run(filter, [[` ${LABEL} `, 10], [LABEL, 20], [`${LABEL}\n`, 30]]);
  assert.deepEqual(outcomes.map((o) => o.code), [LABEL]);
});

test('visibleArea is the part of the picture the frame shows (object-fit: cover)', () => {
  // A 16:9 camera picture in a 4:3 frame: full height, the sides are cropped.
  const wide = visibleArea(1920, 1080, 400, 300);
  assert.equal(Math.round(wide.height), 1080);
  assert.equal(Math.round(wide.width), 1440);
  assert.equal(Math.round(wide.x), 240);
  assert.equal(Math.round(wide.y), 0);
  // A 4:3 picture in a 3:2 frame: full width, a little off the top and bottom.
  const crop = visibleArea(640, 480, 360, 240);
  assert.equal(Math.round(crop.width), 640);
  assert.equal(Math.round(crop.height), 427);
  assert.equal(Math.round(crop.y), 27);
  // A frame with the same shape as the picture shows all of it.
  assert.deepEqual(visibleArea(640, 480, 320, 240), { x: 0, y: 0, width: 640, height: 480 });
});
