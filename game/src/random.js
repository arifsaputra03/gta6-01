// Seeded randomness (mulberry32): one seed rebuilds the same city, the same
// traffic and the same gunfights, which is what makes the test suite and the
// screenshot scenes repeatable. Nothing in the game rolls dice except through
// a generator built here — enemy fire included, so a fight can be replayed.

export function createRandom(seed) {
  let state = seed | 0;
  /** The next float in [0, 1). */
  function next() {
    state = (state + 0x6d2b79f5) | 0;
    let mix = Math.imul(state ^ (state >>> 15), 1 | state);
    mix = (mix + Math.imul(mix ^ (mix >>> 7), 61 | mix)) ^ mix;
    return ((mix ^ (mix >>> 14)) >>> 0) / 4294967296;
  }
  /** A float in [min, max). */
  function range(min, max) {
    return min + next() * (max - min);
  }
  /** An integer in [min, max], both ends included. */
  function int(min, max) {
    return min + Math.floor(next() * (max - min + 1));
  }
  /** One element of an array, picked uniformly. */
  function pick(array) {
    return array[Math.floor(next() * array.length)];
  }
  /** True with probability p. */
  function chance(p) {
    return next() < p;
  }
  return { next, range, int, pick, chance };
}
