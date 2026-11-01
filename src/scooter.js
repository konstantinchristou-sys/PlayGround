import * as THREE from 'three';
import { glowTexture } from './textures.js';

function mat(color, extra = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0.25, flatShading: true, ...extra });
}

function box(w, h, d, material, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  m.position.set(x, y, z);
  m.castShadow = true;
  return m;
}

function cylinderBetween(a, b, radius, material, segments = 7) {
  const start = new THREE.Vector3(...a);
  const end = new THREE.Vector3(...b);
  const dir = new THREE.Vector3().subVectors(end, start);
  const len = dir.length();
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, len, segments), material);
  mesh.position.copy(start).addScaledVector(dir, 0.5);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
  mesh.castShadow = true;
  return mesh;
}

export function createScooter(scene, scooter) {
  const root = new THREE.Group();
  const flip = new THREE.Group();
  flip.position.y = 0.78;
  root.add(flip);

  const wheelie = new THREE.Group();
  wheelie.position.set(0, 0.28 - 0.78, -0.45);
  flip.add(wheelie);

  const model = new THREE.Group();
  model.position.set(0, 0.28, 0.45);
  wheelie.add(model);

  /* ---------- materials ---------- */
  const deckMat = mat(scooter.deck, { roughness: 0.5, metalness: 0.3 });
  const accentMat = mat(scooter.color, { roughness: 0.35, metalness: 0.45 });
  const accentDark = mat(scooter.accent, { roughness: 0.45, metalness: 0.5 });
  const gripMat = mat(0x15171e, { roughness: 0.95, metalness: 0.0 });
  const tireMat = mat(0x14151b, { roughness: 0.95, metalness: 0.0, flatShading: false });
  const metalMat = mat(0xb8c1d4, { roughness: 0.3, metalness: 0.85 });
  const skinMat = mat(0xd9a077, { roughness: 0.85, metalness: 0.0 });
  const hoodieMat = mat(0x1f2433, { roughness: 0.9, metalness: 0.0 });
  const pantMat = mat(0x2c3040, { roughness: 0.95 });
  const helmetMat = mat(scooter.accent, { roughness: 0.3, metalness: 0.5 });
  const shoeMat = mat(0xf1efe9, { roughness: 0.8 });
  const visorMat = new THREE.MeshStandardMaterial({ color: 0x0c1020, roughness: 0.15, metalness: 0.9 });

  /* ---------- deck ---------- */
  const deck = box(0.46, 0.1, 1.4, deckMat, 0, 0.28, 0);
  deck.geometry.translate(0, 0, 0);
  model.add(deck);
  const grip = box(0.42, 0.02, 1.34, gripMat, 0, 0.345, 0);
  model.add(grip);
  // deck side rails
  const railL = box(0.05, 0.06, 1.36, accentMat, -0.24, 0.25, 0);
  const railR = box(0.05, 0.06, 1.36, accentMat, 0.24, 0.25, 0);
  model.add(railL, railR);
  // rear kick
  const kick = box(0.44, 0.07, 0.3, accentDark, 0, 0.38, -0.7);
  model.add(kick);

  /* ---------- wheels ---------- */
  const wheelGeo = new THREE.CylinderGeometry(0.27, 0.27, 0.15, 18);
  wheelGeo.rotateZ(Math.PI / 2);
  const hubGeo = new THREE.CylinderGeometry(0.1, 0.1, 0.17, 10);
  hubGeo.rotateZ(Math.PI / 2);
  function wheel(z) {
    const g = new THREE.Group();
    const tire = new THREE.Mesh(wheelGeo, tireMat);
    tire.castShadow = true;
    g.add(tire);
    const hub = new THREE.Mesh(hubGeo, accentMat);
    g.add(hub);
    g.position.set(0, 0.27, z);
    model.add(g);
    return g;
  }
  const rearWheel = wheel(-0.63);
  const frontWheel = wheel(0.64);

  /* ---------- steering / bars ---------- */
  const steer = new THREE.Group();
  steer.position.set(0, 0.35, 0.6);
  model.add(steer);
  const forkL = cylinderBetween([-0.1, 0, 0.02], [-0.1, 0.75, -0.08], 0.035, metalMat);
  const forkR = cylinderBetween([0.1, 0, 0.02], [0.1, 0.75, -0.08], 0.035, metalMat);
  steer.add(forkL, forkR);
  const stem = cylinderBetween([0, 0.35, -0.04], [0, 0.9, -0.16], 0.055, accentDark);
  steer.add(stem);
  const bars = new THREE.Group();
  bars.position.set(0, 0.92, -0.18);
  steer.add(bars);
  const crossbar = new THREE.Mesh(new THREE.CylinderGeometry(0.034, 0.034, 1.12, 8), metalMat);
  crossbar.rotation.z = Math.PI / 2;
  bars.add(crossbar);
  for (const sx of [-0.52, 0.52]) {
    const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.22, 8), accentMat);
    grip.rotation.z = Math.PI / 2;
    grip.position.x = sx;
    bars.add(grip);
  }
  const barPad = box(0.24, 0.09, 0.12, accentDark, 0, 0.005, 0);
  bars.add(barPad);
  const brakeLever = box(0.22, 0.03, 0.03, metalMat, 0.36, 0.07, 0.05);
  brakeLever.rotation.z = 0.25;
  bars.add(brakeLever);

  /* ---------- rider ---------- */
  const rider = new THREE.Group();
  model.add(rider);
  // legs
  const thighL = cylinderBetween([-0.15, 0.42, -0.18], [-0.18, 0.92, 0.05], 0.085, pantMat);
  const thighR = cylinderBetween([0.15, 0.42, -0.18], [0.18, 0.92, 0.05], 0.085, pantMat);
  const shinL = cylinderBetween([-0.18, 0.92, 0.05], [-0.2, 0.5, 0.18], 0.07, pantMat);
  const shinR = cylinderBetween([0.18, 0.92, 0.05], [0.2, 0.5, 0.18], 0.07, pantMat);
  rider.add(thighL, thighR, shinL, shinR);
  // shoes
  const shoeL = box(0.16, 0.12, 0.32, shoeMat, -0.2, 0.41, 0.18);
  const shoeR = box(0.16, 0.12, 0.32, shoeMat, 0.2, 0.41, 0.18);
  rider.add(shoeL, shoeR);
  // torso
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.24, 0.42, 4, 8), hoodieMat);
  torso.position.set(0, 1.22, -0.02);
  torso.rotation.x = 0.22;
  torso.castShadow = true;
  rider.add(torso);
  const hood = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 8, 0, Math.PI * 2, 0, Math.PI * 0.6), hoodieMat);
  hood.position.set(0, 1.44, -0.14);
  hood.scale.set(1, 0.6, 0.8);
  rider.add(hood);
  // arms
  const armL = cylinderBetween([-0.26, 1.4, 0.02], [-0.5, 1.24, 0.4], 0.06, hoodieMat);
  const armR = cylinderBetween([0.26, 1.4, 0.02], [0.5, 1.24, 0.4], 0.06, hoodieMat);
  const handL = new THREE.Mesh(new THREE.SphereGeometry(0.075, 6, 6), skinMat);
  handL.position.set(-0.5, 1.21, 0.44);
  const handR = handL.clone();
  handR.position.x = 0.5;
  rider.add(armL, armR, handL, handR);
  // head + helmet
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.18, 10, 10), skinMat);
  head.position.set(0, 1.68, 0.0);
  head.castShadow = true;
  rider.add(head);
  const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 10, 0, Math.PI * 2, 0, Math.PI * 0.62), helmetMat);
  helmet.position.set(0, 1.7, -0.01);
  helmet.rotation.x = -0.1;
  rider.add(helmet);
  const visor = box(0.3, 0.09, 0.06, visorMat, 0, 1.68, 0.16);
  rider.add(visor);
  const stripe = box(0.08, 0.22, 0.4, accentMat, 0, 1.78, -0.06);
  stripe.rotation.x = 0.15;
  rider.add(stripe);
  // backpack
  const pack = box(0.3, 0.38, 0.16, accentDark, 0, 1.2, -0.25);
  rider.add(pack);

  /* ---------- lights ---------- */
  const headlight = box(0.18, 0.09, 0.05, new THREE.MeshBasicMaterial({ color: 0xfff0c0, toneMapped: false }), 0, 0.33, 0.72);
  model.add(headlight);
  const headGlow = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTexture(), color: 0xffd9a0, transparent: true, opacity: 0.55,
    depthWrite: false, blending: THREE.AdditiveBlending,
  }));
  headGlow.scale.set(1.6, 1.6, 1);
  headGlow.position.set(0, 0.36, 0.8);
  model.add(headGlow);

  const underGlow = new THREE.Mesh(
    new THREE.PlaneGeometry(1.15, 2.1),
    new THREE.MeshBasicMaterial({ color: scooter.color, transparent: true, opacity: 0.22, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }),
  );
  underGlow.rotation.x = -Math.PI / 2;
  underGlow.position.set(0, 0.07, 0.05);
  model.add(underGlow);

  root.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = true;
      o.receiveShadow = false;
    }
  });
  scene.add(root);

  const colors = {
    deck: deckMat,
    accent: accentMat,
    accentDark,
    helmet: helmetMat,
    glow: underGlow.material,
    headGlow: headGlow.material,
  };

  function applyScooter(data) {
    deckMat.color.set(data.deck);
    accentMat.color.set(data.color);
    accentDark.color.set(data.accent);
    helmetMat.color.set(data.accent);
    underGlow.material.color.set(data.color);
  }

  let wheelSpin = 0;
  let bob = 0;

  function update(state) {
    const dt = state.dt || 0;
    const speed = state.speed || 0;
    wheelSpin += (speed / 0.27) * dt;
    rearWheel.rotation.x = wheelSpin;
    frontWheel.rotation.x = wheelSpin;

    steer.rotation.y = (state.steer || 0) * 0.28;
    wheelie.rotation.x = -THREE.MathUtils.degToRad(state.wheelie || 0);
    flip.rotation.x = THREE.MathUtils.degToRad(state.flipX || 0);
    flip.rotation.z = THREE.MathUtils.degToRad(state.flipZ || 0);
    bars.rotation.y = THREE.MathUtils.degToRad(state.barspin || 0);

    // rider life
    const crouch = state.crouch || 0;
    rider.position.y = -crouch * 0.12;
    rider.rotation.x = (state.grounded ? 0 : -0.12) + (state.wheelie ? 0.05 : 0);
    torso.rotation.x = 0.22 + (state.grounded ? 0 : 0.18);
    const lean = (state.steer || 0) * 0.18;
    rider.rotation.z = -lean * 0.6;
    bob += dt * (4 + speed * 0.55);
    torso.position.y = 1.22 + Math.sin(bob) * 0.014;

    // crash tumble
    if (state.crashed) {
      const t = state.crashTime || 0;
      flip.rotation.x += (state.crashTilt || 0) + t * 4.0;
      flip.rotation.z += t * 2.2;
      rider.rotation.z += Math.sin(t * 9) * 0.15;
      bars.rotation.y += t * 7;
      underGlow.material.opacity = 0.1;
    } else {
      underGlow.material.opacity = 0.18 + (state.grounded ? 0.1 : 0.25);
    }
    underGlow.material.opacity += Math.sin((state.time || 0) * 4) * 0.03;
    headGlow.material.opacity = 0.4 + Math.sin((state.time || 0) * 3) * 0.06;
  }

  function setVisible(v) {
    root.visible = v;
  }

  return {
    root,
    flip,
    wheelie,
    model,
    bars,
    rider,
    underGlow,
    applyScooter,
    update,
    setVisible,
    colors,
  };
}
