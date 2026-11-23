// Shared Multiplayer State Engine — powers BOTH Vercel Serverless (/api/multiplayer) AND Local Node Server!
// Supports optional Upstash Redis / Vercel KV (auto-detected via env vars) for multi-region Vercel persistence,
// with automatic warm in-memory store fallback when env vars are not set.

const TRACK_LAPS = { asia: 4, nigeria: 6, morocco: 4, egypt: 8 };
const SPAWN_POINTS = [
  { x: -24, y: 1.8, z: -24 },
  { x: 24, y: 1.8, z: 24 },
  { x: -24, y: 1.8, z: 24 },
  { x: 24, y: 1.8, z: -24 },
  { x: 0, y: 1.8, z: -28 },
  { x: 0, y: 1.8, z: 28 },
  { x: -28, y: 1.8, z: 0 },
  { x: 28, y: 1.8, z: 0 }
];

const DEFAULT_LEADERBOARD = [
  { name: 'KAIRO_DRIFT', carId: 'valkyrie', trackId: 'asia', timeSec: 118.4, takedowns: 3, trophies: 2, date: 'Record' },
  { name: 'LAGOS_NITRO', carId: 'apex', trackId: 'nigeria', timeSec: 176.2, takedowns: 4, trophies: 3, date: 'Record' },
  { name: 'ATLAS_VIPER', carId: 'phantom', trackId: 'morocco', timeSec: 124.9, takedowns: 2, trophies: 1, date: 'Record' },
  { name: 'PHARAOH_GT', carId: 'titan', trackId: 'egypt', timeSec: 238.5, takedowns: 5, trophies: 4, date: 'Record' }
];

const GLOBAL_KEY = '__AEGIS_RONIN_MP_STORE__';
if (!globalThis[GLOBAL_KEY]) {
  globalThis[GLOBAL_KEY] = {
    shooterRooms: {},
    raceRooms: {},
    raceLeaderboard: [...DEFAULT_LEADERBOARD],
    events: {} // roomId -> [ { id, ts, payload } ]
  };
}

let eventCounter = 1;

function genId(prefix, len = 4) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  for (let i = 0; i < len; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return `${prefix}-${out}`;
}

function getKvConfig() {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  return url && token ? { url, token } : null;
}

async function loadState() {
  const kv = getKvConfig();
  if (!kv) return globalThis[GLOBAL_KEY];
  try {
    const res = await fetch(`${kv.url}/get/aegis_mp_state_v2`, {
      headers: { Authorization: `Bearer ${kv.token}` }
    });
    const json = await res.json();
    if (json?.result) {
      const parsed = JSON.parse(json.result);
      globalThis[GLOBAL_KEY] = parsed;
      return parsed;
    }
  } catch {}
  return globalThis[GLOBAL_KEY];
}

async function saveState(state) {
  globalThis[GLOBAL_KEY] = state;
  const kv = getKvConfig();
  if (!kv) return;
  try {
    await fetch(`${kv.url}/set/aegis_mp_state_v2`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${kv.token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(JSON.stringify(state))
    });
  } catch {}
}

function pruneStale(state) {
  const now = Date.now();
  const STALE_PLAYER_MS = 28000;
  const STALE_ROOM_MS = 180000;

  for (const [rid, room] of Object.entries(state.shooterRooms)) {
    for (const [pid, p] of Object.entries(room.players || {})) {
      if (now - (p.lastSeen || 0) > STALE_PLAYER_MS) delete room.players[pid];
    }
    if (Object.keys(room.players || {}).length === 0 && now - (room.createdAt || 0) > STALE_ROOM_MS) {
      delete state.shooterRooms[rid];
      delete state.events[rid];
    }
  }

  for (const [rid, room] of Object.entries(state.raceRooms)) {
    for (const [pid, r] of Object.entries(room.racers || {})) {
      if (now - (r.lastSeen || 0) > STALE_PLAYER_MS) delete room.racers[pid];
    }
    for (const [pid, s] of Object.entries(room.spectators || {})) {
      if (now - (s.lastSeen || 0) > STALE_PLAYER_MS) delete room.spectators[pid];
    }
    if (
      Object.keys(room.racers || {}).length === 0 &&
      Object.keys(room.spectators || {}).length === 0 &&
      now - (room.createdAt || 0) > STALE_ROOM_MS
    ) {
      delete state.raceRooms[rid];
      delete state.events[rid];
    }
  }
}

function computeShooterTeams(playersObj) {
  const list = Object.values(playersObj);
  const count = list.length;
  let routingLabel = '1v0 Solo / Bots Active';
  if (count === 2) {
    list[0].team = 'ALPHA'; list[1].team = 'BRAVO';
    routingLabel = '1v1 Duel';
  } else if (count === 3) {
    list[0].team = 'ALPHA'; list[1].team = 'ALPHA'; list[2].team = 'BRAVO';
    routingLabel = '2v1 Asymmetric';
  } else if (count === 4) {
    list[0].team = 'ALPHA'; list[1].team = 'ALPHA'; list[2].team = 'BRAVO'; list[3].team = 'BRAVO';
    routingLabel = '2v2 Squad';
  } else if (count === 5) {
    list[0].team = 'ALPHA'; list[1].team = 'ALPHA'; list[2].team = 'ALPHA'; list[3].team = 'ALPHA'; list[4].team = 'BRAVO';
    routingLabel = '4v1 Juggernaut';
  } else if (count > 5) {
    list.forEach((p, idx) => { p.team = idx % 2 === 0 ? 'ALPHA' : 'BRAVO'; });
    const a = list.filter(p => p.team === 'ALPHA').length;
    routingLabel = `${a}v${list.length - a} Skirmish`;
  } else if (count === 1) {
    list[0].team = 'ALPHA';
  }
  return routingLabel;
}

function pushEvent(state, roomId, payload) {
  if (!state.events[roomId]) state.events[roomId] = [];
  state.events[roomId].push({ id: ++eventCounter, ts: Date.now(), payload });
  if (state.events[roomId].length > 40) {
    state.events[roomId] = state.events[roomId].slice(-40);
  }
}

function serializeShooterRoom(room) {
  const players = Object.values(room.players || {});
  const elapsed = Math.floor((Date.now() - (room.matchStart || Date.now())) / 1000);
  return {
    roomId: room.id,
    hostId: room.hostId,
    hostName: room.hostName,
    scene: room.scene,
    level: room.level || 1,
    started: Boolean(room.started),
    routingLabel: room.routingLabel || '1v0 Waiting',
    timeLeft: Math.max(0, (room.duration || 300) - elapsed),
    players
  };
}

function serializeRaceRoom(room) {
  const racers = Object.values(room.racers || {});
  const spectators = Object.values(room.spectators || {});
  return {
    roomId: room.id,
    hostId: room.hostId,
    hostName: room.hostName,
    trackId: room.trackId,
    totalLaps: room.totalLaps,
    maxPlayers: room.maxPlayers,
    locked: Boolean(room.locked),
    started: Boolean(room.started),
    racerCount: racers.length,
    spectatorCount: spectators.length,
    racers
  };
}

function getDirectories(state) {
  const shooterRooms = Object.values(state.shooterRooms).map(r => ({
    roomId: r.id,
    hostName: r.hostName,
    scene: r.scene,
    playerCount: Object.keys(r.players || {}).length,
    started: Boolean(r.started),
    routingLabel: r.routingLabel
  }));
  const raceRooms = Object.values(state.raceRooms).map(r => ({
    roomId: r.id,
    hostName: r.hostName,
    trackId: r.trackId,
    totalLaps: r.totalLaps,
    racerCount: Object.keys(r.racers || {}).length,
    maxPlayers: r.maxPlayers,
    spectatorCount: Object.keys(r.spectators || {}).length,
    locked: Boolean(r.locked),
    started: Boolean(r.started)
  }));
  return { shooterRooms, raceRooms };
}

export async function handleMultiplayerAction(body) {
  const state = await loadState();
  pruneStale(state);

  const action = body?.type || 'directory';
  const playerId = body?.playerId || genId('OP', 4);
  const now = Date.now();
  let mutated = false;

  if (action === 'directory' || action === 'ping') {
    const dirs = getDirectories(state);
    return {
      ok: true,
      playerId,
      ...dirs,
      raceLeaderboard: state.raceLeaderboard
    };
  }

  // --- SHOOTER ROOMS ---
  if (action === 'create_room') {
    const roomId = genId('RM', 4);
    const hostName = (body.name || playerId).trim().slice(0, 18) || playerId;
    const spawn = SPAWN_POINTS[0];
    const room = {
      id: roomId,
      hostId: playerId,
      hostName,
      scene: body.scene || 'forest',
      level: 1,
      started: false,
      matchStart: now,
      duration: 300,
      createdAt: now,
      routingLabel: '1v0 Waiting for Players',
      players: {
        [playerId]: {
          id: playerId, name: hostName, team: 'ALPHA',
          x: spawn.x, y: spawn.y, z: spawn.z, yaw: 0, pitch: 0,
          hp: 100, maxHp: 100, kills: 0, deaths: 0,
          weapon: 'rifle', sliding: false, alive: true, lastSeen: now
        }
      }
    };
    state.shooterRooms[roomId] = room;
    mutated = true;
    await saveState(state);
    return {
      ok: true,
      type: 'joined_room',
      playerId,
      spawn,
      state: serializeShooterRoom(room),
      ...getDirectories(state)
    };
  }

  if (action === 'join_room') {
    const roomId = (body.roomId || '').trim().toUpperCase();
    const room = state.shooterRooms[roomId];
    if (!room) return { ok: false, error: `Shooter Room "${roomId}" not found.` };
    const name = (body.name || playerId).trim().slice(0, 18) || playerId;
    const spawn = SPAWN_POINTS[Object.keys(room.players).length % SPAWN_POINTS.length];
    room.players[playerId] = {
      id: playerId, name, team: 'BRAVO',
      x: spawn.x, y: spawn.y, z: spawn.z, yaw: 0, pitch: 0,
      hp: 100, maxHp: 100, kills: 0, deaths: 0,
      weapon: 'rifle', sliding: false, alive: true, lastSeen: now
    };
    room.routingLabel = computeShooterTeams(room.players);
    mutated = true;
    await saveState(state);
    return {
      ok: true,
      type: 'joined_room',
      playerId,
      spawn,
      state: serializeShooterRoom(room),
      ...getDirectories(state)
    };
  }

  if (action === 'shooter_start_match') {
    const room = state.shooterRooms[body.roomId];
    if (!room) return { ok: false, error: 'Room not found.' };
    room.started = true;
    room.matchStart = now;
    pushEvent(state, room.id, { type: 'shooter_started', state: serializeShooterRoom(room) });
    await saveState(state);
    return { ok: true, state: serializeShooterRoom(room), ...getDirectories(state) };
  }

  if (action === 'shooter_sync') {
    const room = state.shooterRooms[body.roomId];
    if (!room) return { ok: false, error: 'Room closed.' };
    const me = room.players[playerId];
    if (me) {
      me.lastSeen = now;
      if (body.pos) {
        me.x = Number(body.pos.x) || 0;
        me.y = Number(body.pos.y) || 0;
        me.z = Number(body.pos.z) || 0;
        me.yaw = Number(body.pos.yaw) || 0;
        me.pitch = Number(body.pos.pitch) || 0;
        me.weapon = body.pos.weapon || 'rifle';
        me.sliding = Boolean(body.pos.sliding);
      }
      mutated = true;
    }
    if (body.hit) {
      const target = room.players[body.hit.targetId];
      if (target && target.alive && target.id !== playerId) {
        target.hp = Math.max(0, target.hp - (Number(body.hit.damage) || 20));
        if (target.hp <= 0) {
          target.alive = false;
          target.deaths += 1;
          if (me) me.kills += 1;
          pushEvent(state, room.id, { type: 'player_killed', killerId: playerId, victimId: target.id, weapon: body.hit.weapon || 'rifle' });
          const sp = SPAWN_POINTS[Math.floor(Math.random() * SPAWN_POINTS.length)];
          target.x = sp.x; target.y = sp.y; target.z = sp.z; target.hp = 100; target.alive = true;
        } else {
          pushEvent(state, room.id, { type: 'player_damaged', targetId: target.id, attackerId: playerId, hp: target.hp });
        }
        mutated = true;
      }
    }
    if (mutated) await saveState(state);
    const since = Number(body.sinceEventId) || 0;
    const newEvents = (state.events[room.id] || []).filter(e => e.id > since);
    return {
      ok: true,
      state: serializeShooterRoom(room),
      events: newEvents
    };
  }

  if (action === 'leave_room') {
    const room = state.shooterRooms[body.roomId];
    if (room && room.players[playerId]) {
      delete room.players[playerId];
      if (Object.keys(room.players).length === 0) delete state.shooterRooms[room.id];
      else room.routingLabel = computeShooterTeams(room.players);
      await saveState(state);
    }
    return { ok: true, ...getDirectories(state) };
  }

  // --- RACING ROOMS ---
  if (action === 'race_create_room') {
    const trackId = TRACK_LAPS[body.trackId] ? body.trackId : 'asia';
    const maxPlayers = Math.max(1, Math.min(8, Number(body.maxPlayers) || 4));
    const roomId = genId('RC', 4);
    const hostName = (body.name || playerId).trim().slice(0, 18) || playerId;

    const room = {
      id: roomId,
      hostId: playerId,
      hostName,
      trackId,
      totalLaps: TRACK_LAPS[trackId],
      maxPlayers,
      locked: false,
      started: false,
      createdAt: now,
      racers: {
        [playerId]: {
          id: playerId, name: hostName, carId: body.carId || 'valkyrie', gridIndex: 0,
          x: 0, y: 0, z: 0, yaw: 0, speed: 0, lap: 1, progress: 0,
          hp: 100, alive: true, drifting: false, nitro: false, takedowns: 0,
          lastSeen: now
        }
      },
      spectators: {}
    };
    state.raceRooms[roomId] = room;
    await saveState(state);
    return {
      ok: true,
      type: 'race_joined',
      role: 'racer',
      playerId,
      state: serializeRaceRoom(room),
      ...getDirectories(state)
    };
  }

  if (action === 'race_join_room') {
    const roomId = (body.roomId || '').trim().toUpperCase();
    const room = state.raceRooms[roomId];
    if (!room) return { ok: false, error: `Race Room "${roomId}" not found.` };
    const name = (body.name || playerId).trim().slice(0, 18) || playerId;

    const racerCount = Object.keys(room.racers).length;
    if (room.locked || racerCount >= room.maxPlayers) {
      room.spectators[playerId] = { id: playerId, name, lastSeen: now };
      await saveState(state);
      return {
        ok: true,
        type: 'race_joined',
        role: 'spectator',
        playerId,
        reason: 'Room is full & locked — watching live as Spectator!',
        state: serializeRaceRoom(room),
        ...getDirectories(state)
      };
    }

    room.racers[playerId] = {
      id: playerId, name, carId: body.carId || 'apex', gridIndex: racerCount,
      x: 0, y: 0, z: 0, yaw: 0, speed: 0, lap: 1, progress: 0,
      hp: 100, alive: true, drifting: false, nitro: false, takedowns: 0,
      lastSeen: now
    };
    if (Object.keys(room.racers).length >= room.maxPlayers) {
      room.locked = true;
      room.started = true;
      pushEvent(state, room.id, { type: 'race_locked_start', state: serializeRaceRoom(room) });
    }
    await saveState(state);
    return {
      ok: true,
      type: 'race_joined',
      role: 'racer',
      playerId,
      state: serializeRaceRoom(room),
      ...getDirectories(state)
    };
  }

  if (action === 'race_lock_and_start') {
    const room = state.raceRooms[body.roomId];
    if (!room) return { ok: false, error: 'Race room not found.' };
    room.locked = true;
    room.started = true;
    pushEvent(state, room.id, { type: 'race_locked_start', state: serializeRaceRoom(room) });
    await saveState(state);
    return { ok: true, state: serializeRaceRoom(room), ...getDirectories(state) };
  }

  if (action === 'race_sync') {
    const room = state.raceRooms[body.roomId];
    if (!room) return { ok: false, error: 'Race room closed.' };
    const meRacer = room.racers[playerId];
    const meSpec = room.spectators[playerId];
    if (meRacer) {
      meRacer.lastSeen = now;
      if (body.pos) {
        meRacer.x = Number(body.pos.x) || 0;
        meRacer.y = Number(body.pos.y) || 0;
        meRacer.z = Number(body.pos.z) || 0;
        meRacer.yaw = Number(body.pos.yaw) || 0;
        meRacer.speed = Number(body.pos.speed) || 0;
        meRacer.lap = Number(body.pos.lap) || 1;
        meRacer.progress = Number(body.pos.progress) || 0;
        meRacer.hp = Number(body.pos.hp) ?? 100;
        meRacer.alive = body.pos.alive !== false;
        meRacer.drifting = Boolean(body.pos.drifting);
        meRacer.nitro = Boolean(body.pos.nitro);
        meRacer.takedowns = Number(body.pos.takedowns) || 0;
      }
      mutated = true;
    } else if (meSpec) {
      meSpec.lastSeen = now;
      mutated = true;
    }
    if (body.combatHit) {
      pushEvent(state, room.id, {
        type: 'race_combat_event',
        attackerId: playerId,
        targetId: body.combatHit.targetId,
        damage: Number(body.combatHit.damage) || 25,
        weapon: body.combatHit.weapon || 'pulse',
        eliminated: Boolean(body.combatHit.eliminated)
      });
      mutated = true;
    }
    if (mutated) await saveState(state);
    const since = Number(body.sinceEventId) || 0;
    const newEvents = (state.events[room.id] || []).filter(e => e.id > since);
    return {
      ok: true,
      state: serializeRaceRoom(room),
      events: newEvents
    };
  }

  if (action === 'race_leave_room') {
    const room = state.raceRooms[body.roomId];
    if (room) {
      delete room.racers[playerId];
      delete room.spectators[playerId];
      if (Object.keys(room.racers).length === 0 && Object.keys(room.spectators).length === 0) {
        delete state.raceRooms[room.id];
      }
      await saveState(state);
    }
    return { ok: true, ...getDirectories(state) };
  }

  if (action === 'race_submit_result') {
    if (body.won) {
      const name = (body.name || playerId).slice(0, 18);
      const trackId = body.trackId || 'asia';
      const existing = state.raceLeaderboard.find(e => e.name.toUpperCase() === name.toUpperCase() && e.trackId === trackId);
      if (existing) {
        existing.trophies += 1;
        existing.takedowns = Math.max(existing.takedowns, Number(body.takedowns) || 0);
        if (Number(body.timeSec) < existing.timeSec) existing.timeSec = Number(body.timeSec);
        existing.date = new Date().toLocaleDateString();
      } else {
        state.raceLeaderboard.push({
          name, carId: body.carId || 'valkyrie', trackId,
          timeSec: Number((Number(body.timeSec) || 120).toFixed(2)),
          takedowns: Number(body.takedowns) || 0,
          trophies: 1, date: new Date().toLocaleDateString()
        });
      }
      state.raceLeaderboard.sort((a, b) => b.trophies - a.trophies || a.timeSec - b.timeSec);
      if (state.raceLeaderboard.length > 25) state.raceLeaderboard.length = 25;
      await saveState(state);
    }
    return { ok: true, raceLeaderboard: state.raceLeaderboard };
  }

  return { ok: true, ...getDirectories(state), raceLeaderboard: state.raceLeaderboard };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const body = req.method === 'GET' ? { type: 'directory' } : (typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {}));
    const result = await handleMultiplayerAction(body);
    return res.status(200).json(result);
  } catch (err) {
    return res.status(500).json({ ok: false, error: err?.message || 'Relay error' });
  }
}
