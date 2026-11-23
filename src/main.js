import { audio } from './audio/AudioEngine.js';
import { MultiplayerClient } from './network/MultiplayerClient.js';
import { ShooterGame } from './games/ShooterGame.js';
import { SamuraiGame } from './games/SamuraiGame.js';
import { RacingGame, RACE_TRACKS } from './games/RacingGame.js';
import { CAR_CATALOG, getCarSpec } from './engine/CarMesh.js';
import { CarShowroom } from './ui/CarShowroom.js';
import { renderComicIntro } from './ui/ComicIntro.js';
import { MobileControls } from './ui/MobileControls.js';

const canvasRoot = document.getElementById('game-canvas-root');
const uiRoot = document.getElementById('ui-root');
const mobileRoot = document.getElementById('mobile-controls-root');
const mobileControls = new MobileControls(mobileRoot);

if (mobileControls.enabled) {
  document.body.classList.add('touch-active');
}

const mp = new MultiplayerClient();
mp.connect();

let activeGame = null;
let activeGameType = null; // 'shooter' | 'samurai' | 'racing'
let activeHubTab = 'racing'; // 'racing' | 'shooter' | 'samurai'
let carShowroom = null;

// Waiting Lobby state (when Hosting or waiting before launch!)
let waitingLobby = null; // { kind: 'racing'|'shooter', isHost, spawn, state }

let selectedScene = 'forest';
let playerDisplayName = localStorage.getItem('apex_blur_driver_name') || '';
let selectedTrackId = 'asia';
let selectedCarId = 'valkyrie';
let selectedMaxPlayers = 4;
let showLeaderboardModal = false;
let elderDialogueData = null;

let hubError = '';
let comboTimer = null;
let currentComboMsg = '';
let currentPrompt = '';
let killFeed = [];
let latestHud = null;
let isPaused = false;
let gameOverData = null;
let raceFinishData = null;
let hitMarkerActive = false;
let hitMarkerTimer = null;
let damageFlashActive = false;
let damageFlashTimer = null;

function loadApocHighScore() {
  try {
    const raw = localStorage.getItem('tactical_strike_apocalypse_highscore_v1');
    if (raw) return JSON.parse(raw);
  } catch {}
  return { bestLevel: 1, bestKills: 0 };
}

function formatOrdinal(n) {
  if (!n) return '-';
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

function formatSec(sec) {
  const m = Math.floor(sec / 60);
  const s = (sec % 60).toFixed(1).padStart(4, '0');
  return `${String(m).padStart(2, '0')}:${s}`;
}

function triggerHitMarker() {
  hitMarkerActive = true;
  clearTimeout(hitMarkerTimer);
  const el = uiRoot.querySelector('.hitmarker');
  if (el) el.classList.add('show');
  hitMarkerTimer = setTimeout(() => {
    hitMarkerActive = false;
    const el2 = uiRoot.querySelector('.hitmarker');
    if (el2) el2.classList.remove('show');
  }, 140);
}

function triggerDamageFlash() {
  damageFlashActive = true;
  clearTimeout(damageFlashTimer);
  const el = uiRoot.querySelector('.damage-vignette');
  if (el) el.classList.add('flash');
  damageFlashTimer = setTimeout(() => {
    damageFlashActive = false;
    const el2 = uiRoot.querySelector('.damage-vignette');
    if (el2) el2.classList.remove('flash');
  }, 220);
}

function disposeShowroom() {
  if (carShowroom) {
    carShowroom.dispose();
    carShowroom = null;
  }
}

window.addEventListener('keydown', (e) => {
  if (e.code === 'KeyM' && document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'SELECT') {
    audio.toggleMute();
    if (!activeGame) renderHub();
    else renderInGameOverlay();
  }
});

// --- MULTIPLAYER CLOUD EVENTS ---

mp.on('status', () => {
  if (!activeGame) {
    const pill = uiRoot.querySelector('#hub-id-pill');
    if (pill) {
      pill.innerHTML = `<span class="dot ${mp.connected ? '' : 'offline'}"></span> ${mp.connected ? 'ONLINE' : 'CONNECTING'} • ID: <span>${mp.playerId}</span>`;
    }
  }
});

mp.on('race_rooms_list', () => {
  if (!activeGame && !waitingLobby && activeHubTab === 'racing') refreshRaceDropdown();
});

mp.on('shooter_rooms_list', () => {
  if (!activeGame && !waitingLobby && activeHubTab === 'shooter') refreshShooterDropdown();
});

mp.on('race_leaderboard', () => {
  if (!activeGame && showLeaderboardModal) renderHub();
});

mp.on('error', ({ message }) => {
  hubError = message;
  if (!activeGame) renderHub();
});

// Host / Joiner enters Waiting Lobby (shows only Host + Waiting for others + Enter Game Now button!)
mp.on('shooter_lobby_entered', ({ spawn, state, isHost }) => {
  hubError = '';
  waitingLobby = { kind: 'shooter', isHost, spawn, state };
  renderHub();
});

mp.on('race_lobby_entered', ({ state, isHost }) => {
  hubError = '';
  waitingLobby = { kind: 'racing', isHost, state };
  renderHub();
});

// Live updates while inside Waiting Lobby
mp.on('room_state', (state) => {
  if (waitingLobby && waitingLobby.kind === 'shooter') {
    waitingLobby.state = state;
    if (state.started) {
      const sp = waitingLobby.spawn;
      waitingLobby = null;
      launchShooter('arena', state.scene, sp);
    } else {
      renderHub();
    }
  }
});

mp.on('shooter_started', ({ state }) => {
  if (waitingLobby && waitingLobby.kind === 'shooter') {
    const sp = waitingLobby.spawn;
    waitingLobby = null;
    launchShooter('arena', state.scene, sp);
  }
});

mp.on('race_room_state', (state) => {
  if (waitingLobby && waitingLobby.kind === 'racing') {
    waitingLobby.state = state;
    if (state.started || state.locked) {
      waitingLobby = null;
      launchRacing({
        trackId: state.trackId,
        playerName: playerDisplayName || mp.playerId,
        carId: selectedCarId,
        role: 'racer',
        roomState: state,
        joinNotice: ''
      });
    } else {
      renderHub();
    }
  }
});

mp.on('race_locked_start', (state) => {
  if (waitingLobby && waitingLobby.kind === 'racing') {
    waitingLobby = null;
    launchRacing({
      trackId: state.trackId,
      playerName: playerDisplayName || mp.playerId,
      carId: selectedCarId,
      role: 'racer',
      roomState: state,
      joinNotice: ''
    });
  }
});

mp.on('joined_room', ({ spawn, state }) => {
  hubError = '';
  waitingLobby = null;
  launchShooter('arena', state.scene, spawn);
});

mp.on('race_joined', ({ role, reason, state }) => {
  hubError = '';
  waitingLobby = null;
  launchRacing({
    trackId: state.trackId,
    playerName: playerDisplayName || mp.playerId,
    carId: selectedCarId,
    role,
    roomState: state,
    joinNotice: reason || ''
  });
});

// --- LIVE DROPDOWN UPDATERS (ROOM ID + HOST NAME FOR OTHER DEVICES!) ---

function refreshRaceDropdown() {
  const sel = uiRoot.querySelector('#race-rooms-dropdown');
  if (!sel) return;
  const prev = sel.value;
  const rooms = mp.raceRoomsList || [];
  if (rooms.length === 0) {
    sel.innerHTML = `<option value="">No active hosted races yet — Host one above!</option>`;
    return;
  }
  sel.innerHTML = `
    <option value="">— Select Hosted Race Room (${rooms.length} Live) —</option>
    ${rooms.map(rm => `
      <option value="${rm.roomId}">
        ${rm.roomId} — Host: ${rm.hostName || 'Host'} | ${rm.trackId.toUpperCase()} (${rm.totalLaps}L) | ${rm.racerCount}/${rm.maxPlayers} ${rm.locked ? '🔒 [SPECTATE LIVE]' : '🟢 [OPEN]'}
      </option>
    `).join('')}
  `;
  if (prev && rooms.some(r => r.roomId === prev)) sel.value = prev;
}

function refreshShooterDropdown() {
  const sel = uiRoot.querySelector('#shooter-rooms-dropdown');
  if (!sel) return;
  const prev = sel.value;
  const rooms = mp.shooterRoomsList || [];
  if (rooms.length === 0) {
    sel.innerHTML = `<option value="">No active shooter rooms yet — Host one above!</option>`;
    return;
  }
  sel.innerHTML = `
    <option value="">— Select Hosted Shooter Room (${rooms.length} Live) —</option>
    ${rooms.map(rm => `
      <option value="${rm.roomId}">
        ${rm.roomId} — Host: ${rm.hostName || 'Host'} | ${rm.scene.toUpperCase()} | ${rm.playerCount} Player${rm.playerCount === 1 ? '' : 's'} ${rm.started ? '[IN GAME]' : '[WAITING]'}
      </option>
    `).join('')}
  `;
  if (prev && rooms.some(r => r.roomId === prev)) sel.value = prev;
}

function updateCarInfoUi() {
  const car = getCarSpec(selectedCarId);
  const nameEl = uiRoot.querySelector('#showroom-car-name');
  const tagEl = uiRoot.querySelector('#showroom-car-tag');
  const barsEl = uiRoot.querySelector('#showroom-car-bars');
  const dotsEl = uiRoot.querySelector('#showroom-dots');
  if (nameEl) nameEl.textContent = car.name;
  if (tagEl) tagEl.textContent = car.tagline;
  if (barsEl) {
    const s = car.stats;
    barsEl.innerHTML = `
      <div class="spec-item"><div class="spec-head"><span>TOP SPEED</span><span>${s.speed}</span></div><div class="spec-track"><div class="spec-fill" style="width:${s.speed}%"></div></div></div>
      <div class="spec-item"><div class="spec-head"><span>ACCELERATION</span><span>${s.accel}</span></div><div class="spec-track"><div class="spec-fill" style="width:${s.accel}%"></div></div></div>
      <div class="spec-item"><div class="spec-head"><span>DRIFT HANDLING</span><span>${s.drift}</span></div><div class="spec-track"><div class="spec-fill" style="width:${s.drift}%"></div></div></div>
      <div class="spec-item"><div class="spec-head"><span>COMBAT ARMOR</span><span>${s.armor}</span></div><div class="spec-track"><div class="spec-fill" style="width:${s.armor}%"></div></div></div>
    `;
  }
  if (dotsEl) {
    dotsEl.querySelectorAll('.showroom-dot').forEach(dot => {
      dot.classList.toggle('active', dot.dataset.dotCar === selectedCarId);
    });
  }
}

// --- MAIN THREE-IN-ONE AAA PLATFORM HUB ---

function renderHub() {
  disposeShowroom();
  const hs = loadApocHighScore();
  const scenes = [
    { id: 'forest', label: '🌲 Forest Outpost' },
    { id: 'desert', label: '🏜️ Desert High Hills' },
    { id: 'building', label: '🏗️ Uncompleted Building' },
    { id: 'city', label: '🏙️ Urban City' }
  ];
  const tracks = Object.values(RACE_TRACKS);
  const currentCar = getCarSpec(selectedCarId);

  // HOST WAITING ROOM OVERLAY (Shows Host Only + Waiting for Others + Option to Enter Game Immediately!)
  let lobbyModalHtml = '';
  if (waitingLobby) {
    const st = waitingLobby.state;
    const isRace = waitingLobby.kind === 'racing';
    const members = isRace ? (st.racers || []) : (st.players || []);
    const title = isRace ? `🏎️ RACE LOBBY — ${st.trackId.toUpperCase()} (${st.totalLaps} LAPS)` : `🔫 SHOOTER LOBBY — ${st.scene.toUpperCase()}`;

    lobbyModalHtml = `
      <div class="modal-backdrop">
        <div class="modal-card">
          <div style="display:flex; justify-content:space-between; align-items:center;">
            <div class="modal-title" style="color:${isRace ? '#f9a8d4' : '#38bdf8'};">${title}</div>
            <span class="id-pill">ROOM: ${st.roomId}</span>
          </div>

          <div class="waiting-pulse">
            <span class="dot"></span>
            <span>
              HOST: <strong>${st.hostName || 'Host'}</strong> •
              ${members.length === 1
                ? 'Only Host in room — Waiting for other players to pick this room from the dropdown...'
                : `${members.length} player${members.length > 1 ? 's' : ''} connected!${isRace ? ` (Max ${st.maxPlayers} — locks automatically when full)` : ''}`}
            </span>
          </div>

          <div class="lobby-roster">
            <div class="section-label" style="margin-bottom:2px;">PLAYERS IN ROOM (${members.length}${isRace ? ` / ${st.maxPlayers}` : ''})</div>
            ${members.map(m => `
              <div class="lobby-player-row">
                <span>${m.id === st.hostId ? '👑 ' : '🎮 '}${m.name} ${m.id === mp.playerId ? '(You)' : ''}</span>
                <span style="color:#94a3b8; font-size:0.76rem;">${isRace ? getCarSpec(m.carId).name : `TEAM ${m.team}`}</span>
              </div>
            `).join('')}
          </div>

          <p style="font-size:0.8rem; color:#94a3b8;">
            Others on their own devices will see <strong>"${st.roomId} — Host: ${st.hostName || 'Host'}"</strong> in the Room Dropdown.
            ${waitingLobby.isHost ? 'You can wait for them OR enter the game right now without waiting!' : 'Waiting for the Host to launch the match...'}
          </p>

          <div class="btn-row">
            ${waitingLobby.isHost ? `
              <button class="btn ${isRace ? 'btn-pink' : 'btn-primary'}" id="lobby-enter-now">
                ▶ Enter Game Now ${members.length === 1 ? '(Without Waiting)' : `(${members.length} Players)`}
              </button>
            ` : ''}
            <button class="btn btn-secondary" id="lobby-leave">✕ Leave Lobby</button>
          </div>
        </div>
      </div>
    `;
  }

  const lbModalHtml = showLeaderboardModal ? `
    <div class="modal-backdrop">
      <div class="modal-card">
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <div class="modal-title" style="color:#fbbf24;">🏆 APEX BLUR GLOBAL LEADERBOARD</div>
          <button class="btn btn-secondary" id="close-lb">✕ Close</button>
        </div>
        <table class="lb-table">
          <thead>
            <tr><th>#</th><th>Driver</th><th>Track</th><th>Best Time</th><th>Takedowns</th><th>Trophies</th></tr>
          </thead>
          <tbody>
            ${(mp.raceLeaderboard || []).map((row, idx) => `
              <tr>
                <td><strong>${idx + 1}</strong></td>
                <td><strong>${row.name}</strong></td>
                <td>${RACE_TRACKS[row.trackId]?.flag || ''} ${row.trackId.toUpperCase()}</td>
                <td>${formatSec(row.timeSec)}</td>
                <td>${row.takedowns || 0}</td>
                <td style="color:#fbbf24; font-weight:900;">🏆 ${row.trophies || 1}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>
  ` : '';

  let stageHtml = '';
  if (activeHubTab === 'racing') {
    stageHtml = `
      <div class="hub-stage">
        <div class="stage-panel">
          <div style="display:flex; justify-content:space-between; align-items:center;">
            <span class="card-badge badge-pink">3D Interactive Garage • Roll &amp; Choose</span>
            <span style="font-size:0.74rem; color:#94a3b8; font-weight:700;">4 Combat Supercars</span>
          </div>
          <div class="showroom-wrap">
            <div class="showroom-canvas-host" id="car-showroom-host"></div>
            <div class="showroom-overlay-top">
              <div>
                <div id="showroom-car-name" style="font-size:1.15rem; font-weight:900;">${currentCar.name}</div>
                <div id="showroom-car-tag" style="font-size:0.75rem; color:#f9a8d4; font-weight:700;">${currentCar.tagline}</div>
              </div>
              <div class="showroom-drag-hint">🖱️ Drag to Spin 360°</div>
            </div>
            <button class="showroom-nav-btn showroom-prev" id="car-prev">◀</button>
            <button class="showroom-nav-btn showroom-next" id="car-next">▶</button>
          </div>
          <div class="showroom-dots" id="showroom-dots">
            ${CAR_CATALOG.map(c => `<button class="showroom-dot ${c.id === selectedCarId ? 'active' : ''}" data-dot-car="${c.id}" title="${c.name}"></button>`).join('')}
          </div>
          <div class="car-spec-bars" id="showroom-car-bars"></div>
        </div>

        <div class="stage-panel">
          <div>
            <div class="card-title">APEX BLUR 3D RACING</div>
            <p class="card-desc" style="margin-top:4px;">
              Race inside the <strong>First-Person Cockpit</strong> or <strong>Car View [V]</strong> across crazy roads,
              <strong>hidden shortcuts</strong>, drift &amp; nitro, road Special Ops &amp; <strong>Blur slow-mo takedowns</strong>.
            </p>
          </div>

          <div class="room-row">
            <input class="room-input" id="race-name-input" placeholder="ENTER YOUR NAME" maxlength="16" value="${playerDisplayName}" />
            <select class="room-input" id="race-max-select" style="flex:0.65; cursor:pointer;">
              ${[1, 2, 3, 4, 6, 8].map(n => `<option value="${n}" ${selectedMaxPlayers === n ? 'selected' : ''}>Max ${n} Racer${n > 1 ? 's' : ''}</option>`).join('')}
            </select>
          </div>

          <div>
            <div class="section-label">SELECT INTERNATIONAL CIRCUIT &amp; LAPS</div>
            <div class="scene-selector">
              ${tracks.map(t => `
                <button class="scene-chip ${selectedTrackId === t.id ? 'active-pink' : ''}" data-track="${t.id}">
                  ${t.flag} ${t.id.toUpperCase()} • <strong>${t.laps} Laps</strong>
                </button>
              `).join('')}
            </div>
          </div>

          <div class="room-box">
            <div class="btn-row">
              <button class="btn btn-pink" id="btn-create-race">🏁 Host Race Room</button>
            </div>
            <div class="section-label" style="margin-bottom:0; margin-top:4px;">JOIN / SPECTATE LIVE HOSTED RACES</div>
            <div class="room-row">
              <select class="room-input" id="race-rooms-dropdown" style="cursor:pointer;"></select>
              <button class="btn btn-secondary" id="btn-join-race">Join / Watch</button>
            </div>
          </div>
        </div>
      </div>
    `;
  } else if (activeHubTab === 'shooter') {
    stageHtml = `
      <div class="hub-stage">
        <div class="stage-panel">
          <div class="hero-art-card hero-shooter">
            <span class="card-badge badge-blue">FPS / TPS Combat + Zombie Survival</span>
            <div class="card-title">TACTICAL STRIKE 3D</div>
            <p class="card-desc">
              Switch live between <strong>First-Person</strong> &amp; <strong>Third-Person [V]</strong>.
              Shoot, throw bouncing bombs, punch, tactical slide, and climb cover across 4 arenas — or survive dark-room zombie waves with your torch!
            </p>
          </div>
          <ul class="feature-list">
            <li>🔫 Rifle, Shotgun &amp; Pistol</li>
            <li>💣 Bouncing Frag Bombs [G]</li>
            <li>🎥 Live 1st / 3rd Person [V]</li>
            <li>🔦 Dynamic Dark-Room Torch [F]</li>
            <li>⚖️ Auto-Teams: 1v1 / 2v1 / 4v1</li>
            <li>❤️ 3-Life Apocalypse High Score</li>
          </ul>
        </div>

        <div class="stage-panel">
          <div class="room-row">
            <input class="room-input" id="shooter-name-input" placeholder="ENTER YOUR CALLSIGN / NAME" maxlength="16" value="${playerDisplayName}" />
          </div>
          <div>
            <div class="section-label">SELECT MULTIPLAYER ARENA SCENE</div>
            <div class="scene-selector">
              ${scenes.map(s => `
                <button class="scene-chip ${selectedScene === s.id ? 'active' : ''}" data-scene="${s.id}">${s.label}</button>
              `).join('')}
            </div>
          </div>

          <div class="room-box">
            <div class="btn-row">
              <button class="btn btn-primary" id="btn-create-room">⚔️ Host Arena Room</button>
            </div>
            <div class="section-label" style="margin-bottom:0; margin-top:4px;">JOIN LIVE HOSTED SHOOTER ROOM</div>
            <div class="room-row">
              <select class="room-input" id="shooter-rooms-dropdown" style="cursor:pointer;"></select>
              <button class="btn btn-secondary" id="btn-join-room">Join Room</button>
            </div>
          </div>

          <div class="apoc-banner">
            <div>
              <div style="font-weight:900; color:#fda4af; font-size:0.96rem;">☣️ SOLO ZOMBIE APOCALYPSE</div>
              <div style="font-size:0.78rem; color:#cbd5e1; margin-top:3px;">
                Dark room • Front &amp; rear breaches • Torch [F] • 3 Lives<br/>
                Record: <strong>Level ${hs.bestLevel}</strong> (${hs.bestKills} zombies eliminated)
              </div>
            </div>
            <button class="btn btn-danger" id="btn-play-apoc">Survive</button>
          </div>
        </div>
      </div>
    `;
  } else {
    stageHtml = `
      <div class="hub-stage">
        <div class="stage-panel">
          <div class="hero-art-card hero-samurai">
            <span class="card-badge badge-gold">Multi-Realm 3D Open-World Adventure</span>
            <div class="card-title">RONIN OF THE WILD</div>
            <p class="card-desc">
              Begin in the Ancient Wolf Forest, disguise yourself to reach the Imperial Clan Elders, then choose your portal:
              <strong>Return to the Shipwreck Boat to save your parents</strong> OR plunge into the <strong>Astra Fiery Realm</strong>,
              ascend to <strong>Atisashi City in the Sky</strong>, awaken the <strong>Solar Eye Laser [X]</strong>, and defeat the <strong>Mighty Dragon Emperor</strong>!
            </p>
          </div>
          <ul class="feature-list">
            <li>🌀 Falling-Through-Portal Cinematics</li>
            <li>⛵ Shipwreck Boat Rescue Path</li>
            <li>🔥 Astra Fiery Land of No Return</li>
            <li>☁️ Atisashi Sky City &amp; Moving Blocks</li>
            <li>👁️⚡ Solar Eye Laser &amp; Dragon Boss</li>
            <li>💾 Saved Checkpoints &amp; Random Missions</li>
          </ul>
        </div>

        <div class="stage-panel" style="justify-content:center;">
          <div class="section-label">EPIC STORY PATHS &amp; CHECKPOINTS</div>
          <div class="room-box" style="gap:12px;">
            <div style="font-size:0.84rem; color:#e2e8f0; line-height:1.58;">
              <strong>• Speak to the Clan Elders [F]:</strong> Opens two branching 3D Portals instead of ending the game.<br/>
              <strong>• Path 1 — The Beginning:</strong> Fall onto the storm-tossed boat, save your parents &amp; battle the Emperor.<br/>
              <strong>• Path 2 — Astra Realm:</strong> Fight strange creatures in the fiery abyss, escape to <strong>Atisashi Sky City</strong> (jump disconnected moving blocks, dodge obstacles), unlock the <strong>Eye Laser [X]</strong> &amp; slay the <strong>Dragon Emperor</strong>!<br/>
              <strong>• Dynamic Missions &amp; Leveling:</strong> Complete randomized missions &amp; bosses to scale levels and earn rewards.
            </div>
            <div class="btn-row">
              <button class="btn btn-gold" id="btn-play-samurai">📖 Play Story Adventure (With Comic Intro)</button>
            </div>
            <button class="btn btn-ghost" id="btn-play-samurai-skip">▶ Continue / Enter 3D World</button>
          </div>
        </div>
      </div>
    `;
  }

  uiRoot.innerHTML = `
    <div class="hub-screen">
      <div class="hub-header">
        <div>
          <div class="brand-title">AEGIS, RONIN &amp; APEX BLUR 3D</div>
          <div class="brand-sub">Three-in-One 3D Web Game Platform • Cloud Multiplayer Ready</div>
        </div>
        <div class="hub-status-bar">
          <div class="id-pill" id="hub-id-pill">
            <span class="dot ${mp.connected ? '' : 'offline'}"></span>
            ${mp.connected ? 'ONLINE' : 'CONNECTING'} • ID: <span>${mp.playerId}</span>
          </div>
          <button class="btn btn-gold" id="hub-lb-btn">🏆 Leaderboard</button>
          <button class="btn btn-secondary" id="hub-touch-btn">
            ${mobileControls.enabled ? '📱 Touch: ON' : '📱 Touch: OFF'}
          </button>
          <button class="btn btn-secondary" id="hub-mute-btn">
            ${audio.muted ? '🔇 Muted [M]' : '🔊 Sound [M]'}
          </button>
        </div>
      </div>

      <div class="hub-nav-tabs">
        <button class="hub-tab ${activeHubTab === 'racing' ? 'active-racing' : ''}" data-hub-tab="racing">
          <div>
            <div class="hub-tab-title">🏎️ APEX BLUR 3D</div>
            <div class="hub-tab-sub">FPS Cockpit Combat Racing • 4 Countries</div>
          </div>
          <span class="card-badge badge-pink">3D GARAGE</span>
        </button>
        <button class="hub-tab ${activeHubTab === 'shooter' ? 'active-shooter' : ''}" data-hub-tab="shooter">
          <div>
            <div class="hub-tab-title">🔫 TACTICAL STRIKE 3D</div>
            <div class="hub-tab-sub">Multiplayer FPS/TPS + Zombie Apocalypse</div>
          </div>
          <span class="card-badge badge-blue">4 ARENAS</span>
        </button>
        <button class="hub-tab ${activeHubTab === 'samurai' ? 'active-samurai' : ''}" data-hub-tab="samurai">
          <div>
            <div class="hub-tab-title">⚔️ RONIN OF THE WILD</div>
            <div class="hub-tab-sub">Portals, Astra Sky City &amp; Dragon Boss</div>
          </div>
          <span class="card-badge badge-gold">EPIC QUEST</span>
        </button>
      </div>

      ${hubError ? `<div class="toast-err" style="text-align:center;">⚠️ ${hubError}</div>` : ''}
      ${stageHtml}

      <div class="hub-footer">
        <span>Mouse + Keyboard • Pause with <strong>[P]</strong> or <strong>[ESC]</strong> • Mute with <strong>[M]</strong></span>
        <span>Vercel Cloud Multiplayer Relay • Live Room Dropdowns • Multi-Realm Samurai RPG</span>
      </div>
    </div>
    ${lobbyModalHtml}
    ${lbModalHtml}
  `;

  // Bind Lobby Modal Controls
  const lobbyEnterBtn = uiRoot.querySelector('#lobby-enter-now');
  if (lobbyEnterBtn && waitingLobby) {
    lobbyEnterBtn.onclick = () => {
      audio.init();
      if (waitingLobby.kind === 'racing') {
        mp.lockAndStartRace();
      } else {
        mp.startShooterMatch();
      }
    };
  }
  const lobbyLeaveBtn = uiRoot.querySelector('#lobby-leave');
  if (lobbyLeaveBtn && waitingLobby) {
    lobbyLeaveBtn.onclick = () => {
      if (waitingLobby.kind === 'racing') mp.leaveRaceRoom();
      else mp.leaveRoom();
      waitingLobby = null;
      renderHub();
    };
  }

  // Bind Header & Tabs
  uiRoot.querySelector('#hub-mute-btn').onclick = () => { audio.init(); audio.toggleMute(); renderHub(); };
  uiRoot.querySelector('#hub-touch-btn').onclick = () => {
    mobileControls.setForceEnabled(!mobileControls.enabled);
    document.body.classList.toggle('touch-active', mobileControls.enabled);
    renderHub();
  };
  uiRoot.querySelector('#hub-lb-btn').onclick = () => { showLeaderboardModal = true; mp.send({ type: 'get_race_leaderboard' }); renderHub(); };
  const closeLb = uiRoot.querySelector('#close-lb');
  if (closeLb) closeLb.onclick = () => { showLeaderboardModal = false; renderHub(); };

  uiRoot.querySelectorAll('[data-hub-tab]').forEach(btn => {
    btn.onclick = () => { activeHubTab = btn.dataset.hubTab; hubError = ''; renderHub(); };
  });

  if (activeHubTab === 'racing') {
    const mount = uiRoot.querySelector('#car-showroom-host');
    if (mount && !waitingLobby) {
      carShowroom = new CarShowroom(mount, selectedCarId);
      updateCarInfoUi();
    }
    const stepCar = (dir) => {
      const idx = CAR_CATALOG.findIndex(c => c.id === selectedCarId);
      selectedCarId = CAR_CATALOG[(idx + dir + CAR_CATALOG.length) % CAR_CATALOG.length].id;
      carShowroom?.selectCar(selectedCarId, dir);
      audio.playFlashlightClick();
      updateCarInfoUi();
    };
    const prevBtn = uiRoot.querySelector('#car-prev');
    const nextBtn = uiRoot.querySelector('#car-next');
    if (prevBtn) prevBtn.onclick = () => stepCar(-1);
    if (nextBtn) nextBtn.onclick = () => stepCar(1);
    uiRoot.querySelectorAll('[data-dot-car]').forEach(dot => {
      dot.onclick = () => {
        const curIdx = CAR_CATALOG.findIndex(c => c.id === selectedCarId);
        const targetIdx = CAR_CATALOG.findIndex(c => c.id === dot.dataset.dotCar);
        selectedCarId = dot.dataset.dotCar;
        carShowroom?.selectCar(selectedCarId, targetIdx >= curIdx ? 1 : -1);
        audio.playFlashlightClick();
        updateCarInfoUi();
      };
    });

    const nameInp = uiRoot.querySelector('#race-name-input');
    if (nameInp) nameInp.oninput = () => {
      playerDisplayName = nameInp.value;
      localStorage.setItem('apex_blur_driver_name', playerDisplayName);
    };
    const maxSel = uiRoot.querySelector('#race-max-select');
    if (maxSel) maxSel.onchange = (e) => { selectedMaxPlayers = Number(e.target.value) || 4; };

    uiRoot.querySelectorAll('[data-track]').forEach(btn => {
      btn.onclick = () => {
        selectedTrackId = btn.dataset.track;
        uiRoot.querySelectorAll('[data-track]').forEach(b => b.classList.toggle('active-pink', b.dataset.track === selectedTrackId));
      };
    });

    uiRoot.querySelector('#btn-create-race').onclick = () => {
      audio.init();
      hubError = '';
      mp.createRaceRoom({
        name: (playerDisplayName || mp.playerId).trim(),
        carId: selectedCarId,
        trackId: selectedTrackId,
        maxPlayers: selectedMaxPlayers
      });
    };

    refreshRaceDropdown();
    uiRoot.querySelector('#btn-join-race').onclick = () => {
      audio.init();
      const selVal = uiRoot.querySelector('#race-rooms-dropdown')?.value;
      if (!selVal) {
        hubError = 'Select a hosted race room from the dropdown first (or host one above!).';
        renderHub();
        return;
      }
      hubError = '';
      mp.joinRaceRoom({ roomId: selVal, name: (playerDisplayName || mp.playerId).trim(), carId: selectedCarId });
    };
  } else if (activeHubTab === 'shooter') {
    const nameInp = uiRoot.querySelector('#shooter-name-input');
    if (nameInp) nameInp.oninput = () => {
      playerDisplayName = nameInp.value;
      localStorage.setItem('apex_blur_driver_name', playerDisplayName);
    };
    uiRoot.querySelectorAll('.scene-chip[data-scene]').forEach(btn => {
      btn.onclick = () => { selectedScene = btn.dataset.scene; renderHub(); };
    });
    uiRoot.querySelector('#btn-create-room').onclick = () => {
      audio.init();
      hubError = '';
      mp.createRoom(selectedScene, (playerDisplayName || mp.playerId).trim());
    };
    refreshShooterDropdown();
    uiRoot.querySelector('#btn-join-room').onclick = () => {
      audio.init();
      const selVal = uiRoot.querySelector('#shooter-rooms-dropdown')?.value;
      if (!selVal) {
        hubError = 'Select a hosted shooter room from the dropdown first.';
        renderHub();
        return;
      }
      hubError = '';
      mp.joinRoom(selVal, (playerDisplayName || mp.playerId).trim());
    };
    uiRoot.querySelector('#btn-play-apoc').onclick = () => {
      audio.init();
      launchShooter('apocalypse', 'apocalypse', null);
    };
  } else {
    uiRoot.querySelector('#btn-play-samurai').onclick = () => {
      audio.init();
      audio.playMusic('samurai');
      disposeShowroom();
      uiRoot.innerHTML = '';
      renderComicIntro(uiRoot, () => launchSamurai());
    };
    uiRoot.querySelector('#btn-play-samurai-skip').onclick = () => {
      audio.init();
      launchSamurai();
    };
  }
}

// --- GAME LAUNCHERS ---

function cleanupActiveGame() {
  disposeShowroom();
  mobileControls.unmount();
  if (activeGame) {
    activeGame.dispose();
    activeGame = null;
  }
  activeGameType = null;
  latestHud = null;
  isPaused = false;
  gameOverData = null;
  raceFinishData = null;
  elderDialogueData = null;
  killFeed = [];
  currentComboMsg = '';
  currentPrompt = '';
}

function showComboBanner(msg) {
  currentComboMsg = msg;
  clearTimeout(comboTimer);
  renderInGameOverlay();
  comboTimer = setTimeout(() => {
    currentComboMsg = '';
    renderInGameOverlay();
  }, 2800);
}

function launchShooter(mode, sceneName, spawn) {
  cleanupActiveGame();
  activeGameType = 'shooter';
  activeGame = new ShooterGame(canvasRoot, {
    onHudUpdate: (hud) => { latestHud = hud; renderInGameOverlay(); },
    onCombo: (msg) => showComboBanner(msg),
    onHitMarker: () => triggerHitMarker(),
    onDamageFlash: () => triggerDamageFlash(),
    onKillFeed: (line) => {
      killFeed.unshift(line);
      if (killFeed.length > 4) killFeed.pop();
      renderInGameOverlay();
    },
    onPauseChange: (paused) => { isPaused = paused; renderInGameOverlay(); },
    onGameOver: (data) => { gameOverData = data; renderInGameOverlay(); }
  }, mp);

  activeGame.start({ mode, sceneName, spawn });
  mobileControls.mount('shooter', activeGame);
  activeGame.requestPointerLock();
}

function launchSamurai() {
  cleanupActiveGame();
  activeGameType = 'samurai';
  activeGame = new SamuraiGame(canvasRoot, {
    onHudUpdate: (hud) => { latestHud = hud; renderInGameOverlay(); },
    onCombo: (msg) => showComboBanner(msg),
    onDamageFlash: () => triggerDamageFlash(),
    onElderDialogue: (data) => { elderDialogueData = data; renderInGameOverlay(); },
    onPrompt: (text) => {
      if (currentPrompt !== text) {
        currentPrompt = text;
        renderInGameOverlay();
      }
    },
    onPauseChange: (paused) => { isPaused = paused; renderInGameOverlay(); },
    onGameOver: (data) => { gameOverData = data; renderInGameOverlay(); }
  });

  activeGame.start();
  mobileControls.mount('samurai', activeGame);
  activeGame.requestPointerLock();
}

function launchRacing({ trackId, playerName, carId, role, roomState, joinNotice }) {
  cleanupActiveGame();
  activeGameType = 'racing';
  activeGame = new RacingGame(canvasRoot, {
    onHudUpdate: (hud) => { latestHud = hud; renderInGameOverlay(); },
    onActionBanner: (msg) => showComboBanner(msg),
    onPauseChange: (paused) => { isPaused = paused; renderInGameOverlay(); },
    onRaceFinish: (data) => { raceFinishData = data; renderInGameOverlay(); }
  }, mp);

  activeGame.start({ trackId, playerName, carId, role, roomState });
  mobileControls.mount('racing', activeGame, role);
  if (joinNotice) showComboBanner(`👁️ ${joinNotice}`);
}

// --- IN-GAME HUD, MINIMAP, ELDER DIALOGUE, CHECKPOINTS & PAUSE ---

function drawSamuraiMinimap(canvas, hud) {
  if (!canvas || !hud?.playerPos) return;
  const ctx = canvas.getContext('2d');
  const w = canvas.width;
  const h = canvas.height;
  const cx = w / 2;
  const cy = h / 2;
  ctx.clearRect(0, 0, w, h);

  ctx.fillStyle = hud.realm === 'astra_fire' ? 'rgba(38, 8, 8, 0.9)' : hud.realm === 'atisashi_sky' ? 'rgba(14, 34, 62, 0.9)' : 'rgba(10, 20, 18, 0.9)';
  ctx.beginPath();
  ctx.arc(cx, cy, cx - 2, 0, Math.PI * 2);
  ctx.fill();

  const scale = 0.72;
  const px = hud.playerPos.x;
  const pz = hud.playerPos.z;

  for (const ent of hud.mapEntities || []) {
    const dx = (ent.x - px) * scale;
    const dz = (ent.z - pz) * scale;
    const dist = Math.hypot(dx, dz);
    const maxR = cx - 10;
    const clampedX = dist > maxR ? (dx / dist) * maxR : dx;
    const clampedZ = dist > maxR ? (dz / dist) * maxR : dz;

    ctx.fillStyle = ent.color;
    ctx.beginPath();
    ctx.arc(cx + clampedX, cy + clampedZ, ent.type === 'elder' ? 5 : 3.5, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(-hud.playerPos.yaw);
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.moveTo(0, -7);
  ctx.lineTo(5, 6);
  ctx.lineTo(-5, 6);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  ctx.fillStyle = '#fbbf24';
  ctx.font = 'bold 10px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('NORTH', cx, 13);
}

function renderSpeedArcSvg(speedKmh, nitroActive) {
  const pct = Math.min(1, speedKmh / 360);
  const r = 28;
  const circ = 2 * Math.PI * r;
  const arcLen = circ * 0.75;
  const dashOffset = arcLen * (1 - pct);
  const stroke = nitroActive ? '#f472b6' : speedKmh > 220 ? '#fbbf24' : '#38bdf8';
  return `
    <svg width="70" height="70" viewBox="0 0 70 70">
      <circle cx="35" cy="35" r="${r}" fill="none" stroke="rgba(51,65,85,0.8)" stroke-width="6"
        stroke-dasharray="${arcLen} ${circ}" stroke-linecap="round" transform="rotate(135 35 35)"/>
      <circle cx="35" cy="35" r="${r}" fill="none" stroke="${stroke}" stroke-width="6"
        stroke-dasharray="${arcLen} ${circ}" stroke-dashoffset="${dashOffset}" stroke-linecap="round" transform="rotate(135 35 35)"/>
      <text x="35" y="40" text-anchor="middle" fill="#fff" font-size="13" font-weight="900">${Math.round(pct * 100)}%</text>
    </svg>
  `;
}

function renderInGameOverlay() {
  if (!activeGame || !latestHud) return;
  const h = latestHud;
  let hudHtml = '';

  if (h.game === 'racing') {
    const rm = h.roomState;
    const roomBadge = rm
      ? `<div class="hud-panel hud-panel-racing">
           <div style="font-weight:900; color:#f9a8d4;">${h.trackFlag} ${h.trackName} • ROOM: ${rm.roomId}</div>
           <div style="font-size:0.75rem; color:#cbd5e1; margin-top:2px;">
             Host: <strong>${rm.hostName || 'Host'}</strong> • Racers: <strong>${rm.racerCount}/${rm.maxPlayers}</strong> •
             ${rm.locked ? '<span style="color:#fbbf24;">🔒 LOCKED</span>' : '<span style="color:#4ade80;">OPEN</span>'}
             ${rm.spectatorCount > 0 ? ` • 👁️ ${rm.spectatorCount}` : ''}
           </div>
         </div>`
      : '';

    hudHtml = `
      <div class="hud-layer">
        ${h.countdown > 0 ? `<div class="countdown-big">${h.countdown}</div>` : ''}
        <div class="hud-top-left">
          ${roomBadge}
          <div class="hud-panel standings-panel">
            <div style="font-size:0.7rem; color:#94a3b8; font-weight:900; letter-spacing:0.08em;">LIVE POSITIONS</div>
            ${h.standings.map(st => `
              <div class="standing-row ${st.isPlayer ? 'me' : ''}">
                <span>#${st.pos} ${st.name}</span>
                <span>L${st.lap}/${h.totalLaps} ${st.alive ? '' : '💥'}</span>
              </div>
            `).join('')}
          </div>
        </div>
        <div class="hud-top-center">
          ${h.role === 'spectator'
            ? `<div class="spectator-badge">👁️ LIVE SPECTATOR — WATCHING ${h.spectatingName}</div>`
            : `<div class="hud-panel hud-stat-row">
                 <span style="color:#fbbf24; font-size:1.18rem;">${formatOrdinal(h.position)} / ${h.totalRacers}</span>
                 <span>LAP ${h.lap}/${h.totalLaps}</span>
                 <span>⏱ ${h.timeStr}</span>
                 <span style="color:#f43f5e;">💥 ${h.takedowns}</span>
               </div>`}
          ${currentComboMsg ? `<div class="combo-banner">${currentComboMsg}</div>` : ''}
        </div>
        <div class="hud-top-right">
          <div class="btn-row" style="pointer-events:auto;">
            ${h.role === 'spectator'
              ? `<button class="btn btn-pink" id="hud-spec-next" style="padding:6px 11px; font-size:0.78rem;">👁️ Next Car [Tab]</button>`
              : `<button class="btn btn-secondary" id="hud-cam-btn" style="padding:6px 11px; font-size:0.78rem;">🎥 ${h.cameraMode === 'fps' ? 'Cockpit' : 'Car View'} [V]</button>`}
            <button class="btn btn-secondary" id="hud-mute" style="padding:6px 11px; font-size:0.78rem;">${audio.muted ? '🔇' : '🔊'}</button>
            <button class="btn btn-secondary" id="hud-pause" style="padding:6px 11px; font-size:0.78rem;">⏸ [P]</button>
          </div>
        </div>
        <div class="hud-bottom-left">
          <div class="hud-panel hud-panel-racing">
            <div style="display:flex; justify-content:space-between; font-weight:800; font-size:0.76rem; margin-bottom:4px;">
              <span>CHASSIS ARMOR</span><span>${h.hp}/${h.maxHp}</span>
            </div>
            <div class="bar-wrap" style="margin-bottom:8px;"><div class="bar-fill bar-hp" style="width:${(h.hp / h.maxHp) * 100}%"></div></div>
            ${h.role === 'racer' ? `
              <div style="display:flex; justify-content:space-between; font-weight:800; font-size:0.76rem; margin-bottom:4px;">
                <span style="color:#38bdf8;">🔥 NITRO [SHIFT]</span><span>${h.nitro}%</span>
              </div>
              <div class="bar-wrap"><div class="bar-fill bar-nitro" style="width:${h.nitro}%"></div></div>
            ` : ''}
          </div>
        </div>
        <div class="hud-bottom-center">
          <div class="shortcut-strip">
            ${h.role === 'spectator'
              ? `<span><kbd>Tab</kbd> Next Racer</span><span><kbd>M</kbd> Mute</span><span><kbd>P</kbd> Menu</span>`
              : `<span><kbd>WASD</kbd> Drive</span><span><kbd>Space</kbd> Drift</span><span><kbd>Shift</kbd> Nitro</span><span><kbd>LMB/F</kbd> Shoot</span><span><kbd>RMB/E</kbd> Special Op</span><span><kbd>V</kbd> Cockpit/Car</span>`}
          </div>
        </div>
        <div class="hud-bottom-right">
          <div class="hud-panel">
            <div class="speed-gauge-box">
              ${renderSpeedArcSvg(h.speedKmh, h.nitroActive)}
              <div style="text-align:right;">
                <div class="speed-readout">${h.speedKmh} <span style="font-size:0.78rem;">KM/H</span></div>
                <div style="font-size:0.74rem; color:${h.drifting ? '#fbbf24' : h.nitroActive ? '#f472b6' : '#94a3b8'}; font-weight:800;">
                  ${h.drifting ? '⚡ POWER DRIFT' : h.nitroActive ? '🔥 NITRO BOOST' : h.cameraMode === 'fps' ? 'FPS COCKPIT' : 'CHASE CAM'}
                </div>
              </div>
            </div>
            ${h.role === 'racer' ? `
              <div style="margin-top:6px; padding:5px 9px; border-radius:8px; background:rgba(30,41,59,0.9); font-size:0.76rem; font-weight:900; text-align:center; color:${h.heldOp ? '#fde047' : '#64748b'};">
                ${h.heldOp ? `${h.heldOp.label} [E]` : 'COLLECT ROAD SPECIAL OPS'}
              </div>
            ` : ''}
          </div>
        </div>
      </div>
    `;
  } else if (h.game === 'shooter') {
    const livesHearts = '❤️'.repeat(Math.max(0, h.lives)) + '🖤'.repeat(Math.max(0, 3 - h.lives));
    const roomInfo = h.mode === 'arena' && h.roomState
      ? `<div class="hud-panel hud-panel-shooter">
           <div style="font-weight:900; color:#38bdf8;">ROOM: ${h.roomState.roomId} • ${h.roomState.routingLabel}</div>
           <div style="font-size:0.75rem; color:#cbd5e1;">Host: ${h.roomState.hostName || 'Host'} • Players: ${h.roomState.players.length} • ${h.sceneName.toUpperCase()}</div>
         </div>`
      : `<div class="hud-panel hud-panel-shooter">
           <div style="font-weight:900; color:#fda4af;">☣️ APOCALYPSE LEVEL ${h.level}</div>
           <div style="font-size:0.76rem; color:#cbd5e1;">Zombies Left: <strong>${h.zombiesLeft}</strong> • Record: Lv.${h.highScore.bestLevel} (${h.highScore.bestKills} kills)</div>
         </div>`;

    hudHtml = `
      <div class="hud-layer">
        <div class="damage-vignette ${damageFlashActive ? 'flash' : ''}"></div>
        <div class="crosshair"><span class="ch-t"></span><span class="ch-b"></span><span class="ch-l"></span><span class="ch-r"></span><span class="ch-dot"></span></div>
        <div class="hitmarker ${hitMarkerActive ? 'show' : ''}">✕</div>
        <div class="hud-top-left">${roomInfo}${h.mode === 'apocalypse' ? `<div class="hud-panel lives-row">${livesHearts}</div>` : ''}</div>
        <div class="hud-top-center">
          <div class="hud-panel hud-stat-row">
            ${h.mode === 'arena' ? `<span>⏱ ${h.timerStr}</span><span>LVL ${h.level}</span>` : `<span>WAVE ${h.level}</span>`}
            <span style="color:#38bdf8;">KILLS: ${h.kills}</span>
            ${h.mode === 'arena' ? `<span style="color:#f87171;">DEATHS: ${h.deaths}</span>` : ''}
          </div>
          ${currentComboMsg ? `<div class="combo-banner">${currentComboMsg}</div>` : ''}
          ${!h.alive && h.mode === 'arena' ? `<div class="prompt-pill">ELIMINATED — RESPAWNING IN ${h.respawnTimer}s...</div>` : ''}
        </div>
        <div class="hud-top-right">
          <div class="btn-row" style="pointer-events:auto;">
            <button class="btn btn-secondary" id="hud-mute" style="padding:6px 11px; font-size:0.78rem;">${audio.muted ? '🔇' : '🔊'}</button>
            <button class="btn btn-secondary" id="hud-pause" style="padding:6px 11px; font-size:0.78rem;">⏸ [P]</button>
          </div>
          <div class="kill-feed">${killFeed.map(k => `<div class="kill-item">${k}</div>`).join('')}</div>
        </div>
        <div class="hud-bottom-left">
          <div class="hud-panel hud-panel-shooter">
            <div style="display:flex; justify-content:space-between; font-weight:800; font-size:0.78rem; margin-bottom:5px;"><span>ARMOR &amp; HEALTH</span><span>${h.hp}/${h.maxHp}</span></div>
            <div class="bar-wrap"><div class="bar-fill bar-hp" style="width:${(h.hp / h.maxHp) * 100}%"></div></div>
          </div>
        </div>
        <div class="hud-bottom-center">
          <div class="shortcut-strip">
            <span><kbd>WASD</kbd> Move</span><span><kbd>LMB</kbd> Shoot</span><span><kbd>RMB</kbd> Aim</span><span><kbd>G</kbd> Bomb</span><span><kbd>E</kbd> Punch</span><span><kbd>Shift+C</kbd> Slide</span><span><kbd>F</kbd> Torch</span><span><kbd>V</kbd> View</span><span><kbd>1-3</kbd> Guns</span>
          </div>
        </div>
        <div class="hud-bottom-right">
          <div class="hud-panel" style="text-align:right; min-width:165px;">
            <div style="font-weight:900; color:#fbbf24; font-size:0.84rem;">${h.weaponName}</div>
            <div style="font-size:1.6rem; font-weight:900;">
              ${h.reloading ? '<span style="color:#38bdf8; font-size:0.95rem;">RELOADING...</span>' : `${h.ammo} <span style="font-size:0.88rem; color:#94a3b8;">/ ${h.magSize}</span>`}
            </div>
            <div style="font-size:0.78rem; color:#cbd5e1;">💣 Bombs: <strong>${h.grenades}</strong> • 🔦 <strong>${h.torchOn ? 'ON' : 'OFF'}</strong></div>
          </div>
        </div>
      </div>
    `;
  } else {
    // SAMURAI MULTI-REALM RPG HUD
    const rm = h.randomMission;
    hudHtml = `
      <div class="hud-layer">
        <div class="damage-vignette ${damageFlashActive ? 'flash' : ''}"></div>
        <div class="hud-top-left">
          <div class="hud-panel hud-panel-samurai" style="max-width:380px;">
            <div style="display:flex; justify-content:space-between; align-items:center;">
              <span style="font-weight:900; color:#fbbf24; font-size:0.86rem;">🏯 ${h.zone.toUpperCase()}</span>
              <span style="font-size:0.74rem; color:#fde047; font-weight:900;">LV.${h.level} • 🪙 ${h.gold}</span>
            </div>
            <div style="font-size:0.79rem; color:#f1f5f9; margin-top:4px;"><strong>Story:</strong> ${h.objective}</div>
            <div style="font-size:0.73rem; color:#94a3b8; margin-top:4px;">
              💾 Checkpoint: <strong style="color:#7dd3fc;">${h.checkpointLabel}</strong> •
              ${h.hasEyeLaser ? '<strong style="color:#38bdf8;">👁️⚡ EYE LASER READY [X]</strong>' : `Disguise: <strong>${h.disguised ? 'ACTIVE' : h.hasDisguise ? 'READY [R]' : 'LOCKED'}</strong>`}
            </div>
          </div>
          ${rm ? `
            <div class="hud-panel mission-card" style="max-width:380px;">
              <div style="font-weight:900; color:#2dd4bf;">🎯 BONUS MISSION (${rm.progress}/${rm.target})</div>
              <div style="color:#e2e8f0; margin-top:2px;">${rm.title}</div>
              <div style="color:#94a3b8; font-size:0.72rem; margin-top:2px;">Reward: +${rm.rewardXp} XP • +${rm.rewardGold} Gold • Heal</div>
            </div>
          ` : ''}
          ${h.suspicion > 0 ? `
            <div class="hud-panel">
              <div style="font-size:0.74rem; font-weight:900; color:#fca5a5; margin-bottom:4px;">👁️ GUARD SUSPICION: ${h.suspicion}%</div>
              <div class="bar-wrap"><div class="bar-fill bar-sus" style="width:${h.suspicion}%"></div></div>
            </div>
          ` : ''}
        </div>

        <div class="hud-top-center">
          ${h.activeBoss ? `
            <div class="boss-bar-wrap">
              <div style="display:flex; justify-content:space-between; font-size:0.8rem; font-weight:900; color:#fda4af;">
                <span>🔥 ${h.activeBoss.name}</span>
                <span>${h.activeBoss.hp} / ${h.activeBoss.maxHp}</span>
              </div>
              <div class="boss-bar-track"><div class="boss-bar-fill" style="width:${(h.activeBoss.hp / h.activeBoss.maxHp) * 100}%"></div></div>
            </div>
          ` : ''}
          ${currentComboMsg ? `<div class="combo-banner">${currentComboMsg}</div>` : ''}
        </div>

        <div class="hud-top-right">
          <div class="btn-row" style="pointer-events:auto;">
            <button class="btn btn-secondary" id="hud-mute" style="padding:6px 11px; font-size:0.78rem;">${audio.muted ? '🔇' : '🔊'}</button>
            <button class="btn btn-secondary" id="hud-pause" style="padding:6px 11px; font-size:0.78rem;">⏸ [P]</button>
          </div>
          <canvas id="samurai-minimap" class="minimap-canvas" width="128" height="128"></canvas>
        </div>

        <div class="hud-bottom-left">
          <div class="hud-panel hud-panel-samurai">
            <div style="display:flex; justify-content:space-between; font-weight:800; font-size:0.75rem; margin-bottom:4px;"><span>VITALITY</span><span>${h.hp}/${h.maxHp}</span></div>
            <div class="bar-wrap" style="margin-bottom:7px;"><div class="bar-fill bar-hp" style="width:${(h.hp / h.maxHp) * 100}%"></div></div>
            <div style="display:flex; justify-content:space-between; font-weight:800; font-size:0.75rem; margin-bottom:4px;"><span style="color:#2dd4bf;">☯️ TAI CHI SPIRIT</span><span>${h.chi}/${h.maxChi}</span></div>
            <div class="bar-wrap" style="margin-bottom:7px;"><div class="bar-fill bar-chi" style="width:${(h.chi / h.maxChi) * 100}%"></div></div>
            <div style="font-size:0.7rem; color:#fde047; font-weight:800;">XP: ${h.xp} / ${h.xpNext} (Level ${h.level})</div>
          </div>
        </div>

        <div class="hud-bottom-center">
          ${currentPrompt ? `<div class="prompt-pill">${currentPrompt}</div>` : ''}
          <div class="shortcut-strip">
            <span><kbd>WASD</kbd> Move</span>
            <span><kbd>Space</kbd> Jump</span>
            <span><kbd>LMB</kbd> 3-Hit Katana</span>
            <span><kbd>RMB/Q</kbd> Tai Chi</span>
            <span><kbd>E</kbd> Deflect</span>
            <span><kbd>C</kbd> Slide</span>
            <span><kbd>R</kbd> Disguise</span>
            ${h.hasEyeLaser ? `<span><kbd>X</kbd> <strong>EYE LASER</strong></span>` : ''}
            <span><kbd>F</kbd> Interact</span>
          </div>
        </div>
      </div>
    `;
  }

  let modalHtml = '';
  if (elderDialogueData) {
    modalHtml = `
      <div class="modal-backdrop">
        <div class="modal-card">
          <span class="card-badge badge-gold">🏯 CLAN ELDERS' SANCTUARY</span>
          <div class="modal-title" style="color:#fbbf24;">"Young Ronin... You Survived the Wolves."</div>
          <p style="color:#e2e8f0; font-size:0.9rem; line-height:1.58;">
            <em>"The tyrant who sank your family's ship is no mortal man — he is the <strong>Mighty Dragon Emperor</strong> ruling from the floating skies.
            We hold two ancient portals of fate. Step through either portal and forge your legend:"</em>
          </p>
          <div class="elder-choice-grid">
            <button class="elder-choice-card elder-choice-ocean" id="elder-choose-beginning">
              <div style="font-size:1.5rem;">🌊⛵</div>
              <div style="font-weight:900; color:#7dd3fc; font-size:0.96rem;">PATH 1: START AT THE BEGINNING</div>
              <p style="font-size:0.8rem; color:#cbd5e1; line-height:1.45;">
                Fall through the Time Portal back onto the stormy shipwreck boat! Fight the raiders, <strong>save your parents</strong>, continue through the wolf saga, unlock checkpoints, and march against the Emperor!
              </p>
            </button>
            <button class="elder-choice-card elder-choice-astra" id="elder-choose-astra">
              <div style="font-size:1.5rem;">🔥☁️🐉</div>
              <div style="font-weight:900; color:#fdba74; font-size:0.96rem;">PATH 2: ENTER THE ASTRA REALM</div>
              <p style="font-size:0.8rem; color:#cbd5e1; line-height:1.45;">
                Plunge into the Fiery Land of No Return! Battle strange astral creatures &amp; the Magma Warden, ascend to <strong>Atisashi City in the Sky</strong>, ride moving sky blocks, awaken the <strong>Solar Eye Laser [X]</strong>, and defeat the <strong>Mighty Dragon Emperor</strong>!
              </p>
            </button>
          </div>
          <button class="btn btn-ghost" id="elder-close">Keep Exploring Imperial City First</button>
        </div>
      </div>
    `;
  } else if (raceFinishData) {
    const r = raceFinishData;
    modalHtml = `
      <div class="modal-backdrop">
        <div class="modal-card">
          <div class="trophy-hero">
            <div class="trophy-icon">${r.won ? '🏆' : r.position === 2 ? '🥈' : r.position === 3 ? '🥉' : '🏁'}</div>
            <div class="modal-title" style="color:#fbbf24;">${r.won ? 'CHAMPIONSHIP TROPHY WON!' : `FINISHED ${formatOrdinal(r.position).toUpperCase()} PLACE!`}</div>
            <div style="color:#cbd5e1; font-size:0.9rem;"><strong>${r.playerName}</strong> (${r.carName}) • ${r.trackName}</div>
          </div>
          <div class="stats-grid">
            <div class="stat-box"><div class="stat-val">${formatSec(r.timeSec)}</div><div class="stat-lbl">Official Race Time</div></div>
            <div class="stat-box"><div class="stat-val">${r.takedowns}</div><div class="stat-lbl">Cars Eliminated</div></div>
          </div>
          <div class="btn-row">
            <button class="btn btn-pink" id="modal-restart">Race Again</button>
            <button class="btn btn-gold" id="modal-open-lb">🏆 Leaderboard</button>
            <button class="btn btn-secondary" id="modal-hub">Main Hub</button>
          </div>
        </div>
      </div>
    `;
  } else if (gameOverData) {
    modalHtml = `
      <div class="modal-backdrop">
        <div class="modal-card">
          <div class="modal-title" style="color:#fbbf24;">${gameOverData.title}</div>
          <p style="color:#cbd5e1; font-size:0.94rem;">${gameOverData.subtitle}</p>
          <div class="stats-grid">
            ${gameOverData.stats.map(st => `<div class="stat-box"><div class="stat-val">${st.value}</div><div class="stat-lbl">${st.label}</div></div>`).join('')}
          </div>
          <div class="btn-row">
            <button class="btn btn-primary" id="modal-restart">Continue / Play Again</button>
            <button class="btn btn-secondary" id="modal-hub">Main Hub</button>
          </div>
        </div>
      </div>
    `;
  } else if (isPaused) {
    const checkpointHtml = activeGameType === 'samurai' && h.unlockedCheckpoints?.length
      ? `
        <div>
          <div class="section-label">💾 SAVED CHECKPOINTS (FAST TRAVEL / RETURN)</div>
          <div class="checkpoint-grid">
            ${h.unlockedCheckpoints.map(cp => `
              <button class="scene-chip" data-tp-cp="${cp.id}">📍 ${cp.label}</button>
            `).join('')}
          </div>
        </div>
      ` : '';

    const sceneSwitchHtml = activeGameType === 'shooter' && h.mode === 'arena'
      ? `
        <div>
          <div class="section-label">SWITCH ARENA SCENE</div>
          <div class="scene-selector">
            ${['forest', 'desert', 'building', 'city'].map(sc => `
              <button class="scene-chip ${h.sceneName === sc ? 'active' : ''}" data-switch-scene="${sc}">${sc.toUpperCase()}</button>
            `).join('')}
          </div>
        </div>
      ` : '';

    modalHtml = `
      <div class="modal-backdrop">
        <div class="modal-card">
          <div style="display:flex; justify-content:space-between; align-items:center;">
            <div class="modal-title">GAME PAUSED</div>
            ${(activeGameType === 'shooter' || activeGameType === 'racing')
              ? `<button class="btn btn-secondary" id="pause-cam-btn">
                   ${activeGameType === 'racing' ? `View: ${h.cameraMode === 'fps' ? 'Cockpit' : 'Car Chase'} [V]` : `View: ${h.thirdPerson ? '3rd' : '1st'} Person [V]`}
                 </button>`
              : ''}
          </div>
          <div class="slider-row"><span>🎵 Background Music</span><input type="range" id="vol-music" min="0" max="1" step="0.05" value="${audio.musicVolume}" /></div>
          <div class="slider-row"><span>💥 Action &amp; Engine SFX</span><input type="range" id="vol-sfx" min="0" max="1" step="0.05" value="${audio.sfxVolume}" /></div>
          <div class="slider-row">
            <span>📱 Mobile Touch Controls</span>
            <button class="btn btn-secondary" id="pause-touch-btn" style="padding:6px 14px; font-size:0.78rem;">${mobileControls.enabled ? 'ENABLED' : 'DISABLED'}</button>
          </div>
          ${checkpointHtml}
          ${sceneSwitchHtml}
          <div class="btn-row">
            <button class="btn btn-primary" id="modal-resume">▶ Resume</button>
            <button class="btn btn-secondary" id="modal-restart">↻ Respawn / Restart</button>
            <button class="btn btn-danger" id="modal-hub">Main Hub</button>
          </div>
        </div>
      </div>
    `;
  }

  uiRoot.innerHTML = hudHtml + modalHtml;

  // Hide mobile touch overlay while any modal (Pause, Elder Dialogue, Trophy, Game Over) is open!
  mobileRoot.style.display = modalHtml ? 'none' : 'block';

  if (h.game === 'samurai') {
    drawSamuraiMinimap(uiRoot.querySelector('#samurai-minimap'), h);
  }

  const bind = (sel, fn) => { const el = uiRoot.querySelector(sel); if (el) el.onclick = fn; };
  bind('#hud-mute', (e) => { e.stopPropagation(); audio.toggleMute(); renderInGameOverlay(); });
  bind('#hud-pause', (e) => { e.stopPropagation(); activeGame.setPaused(!isPaused); });
  bind('#hud-cam-btn', (e) => { e.stopPropagation(); activeGame.toggleCameraView(); });
  bind('#hud-spec-next', (e) => { e.stopPropagation(); activeGame.cycleSpectateTarget(); });

  // Elder Portal Choice Bindings!
  bind('#elder-choose-beginning', () => {
    elderDialogueData = null;
    isPaused = false;
    activeGame.chooseElderPath('beginning');
    renderInGameOverlay();
  });
  bind('#elder-choose-astra', () => {
    elderDialogueData = null;
    isPaused = false;
    activeGame.chooseElderPath('astra');
    renderInGameOverlay();
  });
  bind('#elder-close', () => {
    elderDialogueData = null;
    activeGame.setPaused(false);
    activeGame.requestPointerLock?.();
  });

  bind('#modal-resume', () => { activeGame.setPaused(false); activeGame.requestPointerLock?.(); });
  bind('#modal-restart', () => {
    gameOverData = null; raceFinishData = null; isPaused = false; killFeed = [];
    activeGame.restart(); activeGame.requestPointerLock?.();
  });
  bind('#modal-open-lb', () => {
    mp.leaveRaceRoom(); cleanupActiveGame(); audio.playMusic('menu');
    showLeaderboardModal = true; mp.send({ type: 'get_race_leaderboard' }); renderHub();
  });
  bind('#modal-hub', () => {
    mp.leaveRoom(); mp.leaveRaceRoom(); cleanupActiveGame(); audio.playMusic('menu'); renderHub();
  });
  bind('#pause-cam-btn', () => { activeGame.toggleCameraView(); renderInGameOverlay(); });
  bind('#pause-touch-btn', () => {
    mobileControls.setForceEnabled(!mobileControls.enabled);
    document.body.classList.toggle('touch-active', mobileControls.enabled);
    if (activeGame) mobileControls.mount(activeGameType, activeGame, latestHud?.role || 'racer');
    renderInGameOverlay();
  });

  uiRoot.querySelectorAll('[data-tp-cp]').forEach(btn => {
    btn.onclick = () => {
      isPaused = false;
      activeGame.teleportToCheckpoint(btn.dataset.tpCp);
      activeGame.requestPointerLock?.();
    };
  });

  const volM = uiRoot.querySelector('#vol-music');
  if (volM) volM.oninput = () => audio.setMusicVolume(parseFloat(volM.value));
  const volS = uiRoot.querySelector('#vol-sfx');
  if (volS) volS.oninput = () => audio.setSfxVolume(parseFloat(volS.value));

  uiRoot.querySelectorAll('[data-switch-scene]').forEach(btn => {
    btn.onclick = () => {
      activeGame.changeScene(btn.dataset.switchScene);
      activeGame.setPaused(false);
      activeGame.requestPointerLock?.();
    };
  });
}

renderHub();
