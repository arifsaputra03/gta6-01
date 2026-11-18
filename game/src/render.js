// Rendering: the city, the cars and people in it, the particles, and the
// whole HUD (health, money, debt, wanted stars, mission tracker, minimap,
// dialogue and banners) plus the title, pause, busted, wasted and complete
// screens. Everything is drawn with canvas paths — no image assets.
//
// V2 change in this file: bullets are drawn as streaks along the direction
// they travel (bulletTracer, from combat.js), not as flat horizontal dashes
// — a diagonal shot finally looks diagonal. Player rounds are pale gold,
// enemy rounds are orange, so a shot's source reads at a glance. Foot cops
// also carry a small PD mark, so a cop reads as a cop before the punch lands.

import { bulletTracer } from './combat.js';
import { CAR, FONT, FONT_DISPLAY, PALETTE, ROAD_W, ROAD_X, ROAD_Y, SIDEWALK, VIEW, WORLD } from './config.js';

export const SCREEN_TITLE = 0;
export const SCREEN_PLAY = 1;
export const SCREEN_PAUSED = 2;
export const SCREEN_BUSTED = 3;
export const SCREEN_WASTED = 4;
export const SCREEN_COMPLETE = 5;

const BUILDING_COLORS = ['#d9c8a9', '#c9b18c', '#dcc7a0', '#b8c4d4'];
const ROOF_COLORS = ['#b65c3f', '#8a6d4b', '#a34d33', '#5d6b7d'];

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  canvas.width = VIEW.width;
  canvas.height = VIEW.height;

  /** Money as the HUD and panels show it: $1,250. */
  function fmtMoney(n) {
    return '$' + n.toLocaleString();
  }

  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  /** A building: shadow cast down-right, walls, a roof strip, lit windows. */
  function drawBuilding(b, camera) {
    const sx = b.x - camera.x;
    const sy = b.y - camera.y;
    if (sx + b.w < -40 || sy + b.h < -40 || sx > VIEW.width + 40 || sy > VIEW.height + 40) return;
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    ctx.fillRect(sx + b.tall * 14, sy + b.tall * 14, b.w, b.h);
    ctx.fillStyle = b.district === 'downtown' ? PALETTE.buildingDowntown : BUILDING_COLORS[b.hue];
    ctx.fillRect(sx, sy, b.w, b.h);
    ctx.fillStyle = ROOF_COLORS[b.roof];
    ctx.fillRect(sx + 3, sy + 3, b.w - 6, Math.max(6, b.h * 0.16));
    ctx.fillStyle = b.district === 'downtown' ? PALETTE.windowLit : PALETTE.window;
    const cols = Math.max(2, Math.floor(b.w / 26));
    const rows = Math.max(1, Math.floor((b.h * 0.7) / 24));
    for (let c = 0; c < cols; c += 1) {
      for (let r = 0; r < rows; r += 1) {
        if ((c * 7 + r * 3 + b.hue) % 4 === 0) continue;
        ctx.fillRect(sx + 8 + c * ((b.w - 16) / cols), sy + b.h * 0.22 + r * 24, 10, 13);
      }
    }
    ctx.strokeStyle = 'rgba(0,0,0,0.25)';
    ctx.lineWidth = 2;
    ctx.strokeRect(sx + 1, sy + 1, b.w - 2, b.h - 2);
  }

  /** The ground: grass, the sea along the south edge, parks, roads, lamps, trees. */
  function drawRoads(city, camera) {
    ctx.fillStyle = PALETTE.grass;
    ctx.fillRect(0, 0, VIEW.width, VIEW.height);
    const seaY = 2450 - camera.y;
    if (seaY < VIEW.height) {
      ctx.fillStyle = PALETTE.sand;
      ctx.fillRect(0, Math.max(0, seaY - 60), VIEW.width, 60);
      ctx.fillStyle = PALETTE.sea;
      ctx.fillRect(0, Math.max(0, seaY), VIEW.width, VIEW.height);
      ctx.fillStyle = PALETTE.seaDeep;
      for (let i = 0; i < 8; i += 1) {
        const wy = seaY + 30 + i * 22;
        if (wy > 0 && wy < VIEW.height) ctx.fillRect(((i * 317) % VIEW.width) - 60, wy, 90, 3);
      }
    }
    for (const park of city.parks) {
      const sx = park.x - camera.x;
      const sy = park.y - camera.y;
      if (sx + park.w < 0 || sy + park.h < 0 || sx > VIEW.width || sy > VIEW.height) continue;
      ctx.fillStyle = PALETTE.parkGrass;
      ctx.fillRect(sx, sy, park.w, park.h);
    }
    // Sidewalk, then asphalt, then the centre dashes.
    ctx.fillStyle = PALETTE.sidewalk;
    for (const rx of ROAD_X) {
      const sx = rx - ROAD_W / 2 - SIDEWALK - camera.x;
      if (sx + ROAD_W + SIDEWALK * 2 < 0 || sx > VIEW.width) continue;
      ctx.fillRect(sx, -camera.y, ROAD_W + SIDEWALK * 2, WORLD.height);
    }
    for (const ry of ROAD_Y) {
      const sy = ry - ROAD_W / 2 - SIDEWALK - camera.y;
      if (sy + ROAD_W + SIDEWALK * 2 < 0 || sy > VIEW.height) continue;
      ctx.fillRect(-camera.x, sy, WORLD.width, ROAD_W + SIDEWALK * 2);
    }
    ctx.fillStyle = PALETTE.road;
    for (const rx of ROAD_X) {
      const sx = rx - ROAD_W / 2 - camera.x;
      if (sx + ROAD_W < 0 || sx > VIEW.width) continue;
      ctx.fillRect(sx, -camera.y, ROAD_W, WORLD.height);
    }
    for (const ry of ROAD_Y) {
      const sy = ry - ROAD_W / 2 - camera.y;
      if (sy + ROAD_W < 0 || sy > VIEW.height) continue;
      ctx.fillRect(-camera.x, sy, WORLD.width, ROAD_W);
    }
    ctx.fillStyle = PALETTE.lane;
    for (const rx of ROAD_X) {
      const sx = rx - camera.x;
      if (sx < -4 || sx > VIEW.width + 4) continue;
      for (let y = -camera.y; y < VIEW.height; y += 56) {
        if (y > -20 && y < VIEW.height) ctx.fillRect(sx - 2, y, 4, 28);
      }
    }
    for (const ry of ROAD_Y) {
      const sy = ry - camera.y;
      if (sy < -4 || sy > VIEW.height + 4) continue;
      for (let x = -camera.x; x < VIEW.width; x += 56) {
        if (x > -20 && x < VIEW.width) ctx.fillRect(x, sy - 2, 28, 4);
      }
    }
    for (const lamp of city.lamps) {
      const sx = lamp.x - camera.x;
      const sy = lamp.y - camera.y;
      if (sx < 0 || sy < 0 || sx > VIEW.width || sy > VIEW.height) continue;
      ctx.fillStyle = '#3a3f4a';
      ctx.fillRect(sx - 2, sy - 2, 4, 4);
      ctx.fillStyle = '#ffd97a';
      ctx.beginPath();
      ctx.arc(sx, sy, 3, 0, Math.PI * 2);
      ctx.fill();
    }
    for (const tree of city.trees) {
      const sx = tree.x - camera.x;
      const sy = tree.y - camera.y;
      if (sx < -20 || sy < -20 || sx > VIEW.width + 20 || sy > VIEW.height + 20) continue;
      ctx.fillStyle = PALETTE.trunk;
      ctx.fillRect(sx - 2, sy - 2, 4, 6);
      ctx.fillStyle = PALETTE.tree;
      ctx.beginPath();
      ctx.arc(sx, sy - 4, tree.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = PALETTE.treeDark;
      ctx.beginPath();
      ctx.arc(sx - tree.r * 0.3, sy - 4 - tree.r * 0.3, tree.r * 0.55, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  /** One car, rotated to its heading: body, cabin, lights, labels, smoke. */
  function drawCar(car, camera, isPlayerCar) {
    const sx = car.x - camera.x;
    const sy = car.y - camera.y;
    if (sx < -90 || sy < -90 || sx > VIEW.width + 90 || sy > VIEW.height + 90) return;
    const halfLen = CAR.length / 2;
    const halfWid = CAR.width / 2;
    ctx.save();
    ctx.translate(sx, sy);
    ctx.rotate(car.angle);
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    ctx.fillRect(-halfLen + 3, -halfWid + 4, CAR.length, CAR.width);
    if (car.dead) {
      ctx.fillStyle = 'rgba(20,20,20,0.85)';
      roundRect(-halfLen, -halfWid, CAR.length, CAR.width, 8);
      ctx.fill();
      ctx.restore();
      return;
    }
    ctx.fillStyle = car.color;
    roundRect(-halfLen, -halfWid, CAR.length, CAR.width, 8);
    ctx.fill();
    ctx.fillStyle = 'rgba(20,28,40,0.85)';
    roundRect(-halfLen + 16, -halfWid + 5, CAR.length - 34, CAR.width - 10, 5);
    ctx.fill();
    ctx.fillStyle = '#9fc4e8';
    ctx.fillRect(halfLen - 18, -halfWid + 6, 5, CAR.width - 12);
    ctx.fillStyle = '#fff6c9';
    ctx.fillRect(halfLen - 3, -halfWid + 3, 3, 6);
    ctx.fillRect(halfLen - 3, halfWid - 9, 3, 6);
    ctx.fillStyle = '#ff3b30';
    ctx.fillRect(-halfLen, -halfWid + 3, 3, 6);
    ctx.fillRect(-halfLen, halfWid - 9, 3, 6);
    if (car.kind === 'police') {
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 11px ' + FONT;
      ctx.textAlign = 'center';
      ctx.fillText('POLICE', 0, 4);
    }
    if (car.kind === 'taxi') {
      ctx.fillStyle = '#111111';
      ctx.font = 'bold 10px ' + FONT;
      ctx.textAlign = 'center';
      ctx.fillText('TAXI', 0, 4);
    }
    if (isPlayerCar) {
      ctx.strokeStyle = PALETTE.marker;
      ctx.lineWidth = 3;
      ctx.strokeRect(-halfLen - 4, -halfWid - 4, CAR.length + 8, CAR.width + 8);
    }
    if (car.health < 45) {
      ctx.fillStyle = 'rgba(90,90,90,0.5)';
      ctx.beginPath();
      ctx.arc(-halfLen + 6, 0, 8 + Math.random() * 4, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  /** One pedestrian: shadow, shirt, head, gang and cop marks, scared "!". */
  function drawPed(ped, camera) {
    const sx = ped.x - camera.x;
    const sy = ped.y - camera.y;
    if (sx < -20 || sy < -20 || sx > VIEW.width + 20 || sy > VIEW.height + 20) return;
    if (ped.dead) {
      ctx.fillStyle = 'rgba(0,0,0,0.4)';
      ctx.beginPath();
      ctx.ellipse(sx, sy, 12, 6, ped.angle, 0, Math.PI * 2);
      ctx.fill();
      return;
    }
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath();
    ctx.ellipse(sx, sy + 10, 10, 4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = ped.shirt;
    ctx.beginPath();
    ctx.arc(sx, sy, 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = ped.color;
    ctx.beginPath();
    ctx.arc(sx, sy - 3, 6, 0, Math.PI * 2);
    ctx.fill();
    if (ped.gang) {
      ctx.fillStyle = '#8e44ad';
      ctx.font = 'bold 9px ' + FONT;
      ctx.textAlign = 'center';
      ctx.fillText('VIPER', sx, sy - 14);
    }
    if (ped.isCop) {
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 9px ' + FONT;
      ctx.textAlign = 'center';
      ctx.fillText('PD', sx, sy - 14);
    }
    if (ped.scared > 0) {
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 13px ' + FONT;
      ctx.textAlign = 'center';
      ctx.fillText('!', sx, sy - 16);
    }
  }

  /** Vic on foot: a pulsing ring so he never blends into the crowd. */
  function drawPlayer(player, camera) {
    const sx = player.x - camera.x;
    const sy = player.y - camera.y;
    ctx.save();
    ctx.translate(sx, sy);
    ctx.strokeStyle = 'rgba(255,207,63,0.85)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, 16 + Math.sin(performance.now() / 300) * 1.5, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath();
    ctx.ellipse(0, 11, 11, 5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.rotate(player.angle);
    if (player.moving) {
      const s = Math.sin(performance.now() / 90) * 5;
      ctx.fillStyle = '#2c3e55';
      ctx.fillRect(-4, -8 + s, 6, 12);
      ctx.fillRect(-4, -4 - s, 6, 12);
    }
    ctx.fillStyle = PALETTE.playerShirt;
    ctx.beginPath();
    ctx.arc(0, 0, 11, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#f2c9a0';
    ctx.beginPath();
    ctx.arc(6, 0, 6, 0, Math.PI * 2);
    ctx.fill();
    if (player.hasGun) {
      ctx.fillStyle = '#222';
      ctx.fillRect(8, -2, 12, 4);
    }
    if (player.punchTimer > 0) {
      ctx.strokeStyle = 'rgba(255,255,255,0.8)';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(0, 0, 30, -0.9, 0.9);
      ctx.stroke();
    }
    ctx.restore();
    ctx.save();
    ctx.translate(sx, sy);
    ctx.rotate(player.angle);
    ctx.fillStyle = PALETTE.marker;
    ctx.beginPath();
    ctx.moveTo(20, 0);
    ctx.lineTo(12, -5);
    ctx.lineTo(12, 5);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  /** The mission marker: a pin on screen, an edge arrow with distance off it. */
  function drawMarker(world, camera) {
    const marker = world.missionMarker;
    if (!marker) return;
    const px = world.player.inCar ? world.player.inCar.x : world.player.x;
    const py = world.player.inCar ? world.player.inCar.y : world.player.y;
    const sx = marker.x - camera.x;
    const sy = marker.y - camera.y;
    const onScreen = sx > 40 && sx < VIEW.width - 40 && sy > 40 && sy < VIEW.height - 40;
    const pulse = 1 + Math.sin(performance.now() / 200) * 0.15;
    if (onScreen) {
      ctx.save();
      ctx.translate(sx, sy);
      ctx.scale(pulse, pulse);
      ctx.fillStyle = marker.color;
      ctx.beginPath();
      ctx.moveTo(0, 10);
      ctx.lineTo(-12, -14);
      ctx.lineTo(12, -14);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.restore();
    } else {
      const cx = VIEW.width / 2;
      const cy = VIEW.height / 2;
      const ang = Math.atan2(sy - cy, sx - cx);
      const ex = cx + Math.cos(ang) * (VIEW.width / 2 - 50);
      const ey = cy + Math.sin(ang) * (VIEW.height / 2 - 50);
      ctx.save();
      ctx.translate(ex, ey);
      ctx.rotate(ang);
      ctx.fillStyle = marker.color;
      ctx.beginPath();
      ctx.moveTo(16, 0);
      ctx.lineTo(-8, -10);
      ctx.lineTo(-8, 10);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
      ctx.fillStyle = marker.color;
      ctx.font = 'bold 13px ' + FONT;
      ctx.textAlign = 'center';
      ctx.fillText(Math.round(Math.hypot(marker.x - px, marker.y - py)) + 'm', ex, ey + 28);
    }
  }

  /** Landmark labels above their places on the map. */
  function drawLandmarkLabels(world, camera) {
    for (const [key, lm] of Object.entries(world.city.landmarks)) {
      const sx = lm.x - camera.x;
      const sy = lm.y - camera.y;
      if (sx < -80 || sy < -40 || sx > VIEW.width + 80 || sy > VIEW.height + 40) continue;
      ctx.fillStyle = lm.color;
      ctx.font = 'bold 12px ' + FONT;
      ctx.textAlign = 'center';
      ctx.fillText(lm.label.toUpperCase(), sx, sy - 8);
    }
  }

  /** Pickups: cash, pistol, health, ammo — bobbing so they catch the eye. */
  function drawPickups(world, camera) {
    for (const p of world.pickups) {
      if (p.taken) continue;
      const sx = p.x - camera.x;
      const sy = p.y - camera.y + Math.sin(performance.now() / 300 + p.bob) * 3;
      if (sx < 0 || sy < 0 || sx > VIEW.width || sy > VIEW.height) continue;
      if (p.kind === 'cash') {
        ctx.fillStyle = '#2fae5f';
        ctx.fillRect(sx - 9, sy - 6, 18, 12);
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 11px ' + FONT;
        ctx.textAlign = 'center';
        ctx.fillText('$', sx, sy + 4);
      } else if (p.kind === 'gun') {
        ctx.fillStyle = '#222';
        ctx.fillRect(sx - 10, sy - 3, 20, 6);
        ctx.fillStyle = '#ffd97a';
        ctx.font = 'bold 10px ' + FONT;
        ctx.textAlign = 'center';
        ctx.fillText('PISTOL', sx, sy - 10);
      } else if (p.kind === 'health') {
        ctx.fillStyle = '#ff8fa3';
        ctx.fillRect(sx - 9, sy - 9, 18, 18);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(sx - 2, sy - 6, 4, 12);
        ctx.fillRect(sx - 6, sy - 2, 12, 4);
      } else if (p.kind === 'ammo') {
        ctx.fillStyle = '#c9a2ff';
        ctx.fillRect(sx - 8, sy - 5, 16, 10);
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 9px ' + FONT;
        ctx.textAlign = 'center';
        ctx.fillText('AMMO', sx, sy + 3);
      }
    }
  }

  /** Bullets as streaks along their own angle — the tracer fix. */
  function drawBullets(world, camera) {
    for (const b of world.combat.bullets) {
      const t = bulletTracer(b);
      ctx.strokeStyle = b.from === 'player' ? '#ffe27a' : '#ff9f43';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(t.x1 - camera.x, t.y1 - camera.y);
      ctx.lineTo(t.x2 - camera.x, t.y2 - camera.y);
      ctx.stroke();
    }
  }

  /** Particles (sparks, smoke, muzzle flashes) fading out by remaining life. */
  function drawParticles(world, camera) {
    for (const p of world.combat.particles) {
      const sx = p.x - camera.x;
      const sy = p.y - camera.y;
      ctx.globalAlpha = Math.max(0, p.life / p.maxLife);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(sx, sy, p.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  /** The HUD: health/money/debt panel, wanted stars, minimap, mission tracker,
   * dialogue, banner, toast and the controls hint. */
  function drawHud(world) {
    const vic = world.player;
    const heat = world.wanted;
    // Top-left panel: health, money, debt.
    ctx.fillStyle = PALETTE.hudBg;
    roundRect(12, 12, 250, 86, 10);
    ctx.fill();
    ctx.fillStyle = PALETTE.hudText;
    ctx.font = 'bold 15px ' + FONT;
    ctx.textAlign = 'left';
    ctx.fillText('VIC TORRES', 26, 34);
    // Health bar.
    ctx.fillStyle = '#333';
    ctx.fillRect(26, 44, 150, 12);
    ctx.fillStyle = vic.health > 50 ? PALETTE.hudGood : vic.health > 25 ? PALETTE.hudAccent : PALETTE.hudDanger;
    ctx.fillRect(26, 44, 150 * Math.max(0, vic.health / 100), 12);
    ctx.fillStyle = PALETTE.hudText;
    ctx.font = 'bold 12px ' + FONT;
    ctx.fillText(Math.ceil(vic.health) + '', 184, 55);
    ctx.fillStyle = '#7ee787';
    ctx.font = 'bold 15px ' + FONT;
    ctx.fillText(fmtMoney(vic.money), 26, 78);
    ctx.fillStyle = '#ff9f43';
    ctx.font = '12px ' + FONT;
    ctx.fillText('Debt: ' + fmtMoney(vic.debt), 130, 78);
    if (vic.hasGun) {
      ctx.fillStyle = PALETTE.hudText;
      ctx.font = 'bold 12px ' + FONT;
      ctx.fillText('PISTOL  ' + vic.ammo + ' rds', 26, 92);
    }
    // Wanted stars, top centre.
    if (heat.stars > 0) {
      ctx.fillStyle = PALETTE.hudBg;
      const w = 40 + heat.stars * 26;
      roundRect(VIEW.width / 2 - w / 2, 12, w, 40, 10);
      ctx.fill();
      ctx.font = '22px ' + FONT;
      ctx.textAlign = 'center';
      for (let i = 0; i < heat.stars; i += 1) {
        ctx.fillStyle = i < heat.stars ? '#ffd23f' : '#555';
        ctx.fillText('★', VIEW.width / 2 - (heat.stars - 1) * 13 + i * 26, 42);
      }
      if (world.wanted.bustTimer > 0) {
        ctx.fillStyle = '#ff5d5d';
        ctx.font = 'bold 13px ' + FONT;
        ctx.fillText('THEY ARE ON YOU — RUN!', VIEW.width / 2, 68);
      }
    }
    // Minimap, top right.
    drawMinimap(world);
    // Mission tracker, bottom left.
    const mission = world.missionText;
    if (mission) {
      ctx.fillStyle = PALETTE.hudBg;
      const lines = mission.lines || [];
      const h = 26 + lines.length * 20;
      roundRect(12, VIEW.height - h - 12, 430, h, 10);
      ctx.fill();
      ctx.fillStyle = PALETTE.hudAccent;
      ctx.font = 'bold 14px ' + FONT;
      ctx.textAlign = 'left';
      ctx.fillText(mission.title || 'MISSION', 26, VIEW.height - h + 17);
      ctx.fillStyle = PALETTE.hudText;
      ctx.font = '13px ' + FONT;
      lines.forEach((line, i) => ctx.fillText(line, 26, VIEW.height - h + 37 + i * 20));
    }
    // Dialogue box, bottom centre.
    if (world.dialogueLine) {
      ctx.fillStyle = 'rgba(10,12,20,0.85)';
      roundRect(330, VIEW.height - 108, 620, 56, 10);
      ctx.fill();
      ctx.fillStyle = PALETTE.hudAccent;
      ctx.font = 'bold 13px ' + FONT;
      ctx.textAlign = 'left';
      ctx.fillText(world.dialogueLine.speaker, 348, VIEW.height - 84);
      ctx.fillStyle = PALETTE.hudText;
      ctx.font = '14px ' + FONT;
      ctx.fillText(world.dialogueLine.text, 348, VIEW.height - 62);
    }
    // Banner, centre.
    if (world.banner) {
      const alpha = Math.min(1, world.banner.t);
      ctx.globalAlpha = alpha;
      ctx.fillStyle = 'rgba(10,12,20,0.7)';
      ctx.fillRect(0, 250, VIEW.width, 110);
      ctx.fillStyle = PALETTE.hudAccent;
      ctx.font = 'bold 44px ' + FONT_DISPLAY;
      ctx.textAlign = 'center';
      ctx.fillText(world.banner.text, VIEW.width / 2, 300);
      ctx.fillStyle = PALETTE.hudText;
      ctx.font = '17px ' + FONT;
      ctx.fillText(world.banner.sub, VIEW.width / 2, 332);
      ctx.globalAlpha = 1;
    }
    // Toast, top centre below stars.
    if (world.toast) {
      ctx.fillStyle = 'rgba(10,12,20,0.75)';
      const w = ctx.measureText(world.toast).width + 36;
      roundRect(VIEW.width / 2 - w / 2, 60, w, 30, 8);
      ctx.fill();
      ctx.fillStyle = PALETTE.hudText;
      ctx.font = 'bold 14px ' + FONT;
      ctx.textAlign = 'center';
      ctx.fillText(world.toast, VIEW.width / 2, 80);
    }
    // Controls hint, bottom right (fades after the first minute).
    if (world.playTime < 60) {
      ctx.fillStyle = 'rgba(10,12,20,0.6)';
      roundRect(VIEW.width - 268, VIEW.height - 52, 256, 40, 8);
      ctx.fill();
      ctx.fillStyle = PALETTE.hudText;
      ctx.font = '12px ' + FONT;
      ctx.textAlign = 'left';
      ctx.fillText('WASD move/drive · E enter car · F punch', VIEW.width - 256, VIEW.height - 34);
      ctx.fillText('Click shoot · Shift run · Space brake · P pause', VIEW.width - 256, VIEW.height - 18);
    }
  }

  /** The minimap: roads, sea, mission marker, police dots, the player. */
  function drawMinimap(world) {
    const mw = 190;
    const mh = 132;
    const ox = VIEW.width - mw - 12;
    const oy = 12;
    const sx = mw / WORLD.width;
    const sy = mh / WORLD.height;
    ctx.fillStyle = PALETTE.hudBg;
    roundRect(ox - 4, oy - 4, mw + 8, mh + 8, 8);
    ctx.fill();
    ctx.save();
    ctx.beginPath();
    ctx.rect(ox, oy, mw, mh);
    ctx.clip();
    ctx.fillStyle = '#2c4a2c';
    ctx.fillRect(ox, oy, mw, mh);
    ctx.fillStyle = '#3a3f4a';
    for (const rx of ROAD_X) ctx.fillRect(ox + rx * sx - 2, oy, 4, mh);
    for (const ry of ROAD_Y) ctx.fillRect(ox, oy + ry * sy, mw, 4);
    ctx.fillStyle = '#2e8fa3';
    ctx.fillRect(ox, oy + 2450 * sy, mw, mh - 2450 * sy);
    // Mission marker.
    if (world.missionMarker) {
      ctx.fillStyle = world.missionMarker.color;
      ctx.beginPath();
      ctx.arc(ox + world.missionMarker.x * sx, oy + world.missionMarker.y * sy, 5, 0, Math.PI * 2);
      ctx.fill();
    }
    // Police.
    ctx.fillStyle = '#ff5d5d';
    for (const car of world.cars) {
      if (car.kind !== 'police' || car.dead) continue;
      ctx.beginPath();
      ctx.arc(ox + car.x * sx, oy + car.y * sy, 3, 0, Math.PI * 2);
      ctx.fill();
    }
    // Player.
    const px = world.player.inCar ? world.player.inCar.x : world.player.x;
    const py = world.player.inCar ? world.player.inCar.y : world.player.y;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(ox + px * sx, oy + py * sy, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = PALETTE.hudAccent;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(ox + px * sx, oy + py * sy, 6, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
    ctx.fillStyle = PALETTE.hudText;
    ctx.font = 'bold 11px ' + FONT;
    ctx.textAlign = 'left';
    ctx.fillText('SOLMAR', ox + 4, oy + mh - 6);
  }

  /** A centred panel for the pause, busted, wasted and complete screens. */
  function drawPanel(title, lines, prompt) {
    ctx.fillStyle = 'rgba(8,10,16,0.72)';
    ctx.fillRect(0, 0, VIEW.width, VIEW.height);
    ctx.fillStyle = '#141a26';
    roundRect(340, 150, 600, 150 + lines.length * 30, 14);
    ctx.fill();
    ctx.strokeStyle = PALETTE.hudAccent;
    ctx.lineWidth = 2;
    roundRect(340, 150, 600, 150 + lines.length * 30, 14);
    ctx.stroke();
    ctx.fillStyle = PALETTE.hudAccent;
    ctx.font = 'bold 34px ' + FONT_DISPLAY;
    ctx.textAlign = 'center';
    ctx.fillText(title, VIEW.width / 2, 205);
    ctx.fillStyle = PALETTE.hudText;
    ctx.font = '16px ' + FONT;
    lines.forEach((line, i) => ctx.fillText(line, VIEW.width / 2, 245 + i * 30));
    if (prompt) {
      ctx.fillStyle = PALETTE.hudAccent;
      ctx.font = 'bold 15px ' + FONT;
      ctx.fillText(prompt, VIEW.width / 2, 150 + 150 + lines.length * 30 - 24);
    }
  }

  return {
    ctx,
    drawWorld(world, camera) {
      ctx.save();
      if (world.combat.shake > 0) {
        ctx.translate((Math.random() - 0.5) * world.combat.shake, (Math.random() - 0.5) * world.combat.shake);
      }
      drawRoads(world.city, camera);
      for (const skid of world.combat.skidMarks) {
        const sx = skid.x - camera.x;
        const sy = skid.y - camera.y;
        if (sx < 0 || sy < 0 || sx > VIEW.width || sy > VIEW.height) continue;
        ctx.fillStyle = `rgba(20,20,20,${Math.min(0.5, skid.life * 0.25)})`;
        ctx.fillRect(sx - 3, sy - 2, 6, 4);
      }
      drawLandmarkLabels(world, camera);
      for (const b of world.city.buildings) drawBuilding(b, camera);
      drawPickups(world, camera);
      for (const car of world.cars) drawCar(car, camera, car === world.player.inCar);
      for (const ped of world.peds) drawPed(ped, camera);
      for (const cop of world.footCops) drawPed(cop, camera);
      if (!world.player.inCar && !world.player.dead) drawPlayer(world.player, camera);
      drawBullets(world, camera);
      drawParticles(world, camera);
      drawMarker(world, camera);
      ctx.restore();
    },
    drawHud(world) {
      drawHud(world);
    },
    drawTitle(world) {
      // A warm sunset gradient over the city, title and story.
      const grad = ctx.createLinearGradient(0, 0, 0, VIEW.height);
      grad.addColorStop(0, '#ff9e57');
      grad.addColorStop(0.55, '#e86a5a');
      grad.addColorStop(1, '#3a2b4a');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, VIEW.width, VIEW.height);
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.fillRect(0, 0, VIEW.width, VIEW.height);
      // Lines flow down from a cursor instead of hardcoded y values.
      let y = 210;
      ctx.fillStyle = '#fff3d6';
      ctx.font = 'bold 84px ' + FONT_DISPLAY;
      ctx.textAlign = 'center';
      ctx.fillText('SOLMAR HEAT', VIEW.width / 2, y);
      y += 42;
      ctx.fillStyle = '#ffd97a';
      ctx.font = 'bold 22px ' + FONT;
      ctx.fillText('AN OPEN-WORLD CRIME STORY', VIEW.width / 2, y);
      y += 48;
      ctx.fillStyle = '#ffffff';
      ctx.font = '17px ' + FONT;
      ctx.fillText('Vic Torres owes Madame Oro $50,000. Eight jobs. One city. No way out but through.', VIEW.width / 2, y);
      y += 28;
      ctx.fillText('Drive, steal, fight and outrun the Solmar PD — and pay the debt back.', VIEW.width / 2, y);
      y += 72;
      const lines = [
        'WASD / Arrows — move and drive      E — enter / exit car',
        'F — punch      Click — shoot (with a pistol)      Shift — run',
        'Space — handbrake      P / Esc — pause      M — mute',
        'Missions pay down the debt. Save at the Safehouse or from pause.',
      ];
      ctx.font = '15px ' + FONT;
      lines.forEach((line) => { ctx.fillText(line, VIEW.width / 2, y); y += 28; });
      y += 48;
      const blink = Math.sin(performance.now() / 300) > 0;
      if (blink) {
        ctx.fillStyle = '#ffd23f';
        ctx.font = 'bold 24px ' + FONT;
        ctx.fillText('PRESS ENTER OR CLICK TO START', VIEW.width / 2, y);
      }
      y += 40;
      if (world.hasSave) {
        ctx.fillStyle = '#7ee787';
        ctx.font = 'bold 15px ' + FONT;
        ctx.fillText('A saved game was found — press ENTER to continue it.', VIEW.width / 2, y);
      }
      ctx.fillStyle = 'rgba(255,255,255,0.65)';
      ctx.font = '13px ' + FONT;
      ctx.fillText('Solmar Heat — an original game. No Rockstar content. Best score: ' + fmtMoney(world.bestMoney || 0), VIEW.width / 2, 690);
    },
    drawPaused(world) {
      drawPanel('PAUSED', [
        'Money: ' + fmtMoney(world.player.money) + '    Debt: ' + fmtMoney(world.player.debt),
        'Missions done: ' + world.missionsDone + ' of 8',
        'P / Esc — resume      Enter — save and continue',
        'R — restart the story (progress is lost)',
      ], 'Paused — take a breath, Vic.');
    },
    drawBusted(world) {
      drawPanel('BUSTED', [
        'The Solmar PD caught up with you.',
        'You lost ' + fmtMoney(world.lastFine) + ' in fines. The heat is off — for now.',
        'Missions: ' + world.missionsDone + ' of 8 done.',
      ], 'Press ENTER to get back on the street.');
    },
    drawWasted(world) {
      drawPanel('WASTED', [
        'Vic went down in the streets of Solmar.',
        'The clinic patched you up for ' + fmtMoney(world.lastFine) + '.',
        'Missions: ' + world.missionsDone + ' of 8 done.',
      ], 'Press ENTER to get back on the street.');
    },
    drawComplete(world) {
      drawPanel('KING OF SOLMAR', [
        'The debt is paid. The city is yours.',
        'Final money: ' + fmtMoney(world.player.money),
        'Free roam: keep driving, keep the heat, keep Solmar.',
      ], 'Press ENTER to keep playing.');
    },
  };
}
