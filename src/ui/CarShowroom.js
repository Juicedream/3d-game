import * as THREE from 'three';
import { CAR_CATALOG, createRaceCarMesh } from '../engine/CarMesh.js';

// Interactive 3D Rolling Car Showroom Carousel for Choosing Your Car!
export class CarShowroom {
  constructor(mountEl, initialCarId = 'valkyrie') {
    this.mountEl = mountEl;
    this.disposed = false;
    this.currentIndex = Math.max(0, CAR_CATALOG.findIndex(c => c.id === initialCarId));

    const w = mountEl.clientWidth || 380;
    const h = mountEl.clientHeight || 195;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(42, w / h, 0.1, 80);
    this.camera.position.set(4.5, 2.35, 5.4);
    this.camera.lookAt(0, 0.72, 0);

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    this.renderer.setSize(w, h);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.2;
    mountEl.innerHTML = '';
    mountEl.appendChild(this.renderer.domElement);

    // Dramatic Studio Showroom Lighting
    const hemi = new THREE.HemisphereLight(0xdbeafe, 0x0f172a, 0.9);
    const key = new THREE.DirectionalLight(0xffffff, 2.0);
    key.position.set(6, 10, 8);
    const rimPink = new THREE.PointLight(0xec4899, 18, 22);
    rimPink.position.set(-5.5, 3.2, -3.5);
    const rimCyan = new THREE.PointLight(0x38bdf8, 18, 22);
    rimCyan.position.set(5.5, 3.0, -3.5);
    this.scene.add(hemi, key, rimPink, rimCyan);

    // Spinning Neon Turntable Stage
    this.stage = new THREE.Group();
    const deck = new THREE.Mesh(
      new THREE.CylinderGeometry(3.35, 3.55, 0.24, 48),
      new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.22, metalness: 0.85 })
    );
    deck.position.y = -0.12;
    this.ringMat = new THREE.MeshBasicMaterial({ color: CAR_CATALOG[this.currentIndex].accent });
    const ring = new THREE.Mesh(new THREE.TorusGeometry(3.42, 0.055, 10, 64), this.ringMat);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.02;
    this.stage.add(deck, ring);
    this.scene.add(this.stage);

    // Build all 4 cars & position active one on center stage with smooth roll-in/roll-out!
    this.carModels = CAR_CATALOG.map((spec) => {
      const mesh = createRaceCarMesh(spec.id);
      // Turn on subtle showroom flames/glow
      this.stage.add(mesh);
      return {
        spec,
        mesh,
        offsetZ: 0,
        targetZ: 0
      };
    });

    this.turntableYaw = -0.4;
    this.dragging = false;
    this.lastX = 0;

    this._applySelection(this.currentIndex, 0, true);
    this._bindDrag();

    this.clock = new THREE.Clock();
    this._animate = this._animate.bind(this);
    requestAnimationFrame(this._animate);
  }

  selectCar(carId, direction = 1) {
    const idx = CAR_CATALOG.findIndex(c => c.id === carId);
    if (idx === -1 || idx === this.currentIndex) return;
    this._applySelection(idx, direction, false);
  }

  _applySelection(newIdx, direction = 1, instant = false) {
    const prevIdx = this.currentIndex;
    this.currentIndex = newIdx;
    this.ringMat.color.setHex(CAR_CATALOG[newIdx].accent);

    this.carModels.forEach((item, i) => {
      if (i === newIdx) {
        item.mesh.visible = true;
        item.targetZ = 0;
        item.offsetZ = instant ? 0 : (direction >= 0 ? 11 : -11);
        item.mesh.position.z = item.offsetZ;
      } else if (!instant && i === prevIdx) {
        item.mesh.visible = true;
        item.targetZ = direction >= 0 ? -11 : 11;
      } else {
        item.mesh.visible = false;
        item.offsetZ = 14;
        item.targetZ = 14;
      }
    });
  }

  _bindDrag() {
    const el = this.renderer.domElement;
    el.style.cursor = 'grab';
    this._onDown = (e) => {
      this.dragging = true;
      this.lastX = e.clientX;
      el.style.cursor = 'grabbing';
    };
    this._onMove = (e) => {
      if (!this.dragging) return;
      const dx = e.clientX - this.lastX;
      this.lastX = e.clientX;
      this.turntableYaw += dx * 0.012;
    };
    this._onUp = () => {
      this.dragging = false;
      el.style.cursor = 'grab';
    };
    el.addEventListener('pointerdown', this._onDown);
    window.addEventListener('pointermove', this._onMove);
    window.addEventListener('pointerup', this._onUp);
  }

  _animate() {
    if (this.disposed) return;
    requestAnimationFrame(this._animate);
    const dt = Math.min(0.05, this.clock.getDelta());

    // Resize smoothly if container resized
    const w = this.mountEl.clientWidth;
    const h = this.mountEl.clientHeight;
    if (w > 20 && h > 20 && (this.renderer.domElement.width !== w * Math.min(window.devicePixelRatio, 2))) {
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(w, h);
    }

    if (!this.dragging) {
      this.turntableYaw += dt * 0.55;
    }
    this.stage.rotation.y = this.turntableYaw;

    // Smoothly roll cars onto and off the 3D showroom turntable with spinning wheels!
    for (let i = 0; i < this.carModels.length; i++) {
      const item = this.carModels[i];
      if (!item.mesh.visible) continue;
      const prevZ = item.offsetZ;
      item.offsetZ = THREE.MathUtils.lerp(item.offsetZ, item.targetZ, Math.min(1, dt * 7.5));
      item.mesh.position.z = item.offsetZ;

      const deltaZ = item.offsetZ - prevZ;
      const wheelSpin = Math.abs(deltaZ) > 0.005 ? deltaZ * 2.4 : -dt * 2.2; // Always rolls slowly on dyno + spins fast when rolling in!
      item.mesh.userData.wheels?.forEach(w => {
        w.rotation.x += wheelSpin;
      });

      if (i !== this.currentIndex && Math.abs(item.offsetZ - item.targetZ) < 0.35) {
        item.mesh.visible = false;
      }
    }

    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    this.disposed = true;
    window.removeEventListener('pointermove', this._onMove);
    window.removeEventListener('pointerup', this._onUp);
    this.renderer.dispose();
  }
}
