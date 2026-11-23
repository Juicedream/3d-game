// Universal Cloud + Local Multiplayer Client
// Works seamlessly on Vercel (/api/multiplayer serverless relay) AND locally (Express server.js)!

export class MultiplayerClient {
  constructor() {
    this.connected = false;
    this.mode = 'cloud';
    this.playerId = this._loadOrCreatePlayerId();
    this.roomState = null;
    this.raceRoomState = null;
    this.raceRole = null; // 'racer' | 'spectator'
    this.shooterRoomsList = [];
    this.raceRoomsList = [];
    this.raceLeaderboard = this._loadLocalLeaderboard();
    this.handlers = new Map();

    this._dirTimer = null;
    this._syncTimer = null;
    this._lastEventId = 0;
    this._pendingShooterPos = null;
    this._pendingShooterHit = null;
    this._pendingRacePos = null;
    this._pendingRaceHit = null;
    this._syncBusy = false;
  }

  _loadOrCreatePlayerId() {
    try {
      const saved = sessionStorage.getItem('aegis_player_id');
      if (saved) return saved;
    } catch {}
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let s = '';
    for (let i = 0; i < 4; i++) s += chars[Math.floor(Math.random() * chars.length)];
    const id = `OP-${s}`;
    try { sessionStorage.setItem('aegis_player_id', id); } catch {}
    return id;
  }

  _loadLocalLeaderboard() {
    try {
      const raw = localStorage.getItem('apex_blur_leaderboard_v1');
      if (raw) return JSON.parse(raw);
    } catch {}
    return [
      { name: 'KAIRO_DRIFT', carId: 'valkyrie', trackId: 'asia', timeSec: 118.4, takedowns: 3, trophies: 2, date: 'Record' },
      { name: 'LAGOS_NITRO', carId: 'apex', trackId: 'nigeria', timeSec: 176.2, takedowns: 4, trophies: 3, date: 'Record' },
      { name: 'ATLAS_VIPER', carId: 'phantom', trackId: 'morocco', timeSec: 124.9, takedowns: 2, trophies: 1, date: 'Record' },
      { name: 'PHARAOH_GT', carId: 'titan', trackId: 'egypt', timeSec: 238.5, takedowns: 5, trophies: 4, date: 'Record' }
    ];
  }

  _saveLocalLeaderboard(list) {
    if (!Array.isArray(list)) return;
    this.raceLeaderboard = list;
    try { localStorage.setItem('apex_blur_leaderboard_v1', JSON.stringify(list)); } catch {}
  }

  on(event, fn) {
    if (!this.handlers.has(event)) this.handlers.set(event, new Set());
    this.handlers.get(event).add(fn);
    return () => this.handlers.get(event)?.delete(fn);
  }

  emit(event, data) {
    const set = this.handlers.get(event);
    if (set) set.forEach(fn => fn(data));
  }

  async _api(payload) {
    const res = await fetch('/api/multiplayer', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...payload, playerId: this.playerId })
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  }

  connect() {
    this._refreshDirectory();
    if (!this._dirTimer) {
      this._dirTimer = setInterval(() => this._refreshDirectory(), 2200);
    }
    if (!this._syncTimer) {
      this._syncTimer = setInterval(() => this._tickRoomSync(), 180);
    }
  }

  async _refreshDirectory() {
    try {
      const data = await this._api({ type: 'directory' });
      const wasConnected = this.connected;
      this.connected = true;
      if (Array.isArray(data.shooterRooms)) {
        this.shooterRoomsList = data.shooterRooms;
        this.emit('shooter_rooms_list', this.shooterRoomsList);
      }
      if (Array.isArray(data.raceRooms)) {
        this.raceRoomsList = data.raceRooms;
        this.emit('race_rooms_list', this.raceRoomsList);
      }
      if (Array.isArray(data.raceLeaderboard)) {
        this._saveLocalLeaderboard(data.raceLeaderboard);
        this.emit('race_leaderboard', this.raceLeaderboard);
      }
      if (!wasConnected) {
        this.emit('status', { connected: true, playerId: this.playerId });
      }
    } catch {
      if (this.connected) {
        this.connected = false;
        this.emit('status', { connected: false, playerId: this.playerId });
      }
    }
  }

  async _tickRoomSync() {
    if (this._syncBusy) return;
    if (!this.roomState && !this.raceRoomState) return;
    this._syncBusy = true;
    try {
      if (this.roomState) {
        const pos = this._pendingShooterPos;
        const hit = this._pendingShooterHit;
        this._pendingShooterPos = null;
        this._pendingShooterHit = null;

        const res = await this._api({
          type: 'shooter_sync',
          roomId: this.roomState.roomId,
          pos,
          hit,
          sinceEventId: this._lastEventId
        });
        if (res.ok && res.state) {
          this.roomState = res.state;
          this.emit('room_state', res.state);
          for (const pl of res.state.players || []) {
            if (pl.id !== this.playerId) {
              this.emit('player_moved', pl);
            }
          }
          for (const ev of res.events || []) {
            this._lastEventId = Math.max(this._lastEventId, ev.id);
            this.emit(ev.payload.type, ev.payload);
          }
        }
      } else if (this.raceRoomState) {
        const pos = this._pendingRacePos;
        const combatHit = this._pendingRaceHit;
        this._pendingRacePos = null;
        this._pendingRaceHit = null;

        const res = await this._api({
          type: 'race_sync',
          roomId: this.raceRoomState.roomId,
          pos,
          combatHit,
          sinceEventId: this._lastEventId
        });
        if (res.ok && res.state) {
          const prevLocked = this.raceRoomState.locked;
          this.raceRoomState = res.state;
          this.emit('race_room_state', res.state);
          if (!prevLocked && res.state.locked) {
            this.emit('race_locked_start', res.state);
          }
          for (const r of res.state.racers || []) {
            if (r.id !== this.playerId) {
              this.emit('race_racer_moved', r);
            }
          }
          for (const ev of res.events || []) {
            this._lastEventId = Math.max(this._lastEventId, ev.id);
            this.emit(ev.payload.type, ev.payload);
          }
        }
      }
    } catch {}
    this._syncBusy = false;
  }

  // Unified send() used by ShooterGame & RacingGame for movement/combat updates
  send(payload) {
    if (!payload) return false;
    if (payload.type === 'state_update') {
      this._pendingShooterPos = payload;
      return true;
    }
    if (payload.type === 'hit_player') {
      this._pendingShooterHit = payload;
      return true;
    }
    if (payload.type === 'race_state_update') {
      this._pendingRacePos = payload;
      return true;
    }
    if (payload.type === 'race_combat_hit') {
      this._pendingRaceHit = payload;
      return true;
    }
    if (payload.type === 'get_race_leaderboard') {
      this._refreshDirectory();
      return true;
    }
    return true;
  }

  // --- SHOOTER ROOMS ---
  async createRoom(scene = 'forest', name = '') {
    try {
      this._lastEventId = 0;
      const res = await this._api({ type: 'create_room', scene, name: name || this.playerId });
      if (!res.ok) {
        this.emit('error', { message: res.error || 'Could not create shooter room.' });
        return;
      }
      this.connected = true;
      this.roomState = res.state;
      if (res.shooterRooms) this.shooterRoomsList = res.shooterRooms;
      this.emit('shooter_lobby_entered', { playerId: this.playerId, spawn: res.spawn, state: res.state, isHost: true });
    } catch {
      this.emit('error', { message: 'Could not reach multiplayer relay. Retrying...' });
    }
  }

  async joinRoom(roomId, name = '') {
    try {
      this._lastEventId = 0;
      const res = await this._api({ type: 'join_room', roomId, name: name || this.playerId });
      if (!res.ok) {
        this.emit('error', { message: res.error || 'Room not found.' });
        return;
      }
      this.connected = true;
      this.roomState = res.state;
      if (res.state.started) {
        this.emit('joined_room', { playerId: this.playerId, spawn: res.spawn, state: res.state });
      } else {
        this.emit('shooter_lobby_entered', { playerId: this.playerId, spawn: res.spawn, state: res.state, isHost: false });
      }
    } catch {
      this.emit('error', { message: 'Could not join room. Check connection and try again.' });
    }
  }

  async startShooterMatch() {
    if (!this.roomState) return;
    try {
      const res = await this._api({ type: 'shooter_start_match', roomId: this.roomState.roomId });
      if (res.ok && res.state) {
        this.roomState = res.state;
        this.emit('shooter_started', { state: res.state });
      }
    } catch {}
  }

  async leaveRoom() {
    if (!this.roomState) return;
    const rid = this.roomState.roomId;
    this.roomState = null;
    try {
      await this._api({ type: 'leave_room', roomId: rid });
      this._refreshDirectory();
    } catch {}
  }

  // --- RACING ROOMS ---
  async createRaceRoom({ name, carId, trackId, maxPlayers }) {
    try {
      this._lastEventId = 0;
      const cleanName = (name || this.playerId).trim().slice(0, 18) || this.playerId;
      const res = await this._api({ type: 'race_create_room', name: cleanName, carId, trackId, maxPlayers });
      if (!res.ok) {
        this.emit('error', { message: res.error || 'Could not create race room.' });
        return;
      }
      this.connected = true;
      this.raceRoomState = res.state;
      this.raceRole = 'racer';
      if (res.raceRooms) this.raceRoomsList = res.raceRooms;
      this.emit('race_lobby_entered', { role: 'racer', playerId: this.playerId, state: res.state, isHost: true });
    } catch {
      this.emit('error', { message: 'Could not reach multiplayer relay. Retrying...' });
    }
  }

  async joinRaceRoom({ roomId, name, carId }) {
    try {
      this._lastEventId = 0;
      const cleanName = (name || this.playerId).trim().slice(0, 18) || this.playerId;
      const res = await this._api({ type: 'race_join_room', roomId, name: cleanName, carId });
      if (!res.ok) {
        this.emit('error', { message: res.error || 'Race room not found.' });
        return;
      }
      this.connected = true;
      this.raceRoomState = res.state;
      this.raceRole = res.role;
      // Spectators or already-started/full rooms jump straight into live 3D race!
      if (res.role === 'spectator' || res.state.started || res.state.locked) {
        this.emit('race_joined', { role: res.role, reason: res.reason || '', playerId: this.playerId, state: res.state });
      } else {
        this.emit('race_lobby_entered', { role: 'racer', playerId: this.playerId, state: res.state, isHost: false });
      }
    } catch {
      this.emit('error', { message: 'Could not join race room. Please try again.' });
    }
  }

  async lockAndStartRace() {
    if (!this.raceRoomState) return;
    try {
      const res = await this._api({ type: 'race_lock_and_start', roomId: this.raceRoomState.roomId });
      if (res.ok && res.state) {
        this.raceRoomState = res.state;
        this.emit('race_locked_start', res.state);
      }
    } catch {}
  }

  async leaveRaceRoom() {
    if (!this.raceRoomState) return;
    const rid = this.raceRoomState.roomId;
    this.raceRoomState = null;
    this.raceRole = null;
    try {
      await this._api({ type: 'race_leave_room', roomId: rid });
      this._refreshDirectory();
    } catch {}
  }

  async submitRaceResult(result) {
    try {
      const res = await this._api({ type: 'race_submit_result', ...result });
      if (res.ok && Array.isArray(res.raceLeaderboard)) {
        this._saveLocalLeaderboard(res.raceLeaderboard);
        this.emit('race_leaderboard', this.raceLeaderboard);
      }
    } catch {}
  }
}
