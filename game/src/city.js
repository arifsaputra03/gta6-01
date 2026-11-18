// Solmar: a sun-soaked coastal city on a road grid. Generation is seeded, so
// the same seed always builds the same city. Districts: Downtown (centre,
// tall glass), Old Town (north-west, low terracotta), Marina (south-west,
// beach and palms), Docks (east, warehouses), Suburbs (north-east, houses).
// Landmarks the game needs: safehouse, spray shop, clinic, gun shop, bank,
// casino, docks drop-off, garage, marina lot. Buildings are axis-aligned
// rectangles; collision is circle-vs-rectangle.

import { ROAD_W, ROAD_X, ROAD_Y, SIDEWALK, WORLD } from './config.js';
import { createRandom } from './random.js';

export const DISTRICTS = {
  downtown: { x0: 1100, y0: 800, x1: 2300, y1: 1700, name: 'Downtown' },
  oldtown: { x0: 0, y0: 0, x1: 1100, y1: 800, name: 'Old Town' },
  marina: { x0: 0, y0: 1700, x1: 1100, y1: 2600, name: 'Marina' },
  docks: { x0: 2900, y0: 0, x1: 3600, y1: 2600, name: 'Docks' },
  suburbs: { x0: 2300, y0: 0, x1: 3600, y1: 800, name: 'Suburbs' },
  midtown: { x0: 1100, y0: 1700, x1: 2900, y1: 2600, name: 'Midtown' },
};

export function districtAt(x, y) {
  for (const key of Object.keys(DISTRICTS)) {
    const d = DISTRICTS[key];
    if (x >= d.x0 && x < d.x1 && y >= d.y0 && y < d.y1) return key;
  }
  return 'midtown';
}

/** The value in `list` nearest `value`. */
function nearestInList(list, value) {
  let best = list[0];
  let bestD = Math.abs(value - best);
  for (const at of list) {
    const d = Math.abs(value - at);
    if (d < bestD) {
      bestD = d;
      best = at;
    }
  }
  return best;
}

/** Is the point on a road (including the sidewalk strip)? */
export function onRoad(x, y) {
  const half = ROAD_W / 2 + SIDEWALK;
  for (const rx of ROAD_X) if (Math.abs(x - rx) <= half) return true;
  for (const ry of ROAD_Y) if (Math.abs(y - ry) <= half) return true;
  return false;
}

/** Is the point on the road surface itself (not the sidewalk)? */
export function onRoadSurface(x, y) {
  const half = ROAD_W / 2;
  for (const rx of ROAD_X) if (Math.abs(x - rx) <= half) return true;
  for (const ry of ROAD_Y) if (Math.abs(y - ry) <= half) return true;
  return false;
}

/** Nearest point on the road network to (x, y), snapped to a road centre. */
export function nearestRoadPoint(x, y) {
  const rx = nearestInList(ROAD_X, x);
  const ry = nearestInList(ROAD_Y, y);
  const dx = Math.abs(x - rx);
  const dy = Math.abs(y - ry);
  return dx <= dy ? { x: rx, y, vertical: true } : { x, y: ry, vertical: false };
}

/** The road (vertical x or horizontal y) a point is closest to, and the axis. */
export function nearestRoad(x, y) {
  const bestX = nearestInList(ROAD_X, x);
  const bestY = nearestInList(ROAD_Y, y);
  const dx = Math.abs(x - bestX);
  const dy = Math.abs(y - bestY);
  return dx <= dy ? { axis: 'v', at: bestX, dist: dx } : { axis: 'h', at: bestY, dist: dy };
}

/** Fill one block (the cell between two neighbouring roads) with buildings,
 *  trees and parking spots — or make it a park instead. */
function buildBlock(ix, iy, rng, out) {
  const left = ROAD_X[ix] + ROAD_W / 2 + SIDEWALK + 8;
  const right = ROAD_X[ix + 1] - ROAD_W / 2 - SIDEWALK - 8;
  const top = ROAD_Y[iy] + ROAD_W / 2 + SIDEWALK + 8;
  const bottom = ROAD_Y[iy + 1] - ROAD_W / 2 - SIDEWALK - 8;
  const cx = (left + right) / 2;
  const cy = (top + bottom) / 2;
  const district = districtAt(cx, cy);
  // The south strip is the beach: no buildings below the last road.
  if (cy > 2380) return;
  if (rng.chance(0.14)) {
    out.parks.push({ x: left, y: top, w: right - left, h: bottom - top });
    const treeCount = rng.int(3, 7);
    for (let t = 0; t < treeCount; t += 1) {
      out.trees.push({ x: rng.range(left + 14, right - 14), y: rng.range(top + 14, bottom - 14), r: rng.range(9, 15) });
    }
    return;
  }
  // 1-4 buildings per block, sized to the district.
  const count = district === 'downtown' ? rng.int(1, 2) : rng.int(2, 4);
  const cols = count <= 2 ? count : 2;
  const rows = Math.ceil(count / cols);
  const cellW = (right - left - 12 * (cols - 1)) / cols;
  const cellH = (bottom - top - 12 * (rows - 1)) / rows;
  let made = 0;
  for (let r = 0; r < rows && made < count; r += 1) {
    for (let c = 0; c < cols && made < count; c += 1) {
      const w = cellW * rng.range(0.72, 0.98);
      const h = cellH * rng.range(0.72, 0.98);
      const bx = left + c * (cellW + 12) + (cellW - w) / 2;
      const by = top + r * (cellH + 12) + (cellH - h) / 2;
      const tall = district === 'downtown' ? rng.range(0.55, 1) : district === 'suburbs' ? rng.range(0.1, 0.3) : rng.range(0.25, 0.6);
      out.buildings.push({
        x: bx, y: by, w, h,
        district,
        tall,
        hue: rng.pick([0, 1, 2, 3]),
        roof: rng.pick([0, 1, 2]),
        windows: rng.int(2, 5),
      });
      made += 1;
    }
  }
  // A tree or two on the block corners.
  if (rng.chance(0.6)) out.trees.push({ x: left + 10, y: top + 10, r: rng.range(8, 12) });
  if (rng.chance(0.4)) out.trees.push({ x: right - 10, y: bottom - 10, r: rng.range(8, 12) });
  // Parking spots along the block's south edge, on the road.
  if (rng.chance(0.55)) {
    const spots = rng.int(2, 4);
    for (let s = 0; s < spots; s += 1) {
      out.parkingSpots.push({ x: left + 30 + s * 74, y: bottom + 26, angle: 0 });
    }
  }
}

export function createCity(seed) {
  const rng = createRandom(seed);
  const out = { buildings: [], trees: [], lamps: [], parks: [], parkingSpots: [] };

  // Blocks are the cells between neighbouring roads.
  for (let ix = 0; ix < ROAD_X.length - 1; ix += 1) {
    for (let iy = 0; iy < ROAD_Y.length - 1; iy += 1) {
      buildBlock(ix, iy, rng, out);
    }
  }

  // Street lamps at intersections.
  for (const rx of ROAD_X) {
    for (const ry of ROAD_Y) {
      out.lamps.push({ x: rx + ROAD_W / 2 + 6, y: ry - ROAD_W / 2 - 6 });
    }
  }

  // Landmarks (fixed positions, chosen on open ground near roads).
  const landmarks = {
    safehouse: { x: 500, y: 500, label: 'Safehouse', color: '#7ee787' },
    sprayShop: { x: 2600, y: 1400, label: 'Spray Shop', color: '#f2c94c' },
    clinic: { x: 800, y: 2000, label: 'Clinic', color: '#ff8fa3' },
    gunShop: { x: 2000, y: 2000, label: 'Gun Shop', color: '#c9a2ff' },
    bank: { x: 1700, y: 1100, label: 'Solmar Bank', color: '#ffd97a' },
    casino: { x: 2900, y: 500, label: 'Casino del Sol', color: '#ff9f43' },
    docksDrop: { x: 3200, y: 1700, label: 'Docks', color: '#7fd4ff' },
    garage: { x: 1100, y: 800, label: 'Garage', color: '#9fb7ff' },
    marinaLot: { x: 500, y: 2000, label: 'Marina Lot', color: '#ff9f43' },
  };

  const { buildings, trees, lamps, parks, parkingSpots } = out;
  const city = {
    seed,
    buildings,
    trees,
    lamps,
    parks,
    parkingSpots,
    landmarks,
    beachY: 2450,
    /** Circle (x, y, r) against every building; returns the building or null. */
    buildingAt(x, y, r) {
      for (const b of buildings) {
        const cx = Math.max(b.x, Math.min(x, b.x + b.w));
        const cy = Math.max(b.y, Math.min(y, b.y + b.h));
        const dx = x - cx;
        const dy = y - cy;
        if (dx * dx + dy * dy < r * r) return b;
      }
      return null;
    },
    /** Push a circle out of buildings; returns true when it collided. */
    resolveCircle(pos, r) {
      let hit = false;
      for (const b of buildings) {
        const cx = Math.max(b.x, Math.min(pos.x, b.x + b.w));
        const cy = Math.max(b.y, Math.min(pos.y, b.y + b.h));
        let dx = pos.x - cx;
        let dy = pos.y - cy;
        let d2 = dx * dx + dy * dy;
        if (d2 >= r * r) continue;
        hit = true;
        if (d2 < 0.0001) {
          // Centre inside the building: push out along the smallest overlap.
          const left = pos.x - b.x;
          const right = b.x + b.w - pos.x;
          const top = pos.y - b.y;
          const bottom = b.y + b.h - pos.y;
          const m = Math.min(left, right, top, bottom);
          if (m === left) pos.x = b.x - r;
          else if (m === right) pos.x = b.x + b.w + r;
          else if (m === top) pos.y = b.y - r;
          else pos.y = b.y + b.h + r;
        } else {
          const d = Math.sqrt(d2);
          const push = (r - d) / d;
          pos.x += dx * push;
          pos.y += dy * push;
        }
      }
      return hit;
    },
    /** Clamp a point inside the world bounds (with the sea at the south). */
    clamp(pos, margin) {
      pos.x = Math.max(margin, Math.min(WORLD.width - margin, pos.x));
      pos.y = Math.max(margin, Math.min(WORLD.height - margin, pos.y));
    },
    /**
     * The parking spot nearest (x, y) — a real lot position for a mission
     * car, off the driving lane, never inside a building. Null when the
     * city has no spots (it always has some for a real seed).
     */
    nearestParkingSpot(x, y) {
      let best = null;
      let bestD = Infinity;
      for (const spot of parkingSpots) {
        if (this.buildingAt(spot.x, spot.y, 30)) continue;
        // Off the driving lane: clear of every road centre line by more
        // than a car body. Spots sit 34 px off their own road's centre (at
        // the curb), but a spot past the end of a block can jut into the
        // cross road's lane — those are not lot spots.
        let clear = true;
        for (const rx of ROAD_X) {
          if (Math.abs(spot.x - rx) < 55) { clear = false; break; }
        }
        if (!clear) continue;
        for (const ry of ROAD_Y) {
          if (Math.abs(spot.y - ry) < 30) { clear = false; break; }
        }
        if (!clear) continue;
        const d = Math.hypot(spot.x - x, spot.y - y);
        if (d < bestD) {
          bestD = d;
          best = spot;
        }
      }
      return best;
    },
  };
  return city;
}
