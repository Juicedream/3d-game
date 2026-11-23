// WebSocket Multiplayer Client for Shooter Rooms + FPS Combat Racing Rooms, Spectators & Leaderboard

export class MultiplayerClient {
  constructor() {
    this.ws = null;
    this.connected = false;
    this.playerId = this._generateLocalId();
    this.roomState = null;
    this.raceRoomState = null;
    this.raceRole = null; // 'racer' | 'spectator'
    this.raceRoomsList = [];
    this.raceLeaderboard = this._loadLocalLeaderboard();
    this.handlers = new Map();
  }

  _generateLocalId() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let s = '';
    for (let i = 0; i < 4; i++) s += chars[Math.floor(Math.random() * chars.length)];
    return `OP-${s}`;
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
    this.raceLeaderboard = list;
    try {
      localStorage.setItem('apex_blur_leaderboard_v1', JSON.stringify(list));
    } catch {}
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

  connect() {
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }
    const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
    const url = `${protocol}://${window.location.host}/ws`;

    try {
      this.ws = new WebSocket(url);
    } catch {
      this.connected = false;
      this.emit('status', { connected: false, playerId: this.playerId });
      return;
    }

    this.ws.onopen = () => {
      this.connected = true;
      this.emit('status', { connected: true, playerId: this.playerId });
    };

    this.ws.onmessage = (evt) => {
      let data;
      try {
        data = JSON.parse(evt.data);
      } catch {
        return;
      }
      if (data.type === 'welcome') {
        this.playerId = data.playerId;
        if (Array.isArray(data.raceRooms)) this.raceRoomsList = data.raceRooms;
        if (Array.isArray(data.raceLeaderboard)) this._saveLocalLeaderboard(data.raceLeaderboard);
        this.emit('status', { connected: true, playerId: this.playerId });
      } else if (data.type === 'joined_room') {
        this.roomState = data.state;
        this.emit('joined_room', data);
      } else if (data.type === 'room_state') {
        this.roomState = data.state;
        this.emit('room_state', data.state);
      } else if (data.type === 'race_rooms_list') {
        this.raceRoomsList = data.rooms || [];
        this.emit('race_rooms_list', this.raceRoomsList);
      } else if (data.type === 'race_leaderboard') {
        this._saveLocalLeaderboard(data.leaderboard || []);
        this.emit('race_leaderboard', this.raceLeaderboard);
      } else if (data.type === 'race_joined') {
        this.raceRoomState = data.state;
        this.raceRole = data.role;
        this.emit('race_joined', data);
      } else if (data.type === 'race_room_state' || data.type === 'race_locked_start') {
        this.raceRoomState = data.state;
        this.emit(data.type, data.state);
      } else {
        this.emit(data.type, data);
      }
    };

    this.ws.onclose = () => {
      this.connected = false;
      this.emit('status', { connected: false, playerId: this.playerId });
      setTimeout(() => this.connect(), 3500);
    };

    this.ws.onerror = () => {
      this.connected = false;
    };
  }

  send(payload) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(payload));
      return true;
    }
    return false;
  }

  // --- Shooter Room Helpers ---
  createRoom(scene = 'forest', name = '') {
    if (!this.send({ type: 'create_room', scene, name: name || this.playerId })) {
      const localRoomId = `RM-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
      const state = {
        roomId: localRoomId,
        scene,
        level: 1,
        routingLabel: '1v0 Local Arena + Bots',
        timeLeft: 300,
        players: [{
          id: this.playerId, name: name || this.playerId, team: 'ALPHA',
          x: -20, y: 1.8, z: -20, yaw: 0, pitch: 0,
          hp: 100, maxHp: 100, kills: 0, deaths: 0,
          weapon: 'rifle', sliding: false, alive: true
        }]
      };
      this.roomState = state;
      this.emit('joined_room', { playerId: this.playerId, spawn: { x: -20, y: 1.8, z: -20 }, state });
    }
  }

  joinRoom(roomId, name = '') {
    if (!this.send({ type: 'join_room', roomId, name: name || this.playerId })) {
      this.emit('error', { message: 'Multiplayer server offline. Start server with npm start to join rooms.' });
    }
  }

  leaveRoom() {
    this.send({ type: 'leave_room' });
    this.roomState = null;
  }

  // --- Racing Room Helpers ---
  createRaceRoom({ name, carId, trackId, maxPlayers }) {
    const cleanName = (name || this.playerId).trim().slice(0, 18) || this.playerId;
    if (!this.send({ type: 'race_create_room', name: cleanName, carId, trackId, maxPlayers })) {
      const laps = { asia: 4, nigeria: 6, morocco: 4, egypt: 8 }[trackId] || 4;
      const state = {
        roomId: `RC-${Math.random().toString(36).substring(2, 6).toUpperCase()}`,
        hostId: this.playerId,
        trackId,
        totalLaps: laps,
        maxPlayers,
        locked: true,
        started: true,
        racerCount: 1,
        spectatorCount: 0,
        racers: [{
          id: this.playerId, name: cleanName, carId, gridIndex: 0,
          x: 0, y: 0, z: 0, yaw: 0, speed: 0, lap: 1, progress: 0,
          hp: 100, alive: true, drifting: false, nitro: false, takedowns: 0
        }]
      };
      this.raceRoomState = state;
      this.raceRole = 'racer';
      this.emit('race_joined', { role: 'racer', playerId: this.playerId, state });
    }
  }

  joinRaceRoom({ roomId, name, carId }) {
    const cleanName = (name || this.playerId).trim().slice(0, 18) || this.playerId;
    if (!this.send({ type: 'race_join_room', roomId, name: cleanName, carId })) {
      this.emit('error', { message: 'Multiplayer server offline. Cannot join remote Race Room.' });
    }
  }

  lockAndStartRace() {
    this.send({ type: 'race_lock_and_start' });
  }

  leaveRaceRoom() {
    this.send({ type: 'race_leave_room' });
    this.raceRoomState = null;
    this.raceRole = null;
  }

  submitRaceResult(result) {
    if (!this.send({ type: 'race_submit_result', ...result }) && result.won) {
      const list = [...this.raceLeaderboard];
      list.push({
        name: result.name,
        carId: result.carId,
        trackId: result.trackId,
        timeSec: Number(result.timeSec.toFixed(2)),
        takedowns: result.takedowns || 0,
        trophies: 1,
        date: new Date().toLocaleDateString()
      });
      list.sort((a, b) => b.trophies - a.trophies || a.timeSec - b.timeSec);
      this._saveLocalLeaderboard(list.slice(0, 25));
    }
  }
}
