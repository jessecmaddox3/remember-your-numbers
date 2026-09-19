// Pure game logic. No DOM or storage; the UI owns those boundaries.

export const PROVE_DELAY_MS = 20 * 60 * 60 * 1000; // cold pass must age before "prove it"
export const REVIEW_BASE_MS = 2 * 24 * 60 * 60 * 1000;
export const REVIEW_CAP_MS = 30 * 24 * 60 * 60 * 1000;

export function chunkDigits(digits, sizes) {
  const total = sizes.reduce((a, b) => a + b, 0);
  if (total !== digits.length) {
    throw new Error(`chunk sizes cover ${total} digits, got ${digits.length}`);
  }
  const chunks = [];
  let at = 0;
  for (const size of sizes) {
    chunks.push(digits.slice(at, at + size));
    at += size;
  }
  return chunks;
}

// The ladder for one number. Fill levels hide chunks from the END first
// (backward chaining: the child always finishes the number successfully).
export function levelsFor(sizes) {
  const n = sizes.length;
  const levels = [
    { id: 'learn', kind: 'learn' },
    { id: 'spot', kind: 'choice' },
  ];
  for (let k = 1; k <= n; k++) {
    const hiddenChunks = [];
    for (let i = n - k; i < n; i++) hiddenChunks.push(i);
    levels.push({ id: `fill-${k}`, kind: 'fill', hiddenChunks });
  }
  levels.push({ id: 'hint', kind: 'type', firstDigitShown: true });
  levels.push({ id: 'cold', kind: 'type', firstDigitShown: false });
  levels.push({ id: 'prove', kind: 'type', firstDigitShown: false });
  return levels;
}

function swapAdjacent(chunk, rng) {
  if (chunk.length < 2) return null;
  const i = Math.floor(rng() * (chunk.length - 1));
  const a = chunk.split('');
  [a[i], a[i + 1]] = [a[i + 1], a[i]];
  const out = a.join('');
  return out === chunk ? null : out;
}

function nudgeDigit(chunk, rng) {
  const i = Math.floor(rng() * chunk.length);
  const a = chunk.split('');
  const step = rng() < 0.5 ? 1 : 9; // +1 or -1 mod 10
  a[i] = String((Number(a[i]) + step) % 10);
  return a.join('');
}

// Three choices for a hidden chunk: the answer plus two plausible near misses
// (transposed neighbours, one digit off), shuffled.
export function makeChoices(chunks, hiddenIndex, rng) {
  const answer = chunks[hiddenIndex];
  const options = new Set([answer]);
  let guard = 0;
  while (options.size < 3 && guard++ < 100) {
    const candidate = guard % 2 === 1 ? swapAdjacent(answer, rng) : nudgeDigit(answer, rng);
    if (candidate && candidate.length === answer.length) options.add(candidate);
  }
  // A repetitive random source must not shrink the three-choice question.
  for (let offset = 1; options.size < 3 && offset <= 9; offset++) {
    const last = String((Number(answer.at(-1)) + offset) % 10);
    options.add(answer.slice(0, -1) + last);
  }
  const list = [...options];
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
}

export function newProgress() {
  return {
    unlocked: 0,
    coldPassAt: null,
    mastered: false,
    reviewIntervalMs: null,
    nextReviewAt: null,
  };
}

export function isLevelAvailable(progress, levels, levelIndex, now) {
  if (levelIndex > progress.unlocked) return false;
  if (levels[levelIndex].id === 'prove') {
    return progress.coldPassAt !== null && now - progress.coldPassAt >= PROVE_DELAY_MS;
  }
  return true;
}

export function completeLevel(progress, levels, levelIndex, now) {
  const next = { ...progress };
  const level = levels[levelIndex];
  if (level.id === 'cold' && next.coldPassAt === null) {
    next.coldPassAt = now;
  }
  if (level.id === 'prove') {
    next.reviewIntervalMs = next.mastered
      ? Math.min(next.reviewIntervalMs * 2, REVIEW_CAP_MS)
      : REVIEW_BASE_MS;
    next.mastered = true;
    next.nextReviewAt = now + next.reviewIntervalMs;
  }
  if (levelIndex === next.unlocked && next.unlocked < levels.length - 1) {
    next.unlocked += 1;
  }
  return next;
}

export function isReviewDue(progress, now) {
  return progress.mastered && now >= progress.nextReviewAt;
}

export function recordReviewMiss(progress, now) {
  return {
    ...progress,
    reviewIntervalMs: REVIEW_BASE_MS,
    nextReviewAt: now + REVIEW_BASE_MS,
  };
}
