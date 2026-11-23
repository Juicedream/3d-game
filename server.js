import express from 'express';
import http from 'http';
import { WebSocketServer } from 'ws';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, 'dist')));

function generateId(prefix, len = 4) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  for (let i = 0; i < len; i++) {
    out += chars[Math.floor(Math.random() * chars.length)];
  }
  return `${prefix}-${out}`;
}

// ============================================================
// 1. SHOOTER MULTIPLAYER ROOMS
// ============================================================
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

const rooms = new Map();

function computeTeamRouting(playersMap) {
  const list = Array.from(playersMap.values());
  const count = list.length;
  let routingLabel = '1v0 Solo Practice';
  if (count === 2) {
    list[0].team = 'ALPHA';
    list[1].team = 'BRAVO';
    routingLabel = '1v1 Duel';
  } else if (count === 3) {
    list[0].team = 'ALPHA';
    list[1].team = 'ALPHA';
    list[2].team = 'BRAVO';
    routingLabel = '2v1 Asymmetric';
  } else if (count === 4) {
    list[0].team = 'ALPHA';
    list[1].team = 'ALPHA';
    list[2].team = 'BRAVO';
    list[3].team = 'BRAVO';
    routingLabel = '2v2 Squad';
  } else if (count === 5) {
    list[0].team = 'ALPHA';
    list[1].team = 'ALPHA';
    list[2].team = 'ALPHA';
    list[3].team = 'ALPHA';
    list[4].team = 'BRAVO';
    routingLabel = '4v1 Juggernaut';
  } else if (count > 5) {
    list.forEach((p, idx) => {
      p.team = idx % 2 === 0 ? 'ALPHA' : 'BRAVO';
    });
    const a = list.filter(p => p.team === 'ALPHA').length;
    const b = list.length - a;
    routingLabel = `${a}v${b} Skirmish`;
  } else if (count === 1) {
    list[0].team = 'ALPHA';
    routingLabel = '1v0 Waiting / Bots Active';
  }
  return routingLabel;
}

function getRandomSpawn(excludePos) {
  let candidates = SPAWN_POINTS;
  if (excludePos) {
    candidates = SPAWN_POINTS.filter(s => {
      const dx = s.x - excludePos.x;
      const dz = s.z - excludePos.z;
      return dx * dx + dz * dz > 100;
    });
    if (candidates.length === 0) candidates = SPAWN_POINTS;
  }
  return candidates[Math.floor(Math.random() * candidates.length)];
}

function serializeRoom(room) {
  const players = [];
  for (const p of room.players.values()) {
    players.push({
      id: p.id, name: p.name, team: p.team,
      x: p.x, y: p.y, z: p.z, yaw: p.yaw, pitch: p.pitch,
      hp: p.hp, maxHp: p.maxHp, kills: p.kills, deaths: p.deaths,
      weapon: p.weapon, sliding: p.sliding, alive: p.alive
    });
  }
  const elapsed = Math.floor((Date.now() - room.matchStart) / 1000);
  const timeLeft = Math.max(0, room.duration - elapsed);
  return {
    roomId: room.id,
    scene: room.scene,
    level: room.level,
    routingLabel: room.routingLabel,
    timeLeft,
    players
  };
}

function broadcastRoom(room, payload, exceptPlayerId = null) {
  const msg = JSON.stringify(payload);
  for (const p of room.players.values()) {
    if (p.id !== exceptPlayerId && p.ws.readyState === 1) {
      p.ws.send(msg);
    }
  }
}

// ============================================================
// 2. FPS COMBAT RACING MULTIPLAYER ROOMS + SPECTATORS + LEADERBOARD
// ============================================================
const TRACK_LAPS = {
  asia: 4,
  nigeria: 6,
  morocco: 4,
  egypt: 8
};

const raceRooms = new Map();
const raceLeaderboard = [
  { name: 'KAIRO_DRIFT', carId: 'valkyrie', trackId: 'asia', timeSec: 118.4, takedowns: 3, trophies: 2, date: 'Record' },
  { name: 'LAGOS_NITRO', carId: 'apex', trackId: 'nigeria', timeSec: 176.2, takedowns: 4, trophies: 3, date: 'Record' },
  { name: 'ATLAS_VIPER', carId: 'phantom', trackId: 'morocco', timeSec: 124.9, takedowns: 2, trophies: 1, date: 'Record' },
  { name: 'PHARAOH_GT', carId: 'titan', trackId: 'egypt', timeSec: 238.5, takedowns: 5, trophies: 4, date: 'Record' }
];

function serializeRaceRoom(room) {
  const racers = [];
  for (const r of room.racers.values()) {
    racers.push({
      id: r.id,
      name: r.name,
      carId: r.carId,
      gridIndex: r.gridIndex,
      x: r.x, y: r.y, z: r.z,
      yaw: r.yaw, speed: r.speed,
      lap: r.lap, progress: r.progress,
      hp: r.hp, alive: r.alive,
      drifting: r.drifting, nitro: r.nitro,
      takedowns: r.takedowns,
      finished: r.finished,
      finishTime: r.finishTime
    });
  }
  return {
    roomId: room.id,
    hostId: room.hostId,
    trackId: room.trackId,
    totalLaps: room.totalLaps,
    maxPlayers: room.maxPlayers,
    locked: room.locked,
    started: room.started,
    racerCount: room.racers.size,
    spectatorCount: room.spectators.size,
    racers
  };
}

function getRaceRoomsSummary() {
  const list = [];
  for (const room of raceRooms.values()) {
    list.push({
      roomId: room.id,
      trackId: room.trackId,
      totalLaps: room.totalLaps,
      racerCount: room.racers.size,
      maxPlayers: room.maxPlayers,
      spectatorCount: room.spectators.size,
      locked: room.locked,
      started: room.started
    });
  }
  return list;
}

function broadcastRaceRoom(room, payload, exceptId = null) {
  const msg = JSON.stringify(payload);
  for (const r of room.racers.values()) {
    if (r.id !== exceptId && r.ws.readyState === 1) r.ws.send(msg);
  }
  for (const s of room.spectators.values()) {
    if (s.id !== exceptId && s.ws.readyState === 1) s.ws.send(msg);
  }
}

function broadcastRaceDirectory() {
  const msg = JSON.stringify({ type: 'race_rooms_list', rooms: getRaceRoomsSummary() });
  for (const client of wss.clients) {
    if (client.readyState === 1) client.send(msg);
  }
}

function recordLeaderboardEntry(entry) {
  const existing = raceLeaderboard.find(
    e => e.name.toUpperCase() === entry.name.toUpperCase() && e.trackId === entry.trackId
  );
  if (existing) {
    existing.trophies += 1;
    existing.takedowns = Math.max(existing.takedowns, entry.takedowns || 0);
    if (entry.timeSec < existing.timeSec) {
      existing.timeSec = entry.timeSec;
      existing.carId = entry.carId;
    }
    existing.date = new Date().toLocaleDateString();
  } else {
    raceLeaderboard.push({
      name: entry.name,
      carId: entry.carId,
      trackId: entry.trackId,
      timeSec: Number(entry.timeSec.toFixed(2)),
      takedowns: entry.takedowns || 0,
      trophies: 1,
      date: new Date().toLocaleDateString()
    });
  }
  raceLeaderboard.sort((a, b) => b.trophies - a.trophies || a.timeSec - b.timeSec);
  if (raceLeaderboard.length > 25) raceLeaderboard.length = 25;
}

// ============================================================
// WEBSOCKET CONNECTION HANDLER
// ============================================================
wss.on('connection', (ws) => {
  const playerId = generateId('OP', 4);
  let currentRoom = null;
  let currentRaceRoom = null;
  let raceRole = null; // 'racer' | 'spectator'

  ws.send(JSON.stringify({
    type: 'welcome',
    playerId,
    raceRooms: getRaceRoomsSummary(),
    raceLeaderboard
  }));

  function leaveShooterRoom() {
    if (!currentRoom) return;
    currentRoom.players.delete(playerId);
    if (currentRoom.players.size === 0) {
      rooms.delete(currentRoom.id);
    } else {
      currentRoom.routingLabel = computeTeamRouting(currentRoom.players);
      broadcastRoom(currentRoom, { type: 'room_state', state: serializeRoom(currentRoom) });
    }
    currentRoom = null;
  }

  function leaveRaceRoom() {
    if (!currentRaceRoom) return;
    if (raceRole === 'racer') {
      currentRaceRoom.racers.delete(playerId);
    } else if (raceRole === 'spectator') {
      currentRaceRoom.spectators.delete(playerId);
    }
    if (currentRaceRoom.racers.size === 0 && currentRaceRoom.spectators.size === 0) {
      raceRooms.delete(currentRaceRoom.id);
    } else {
      if (currentRaceRoom.hostId === playerId && currentRaceRoom.racers.size > 0) {
        currentRaceRoom.hostId = Array.from(currentRaceRoom.racers.keys())[0];
      }
      broadcastRaceRoom(currentRaceRoom, {
        type: 'race_room_state',
        state: serializeRaceRoom(currentRaceRoom)
      });
    }
    currentRaceRoom = null;
    raceRole = null;
    broadcastRaceDirectory();
  }

  ws.on('message', (raw) => {
    let data;
    try {
      data = JSON.parse(raw.toString());
    } catch {
      return;
    }

    // ---------- RACING MESSAGES ----------
    if (data.type === 'race_list_rooms') {
      ws.send(JSON.stringify({ type: 'race_rooms_list', rooms: getRaceRoomsSummary() }));
      return;
    }

    if (data.type === 'get_race_leaderboard') {
      ws.send(JSON.stringify({ type: 'race_leaderboard', leaderboard: raceLeaderboard }));
      return;
    }

    if (data.type === 'race_submit_result') {
      if (data.won) {
        recordLeaderboardEntry({
          name: (data.name || playerId).slice(0, 18),
          carId: data.carId || 'valkyrie',
          trackId: data.trackId || 'asia',
          timeSec: Number(data.timeSec) || 120,
          takedowns: Number(data.takedowns) || 0
        });
      }
      const msg = JSON.stringify({ type: 'race_leaderboard', leaderboard: raceLeaderboard });
      for (const client of wss.clients) {
        if (client.readyState === 1) client.send(msg);
      }
      return;
    }

    if (data.type === 'race_create_room') {
      leaveShooterRoom();
      leaveRaceRoom();
      const trackId = TRACK_LAPS[data.trackId] ? data.trackId : 'asia';
      const maxPlayers = Math.max(1, Math.min(8, Number(data.maxPlayers) || 4));
      const roomId = generateId('RC', 4);
      const room = {
        id: roomId,
        hostId: playerId,
        trackId,
        totalLaps: TRACK_LAPS[trackId],
        maxPlayers,
        locked: maxPlayers === 1, // If host starts a 1-racer room, immediately lock extra users to Spectator!
        started: maxPlayers === 1,
        racers: new Map(),
        spectators: new Map(),
        finishOrder: []
      };

      room.racers.set(playerId, {
        id: playerId,
        name: (data.name || playerId).slice(0, 18),
        carId: data.carId || 'valkyrie',
        gridIndex: 0,
        x: 0, y: 0, z: 0, yaw: 0, speed: 0,
        lap: 1, progress: 0, hp: 100, alive: true,
        drifting: false, nitro: false, takedowns: 0,
        finished: false, finishTime: 0,
        ws
      });

      raceRooms.set(roomId, room);
      currentRaceRoom = room;
      raceRole = 'racer';

      ws.send(JSON.stringify({
        type: 'race_joined',
        role: 'racer',
        playerId,
        state: serializeRaceRoom(room)
      }));
      broadcastRaceDirectory();
      return;
    }

    if (data.type === 'race_join_room') {
      leaveShooterRoom();
      leaveRaceRoom();
      const requestedId = (data.roomId || '').trim().toUpperCase();
      const room = raceRooms.get(requestedId);
      if (!room) {
        ws.send(JSON.stringify({ type: 'error', message: `Race Room "${requestedId}" not found.` }));
        return;
      }

      // Check if room is full or already locked -> AUTOMATICALLY ASSIGN AS LIVE SPECTATOR!
      if (room.locked || room.racers.size >= room.maxPlayers) {
        room.spectators.set(playerId, {
          id: playerId,
          name: (data.name || playerId).slice(0, 18),
          ws
        });
        currentRaceRoom = room;
        raceRole = 'spectator';

        ws.send(JSON.stringify({
          type: 'race_joined',
          role: 'spectator',
          playerId,
          reason: 'Room has reached max racers and is locked. Watching live as Spectator!',
          state: serializeRaceRoom(room)
        }));
        broadcastRaceRoom(room, {
          type: 'race_room_state',
          state: serializeRaceRoom(room)
        }, playerId);
        broadcastRaceDirectory();
        return;
      }

      // Join as active Racer
      const gridIndex = room.racers.size;
      room.racers.set(playerId, {
        id: playerId,
        name: (data.name || playerId).slice(0, 18),
        carId: data.carId || 'apex',
        gridIndex,
        x: 0, y: 0, z: 0, yaw: 0, speed: 0,
        lap: 1, progress: 0, hp: 100, alive: true,
        drifting: false, nitro: false, takedowns: 0,
        finished: false, finishTime: 0,
        ws
      });

      // Automatically LOCK the room once player count hits the host's maxPlayers!
      if (room.racers.size >= room.maxPlayers) {
        room.locked = true;
        room.started = true;
      }

      currentRaceRoom = room;
      raceRole = 'racer';

      ws.send(JSON.stringify({
        type: 'race_joined',
        role: 'racer',
        playerId,
        state: serializeRaceRoom(room)
      }));

      broadcastRaceRoom(room, {
        type: 'race_room_state',
        state: serializeRaceRoom(room)
      }, playerId);

      if (room.locked) {
        broadcastRaceRoom(room, {
          type: 'race_locked_start',
          state: serializeRaceRoom(room)
        });
      }
      broadcastRaceDirectory();
      return;
    }

    if (data.type === 'race_lock_and_start') {
      if (currentRaceRoom && currentRaceRoom.hostId === playerId) {
        currentRaceRoom.locked = true;
        currentRaceRoom.started = true;
        broadcastRaceRoom(currentRaceRoom, {
          type: 'race_locked_start',
          state: serializeRaceRoom(currentRaceRoom)
        });
        broadcastRaceDirectory();
      }
      return;
    }

    if (data.type === 'race_state_update' && currentRaceRoom && raceRole === 'racer') {
      const me = currentRaceRoom.racers.get(playerId);
      if (!me) return;
      me.x = Number(data.x) || 0;
      me.y = Number(data.y) || 0;
      me.z = Number(data.z) || 0;
      me.yaw = Number(data.yaw) || 0;
      me.speed = Number(data.speed) || 0;
      me.lap = Number(data.lap) || 1;
      me.progress = Number(data.progress) || 0;
      me.hp = Number(data.hp) ?? 100;
      me.alive = data.alive !== false;
      me.drifting = Boolean(data.drifting);
      me.nitro = Boolean(data.nitro);
      me.takedowns = Number(data.takedowns) || 0;

      broadcastRaceRoom(currentRaceRoom, {
        type: 'race_racer_moved',
        id: playerId,
        name: me.name,
        carId: me.carId,
        x: me.x, y: me.y, z: me.z,
        yaw: me.yaw, speed: me.speed,
        lap: me.lap, progress: me.progress,
        hp: me.hp, alive: me.alive,
        drifting: me.drifting, nitro: me.nitro,
        takedowns: me.takedowns
      }, playerId);
      return;
    }

    if (data.type === 'race_combat_hit' && currentRaceRoom && raceRole === 'racer') {
      broadcastRaceRoom(currentRaceRoom, {
        type: 'race_combat_event',
        attackerId: playerId,
        targetId: data.targetId,
        damage: Number(data.damage) || 25,
        weapon: data.weapon || 'pulse',
        eliminated: Boolean(data.eliminated)
      }, playerId);
      return;
    }

    if (data.type === 'race_leave_room') {
      leaveRaceRoom();
      return;
    }

    // ---------- SHOOTER MESSAGES ----------
    if (data.type === 'create_room' || data.type === 'join_room') {
      leaveRaceRoom();
      leaveShooterRoom();

      let room;
      if (data.type === 'create_room') {
        const roomId = generateId('RM', 4);
        room = {
          id: roomId,
          scene: data.scene || 'forest',
          players: new Map(),
          matchStart: Date.now(),
          duration: 300,
          level: 1,
          routingLabel: '1v0 Waiting / Bots Active'
        };
        rooms.set(roomId, room);
      } else {
        const requestedId = (data.roomId || '').trim().toUpperCase();
        room = rooms.get(requestedId);
        if (!room) {
          ws.send(JSON.stringify({ type: 'error', message: `Room "${requestedId}" not found.` }));
          return;
        }
      }

      const spawn = getRandomSpawn();
      const playerObj = {
        id: playerId,
        name: data.name || playerId,
        team: 'ALPHA',
        x: spawn.x, y: spawn.y, z: spawn.z,
        yaw: 0, pitch: 0,
        hp: 100, maxHp: 100,
        kills: 0, deaths: 0,
        weapon: 'rifle', sliding: false, alive: true,
        ws
      };
      room.players.set(playerId, playerObj);
      room.routingLabel = computeTeamRouting(room.players);
      currentRoom = room;

      ws.send(JSON.stringify({
        type: 'joined_room',
        playerId,
        spawn,
        state: serializeRoom(room)
      }));

      broadcastRoom(room, {
        type: 'room_state',
        state: serializeRoom(room)
      }, playerId);
      return;
    }

    if (!currentRoom) return;
    const me = currentRoom.players.get(playerId);
    if (!me) return;

    if (data.type === 'state_update') {
      me.x = Number(data.x) || 0;
      me.y = Number(data.y) || 0;
      me.z = Number(data.z) || 0;
      me.yaw = Number(data.yaw) || 0;
      me.pitch = Number(data.pitch) || 0;
      me.weapon = data.weapon || 'rifle';
      me.sliding = Boolean(data.sliding);
      broadcastRoom(currentRoom, {
        type: 'player_moved',
        id: playerId,
        x: me.x, y: me.y, z: me.z, yaw: me.yaw, pitch: me.pitch,
        weapon: me.weapon, sliding: me.sliding, hp: me.hp, alive: me.alive
      }, playerId);
    } else if (data.type === 'shoot') {
      broadcastRoom(currentRoom, {
        type: 'remote_shoot',
        id: playerId,
        weapon: data.weapon,
        origin: data.origin,
        dir: data.dir
      }, playerId);
    } else if (data.type === 'grenade') {
      broadcastRoom(currentRoom, {
        type: 'remote_grenade',
        id: playerId,
        origin: data.origin,
        vel: data.vel
      }, playerId);
    } else if (data.type === 'hit_player') {
      const target = currentRoom.players.get(data.targetId);
      if (target && target.alive && target.id !== playerId) {
        if (target.team === me.team && currentRoom.players.size > 1) return;
        const dmg = Math.min(100, Math.max(1, Number(data.damage) || 20));
        target.hp = Math.max(0, target.hp - dmg);
        if (target.hp <= 0) {
          target.alive = false;
          target.deaths += 1;
          me.kills += 1;
          let totalKills = 0;
          for (const pl of currentRoom.players.values()) totalKills += pl.kills;
          currentRoom.level = 1 + Math.floor(totalKills / 5);

          broadcastRoom(currentRoom, {
            type: 'player_killed',
            killerId: me.id,
            victimId: target.id,
            weapon: data.weapon || me.weapon,
            state: serializeRoom(currentRoom)
          });

          const prevPos = { x: target.x, y: target.y, z: target.z };
          setTimeout(() => {
            if (!currentRoom || !currentRoom.players.has(target.id)) return;
            const newSpawn = getRandomSpawn(prevPos);
            target.x = newSpawn.x;
            target.y = newSpawn.y;
            target.z = newSpawn.z;
            target.hp = target.maxHp;
            target.alive = true;
            broadcastRoom(currentRoom, {
              type: 'player_respawn',
              id: target.id,
              spawn: newSpawn,
              state: serializeRoom(currentRoom)
            });
          }, 2500);
        } else {
          broadcastRoom(currentRoom, {
            type: 'player_damaged',
            targetId: target.id,
            attackerId: me.id,
            hp: target.hp
          });
        }
      }
    } else if (data.type === 'restart_match') {
      currentRoom.matchStart = Date.now();
      currentRoom.level = 1;
      for (const pl of currentRoom.players.values()) {
        const sp = getRandomSpawn();
        pl.x = sp.x; pl.y = sp.y; pl.z = sp.z;
        pl.hp = pl.maxHp; pl.kills = 0; pl.deaths = 0; pl.alive = true;
      }
      broadcastRoom(currentRoom, {
        type: 'match_restarted',
        state: serializeRoom(currentRoom)
      });
    } else if (data.type === 'change_scene') {
      currentRoom.scene = data.scene || 'forest';
      broadcastRoom(currentRoom, {
        type: 'scene_changed',
        scene: currentRoom.scene,
        state: serializeRoom(currentRoom)
      });
    } else if (data.type === 'leave_room') {
      leaveShooterRoom();
    }
  });

  ws.on('close', () => {
    leaveShooterRoom();
    leaveRaceRoom();
  });
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

server.listen(PORT, () => {
  console.log(`3D Game Platform server running at http://localhost:${PORT}`);
});
