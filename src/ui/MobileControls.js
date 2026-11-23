// Multi-Touch Mobile Controls Overlay for Shooter, Samurai Adventure & FPS Car Racing!
// Supports simultaneous left-thumb joystick/steering, right-screen touch-look, and action buttons.

export function isTouchDevice() {
  return (
    'ontouchstart' in window ||
    navigator.maxTouchPoints > 0 ||
    window.matchMedia('(pointer: coarse)').matches
  );
}

export class MobileControls {
  constructor(mountEl) {
    this.mountEl = mountEl;
    this.gameType = null;
    this.gameRef = null;
    this.role = 'racer';
    this.enabled = isTouchDevice();
    this.visible = false;

    this.joyTouchId = null;
    this.lookTouchId = null;
    this.lookLastX = 0;
    this.lookLastY = 0;
    this._cleanupFns = [];
  }

  setForceEnabled(flag) {
    this.enabled = Boolean(flag);
    if (this.gameRef && this.gameType) {
      this.mount(this.gameType, this.gameRef, this.role);
    } else {
      this.unmount();
    }
  }

  unmount() {
    this._cleanupFns.forEach(fn => fn());
    this._cleanupFns = [];
    this.mountEl.innerHTML = '';
    this.visible = false;
    this.joyTouchId = null;
    this.lookTouchId = null;
  }

  mount(gameType, gameRef, role = 'racer') {
    this.unmount();
    this.gameType = gameType;
    this.gameRef = gameRef;
    this.role = role;
    if (!this.enabled || !gameRef) return;
    this.visible = true;

    if (gameType === 'racing') {
      this._buildRacingControls(role);
    } else if (gameType === 'shooter') {
      this._buildShooterControls();
    } else if (gameType === 'samurai') {
      this._buildSamuraiControls();
    }
  }

  _bindHoldBtn(el, onDown, onUp) {
    if (!el) return;
    const down = (e) => {
      e.preventDefault();
      e.stopPropagation();
      el.classList.add('pressed');
      onDown?.();
    };
    const up = (e) => {
      e.preventDefault();
      e.stopPropagation();
      el.classList.remove('pressed');
      onUp?.();
    };
    el.addEventListener('pointerdown', down);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    el.addEventListener('pointerleave', up);
    this._cleanupFns.push(() => {
      el.removeEventListener('pointerdown', down);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', up);
      el.removeEventListener('pointerleave', up);
    });
  }

  _bindTapBtn(el, onTap) {
    if (!el) return;
    const down = (e) => {
      e.preventDefault();
      e.stopPropagation();
      el.classList.add('pressed');
      onTap?.();
    };
    const up = (e) => {
      e.preventDefault();
      el.classList.remove('pressed');
    };
    el.addEventListener('pointerdown', down);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    this._cleanupFns.push(() => {
      el.removeEventListener('pointerdown', down);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', up);
    });
  }

  _setupJoystickAndLook() {
    const joyBase = this.mountEl.querySelector('.m-joy-base');
    const joyKnob = this.mountEl.querySelector('.m-joy-knob');
    const lookZone = this.mountEl.querySelector('.m-look-zone');

    if (joyBase && joyKnob) {
      const maxR = 46;
      const updateJoy = (clientX, clientY) => {
        const rect = joyBase.getBoundingClientRect();
        const cx = rect.left + rect.width / 2;
        const cy = rect.top + rect.height / 2;
        let dx = clientX - cx;
        let dy = clientY - cy;
        const dist = Math.hypot(dx, dy);
        if (dist > maxR) {
          dx = (dx / dist) * maxR;
          dy = (dy / dist) * maxR;
        }
        joyKnob.style.transform = `translate(${dx}px, ${dy}px)`;
        // Forward is -dy, right is +dx
        this.gameRef?.setTouchMove?.(dx / maxR, -dy / maxR);
      };

      const onDown = (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.joyTouchId = e.pointerId;
        joyBase.setPointerCapture?.(e.pointerId);
        updateJoy(e.clientX, e.clientY);
      };
      const onMove = (e) => {
        if (e.pointerId !== this.joyTouchId) return;
        e.preventDefault();
        updateJoy(e.clientX, e.clientY);
      };
      const onUp = (e) => {
        if (e.pointerId !== this.joyTouchId) return;
        this.joyTouchId = null;
        joyKnob.style.transform = 'translate(0px, 0px)';
        this.gameRef?.setTouchMove?.(0, 0);
      };

      joyBase.addEventListener('pointerdown', onDown);
      joyBase.addEventListener('pointermove', onMove);
      joyBase.addEventListener('pointerup', onUp);
      joyBase.addEventListener('pointercancel', onUp);
      this._cleanupFns.push(() => {
        joyBase.removeEventListener('pointerdown', onDown);
        joyBase.removeEventListener('pointermove', onMove);
        joyBase.removeEventListener('pointerup', onUp);
        joyBase.removeEventListener('pointercancel', onUp);
      });
    }

    if (lookZone) {
      const onDown = (e) => {
        if (e.target !== lookZone) return;
        e.preventDefault();
        this.lookTouchId = e.pointerId;
        this.lookLastX = e.clientX;
        this.lookLastY = e.clientY;
        lookZone.setPointerCapture?.(e.pointerId);
      };
      const onMove = (e) => {
        if (e.pointerId !== this.lookTouchId) return;
        e.preventDefault();
        const dx = e.clientX - this.lookLastX;
        const dy = e.clientY - this.lookLastY;
        this.lookLastX = e.clientX;
        this.lookLastY = e.clientY;
        this.gameRef?.addTouchLook?.(dx, dy);
      };
      const onUp = (e) => {
        if (e.pointerId !== this.lookTouchId) return;
        this.lookTouchId = null;
      };

      lookZone.addEventListener('pointerdown', onDown);
      lookZone.addEventListener('pointermove', onMove);
      lookZone.addEventListener('pointerup', onUp);
      lookZone.addEventListener('pointercancel', onUp);
      this._cleanupFns.push(() => {
        lookZone.removeEventListener('pointerdown', onDown);
        lookZone.removeEventListener('pointermove', onMove);
        lookZone.removeEventListener('pointerup', onUp);
        lookZone.removeEventListener('pointercancel', onUp);
      });
    }
  }

  _buildShooterControls() {
    this.mountEl.innerHTML = `
      <div class="mobile-layer">
        <div class="m-look-zone"></div>
        <div class="m-left-pad">
          <div class="m-joy-base">
            <div class="m-joy-knob"></div>
          </div>
        </div>
        <div class="m-right-pad">
          <div class="m-mini-row">
            <button class="m-btn m-btn-sm" id="m-sh-gun">🔫 GUN</button>
            <button class="m-btn m-btn-sm" id="m-sh-cam">🎥 VIEW</button>
            <button class="m-btn m-btn-sm" id="m-sh-torch">🔦 TORCH</button>
          </div>
          <div class="m-action-grid">
            <button class="m-btn m-btn-med" id="m-sh-aim">🎯 AIM</button>
            <button class="m-btn m-btn-med" id="m-sh-jump">⬆️ JUMP</button>
            <button class="m-btn m-btn-med" id="m-sh-bomb">💣 BOMB</button>
            <button class="m-btn m-btn-med" id="m-sh-reload">🔄 RLD</button>
            <button class="m-btn m-btn-med" id="m-sh-slide">💨 SLIDE</button>
            <button class="m-btn m-btn-med" id="m-sh-punch">👊 HIT</button>
          </div>
          <button class="m-btn m-btn-fire" id="m-sh-fire">🔥 FIRE</button>
        </div>
      </div>
    `;

    this._setupJoystickAndLook();
    const g = this.gameRef;
    this._bindHoldBtn(this.mountEl.querySelector('#m-sh-fire'), () => g.setTouchFire?.(true), () => g.setTouchFire?.(false));
    this._bindHoldBtn(this.mountEl.querySelector('#m-sh-aim'), () => g.setTouchAim?.(true), () => g.setTouchAim?.(false));
    this._bindTapBtn(this.mountEl.querySelector('#m-sh-jump'), () => g.triggerTouchAction?.('jump'));
    this._bindTapBtn(this.mountEl.querySelector('#m-sh-bomb'), () => g.triggerTouchAction?.('bomb'));
    this._bindTapBtn(this.mountEl.querySelector('#m-sh-reload'), () => g.triggerTouchAction?.('reload'));
    this._bindTapBtn(this.mountEl.querySelector('#m-sh-slide'), () => g.triggerTouchAction?.('slide'));
    this._bindTapBtn(this.mountEl.querySelector('#m-sh-punch'), () => g.triggerTouchAction?.('punch'));
    this._bindTapBtn(this.mountEl.querySelector('#m-sh-torch'), () => g.triggerTouchAction?.('torch'));
    this._bindTapBtn(this.mountEl.querySelector('#m-sh-cam'), () => g.toggleCameraView?.());
    this._bindTapBtn(this.mountEl.querySelector('#m-sh-gun'), () => g.triggerTouchAction?.('next_weapon'));
  }

  _buildSamuraiControls() {
    this.mountEl.innerHTML = `
      <div class="mobile-layer">
        <div class="m-look-zone"></div>
        <div class="m-left-pad">
          <div class="m-joy-base">
            <div class="m-joy-knob"></div>
          </div>
        </div>
        <div class="m-right-pad">
          <div class="m-mini-row">
            <button class="m-btn m-btn-sm m-btn-gold" id="m-sm-interact">🤝 ACT [F]</button>
            <button class="m-btn m-btn-sm" id="m-sm-disguise">🎭 MASK</button>
            <button class="m-btn m-btn-sm m-btn-cyan" id="m-sm-laser">👁️ LASER</button>
          </div>
          <div class="m-action-grid">
            <button class="m-btn m-btn-med m-btn-teal" id="m-sm-taichi">☯️ CHI</button>
            <button class="m-btn m-btn-med" id="m-sm-deflect">🛡️ PARRY</button>
            <button class="m-btn m-btn-med" id="m-sm-jump">⬆️ JUMP</button>
            <button class="m-btn m-btn-med" id="m-sm-slide">💨 SLIDE</button>
          </div>
          <button class="m-btn m-btn-fire m-btn-gold" id="m-sm-slash">⚔️ KATANA</button>
        </div>
      </div>
    `;

    this._setupJoystickAndLook();
    const g = this.gameRef;
    this._bindTapBtn(this.mountEl.querySelector('#m-sm-slash'), () => g.triggerTouchAction?.('slash'));
    this._bindTapBtn(this.mountEl.querySelector('#m-sm-taichi'), () => g.triggerTouchAction?.('taichi'));
    this._bindTapBtn(this.mountEl.querySelector('#m-sm-deflect'), () => g.triggerTouchAction?.('deflect'));
    this._bindTapBtn(this.mountEl.querySelector('#m-sm-jump'), () => g.triggerTouchAction?.('jump'));
    this._bindTapBtn(this.mountEl.querySelector('#m-sm-slide'), () => g.triggerTouchAction?.('slide'));
    this._bindTapBtn(this.mountEl.querySelector('#m-sm-disguise'), () => g.triggerTouchAction?.('disguise'));
    this._bindTapBtn(this.mountEl.querySelector('#m-sm-interact'), () => g.triggerTouchAction?.('interact'));
    this._bindTapBtn(this.mountEl.querySelector('#m-sm-laser'), () => g.triggerTouchAction?.('laser'));
  }

  _buildRacingControls(role) {
    if (role === 'spectator') {
      this.mountEl.innerHTML = `
        <div class="mobile-layer">
          <div class="m-right-pad">
            <button class="m-btn m-btn-fire" id="m-rc-spec">👁️ NEXT CAR</button>
          </div>
        </div>
      `;
      this._bindTapBtn(this.mountEl.querySelector('#m-rc-spec'), () => this.gameRef?.cycleSpectateTarget?.());
      return;
    }

    this.mountEl.innerHTML = `
      <div class="mobile-layer">
        <div class="m-left-pad m-steer-pad">
          <div class="m-steer-row">
            <button class="m-btn m-btn-steer" id="m-rc-left">◀</button>
            <button class="m-btn m-btn-steer" id="m-rc-right">▶</button>
          </div>
          <button class="m-btn m-btn-med" id="m-rc-brake" style="width:100%;">🛑 BRAKE / REV</button>
        </div>
        <div class="m-right-pad">
          <div class="m-mini-row">
            <button class="m-btn m-btn-sm" id="m-rc-cam">🎥 VIEW</button>
            <button class="m-btn m-btn-sm m-btn-cyan" id="m-rc-nitro">🔥 NITRO</button>
            <button class="m-btn m-btn-sm m-btn-gold" id="m-rc-op">🚀 OP</button>
          </div>
          <div class="m-action-grid">
            <button class="m-btn m-btn-med" id="m-rc-drift">💨 DRIFT</button>
            <button class="m-btn m-btn-med" id="m-rc-shoot">🔫 SHOOT</button>
          </div>
          <button class="m-btn m-btn-fire m-btn-gas" id="m-rc-gas">⚡ GAS</button>
        </div>
      </div>
    `;

    const g = this.gameRef;
    this._bindHoldBtn(this.mountEl.querySelector('#m-rc-left'), () => g.setTouchKey?.('KeyA', true), () => g.setTouchKey?.('KeyA', false));
    this._bindHoldBtn(this.mountEl.querySelector('#m-rc-right'), () => g.setTouchKey?.('KeyD', true), () => g.setTouchKey?.('KeyD', false));
    this._bindHoldBtn(this.mountEl.querySelector('#m-rc-gas'), () => g.setTouchKey?.('KeyW', true), () => g.setTouchKey?.('KeyW', false));
    this._bindHoldBtn(this.mountEl.querySelector('#m-rc-brake'), () => g.setTouchKey?.('KeyS', true), () => g.setTouchKey?.('KeyS', false));
    this._bindHoldBtn(this.mountEl.querySelector('#m-rc-drift'), () => g.setTouchKey?.('Space', true), () => g.setTouchKey?.('Space', false));
    this._bindHoldBtn(this.mountEl.querySelector('#m-rc-nitro'), () => g.setTouchKey?.('ShiftLeft', true), () => g.setTouchKey?.('ShiftLeft', false));
    this._bindTapBtn(this.mountEl.querySelector('#m-rc-shoot'), () => g.triggerTouchAction?.('shoot'));
    this._bindTapBtn(this.mountEl.querySelector('#m-rc-op'), () => g.triggerTouchAction?.('special_op'));
    this._bindTapBtn(this.mountEl.querySelector('#m-rc-cam'), () => g.toggleCameraView?.());
  }
}
