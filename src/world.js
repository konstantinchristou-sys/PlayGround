import * as THREE from '../vendor/three.module.js'

// Deterministic little RNG so the city looks the same on every visit.
const rng = (() => {
  let s = 20261101
  return () => {
    s |= 0
    s = (s + 0x6d2b79f5) | 0
    let t = Math.imul(s ^ (s >>> 15), 1 | s)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
})()

const rand = (a, b) => a + rng() * (b - a)
const pick = arr => arr[Math.floor(rng() * arr.length)]

function noiseTexture(base, spread, size = 96, repeat = 18) {
  const c = document.createElement('canvas')
  c.width = c.height = size
  const ctx = c.getContext('2d')
  const [r, g, b] = base
  const img = ctx.createImageData(size, size)
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (rng() - 0.5) * spread
    img.data[i] = Math.max(0, Math.min(255, r + n))
    img.data[i + 1] = Math.max(0, Math.min(255, g + n))
    img.data[i + 2] = Math.max(0, Math.min(255, b + n))
    img.data[i + 3] = 255
  }
  ctx.putImageData(img, 0, 0)
  const tex = new THREE.CanvasTexture(c)
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping
  tex.repeat.set(repeat, repeat)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 4
  return tex
}

function facadeTexture(base, glass, lit) {
  const c = document.createElement('canvas')
  c.width = 128
  c.height = 256
  const ctx = c.getContext('2d')
  ctx.fillStyle = base
  ctx.fillRect(0, 0, 128, 256)
  // subtle vertical bands
  for (let x = 0; x < 128; x += 16) {
    ctx.fillStyle = 'rgba(255,255,255,0.035)'
    ctx.fillRect(x, 0, 8, 256)
  }
  const cols = 5
  const rows = 12
  const padX = 8
  const padY = 8
  const cw = (128 - padX * 2) / cols
  const ch = (256 - padY * 2) / rows
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const wx = padX + x * cw + 2
      const wy = padY + y * ch + 2
      const ww = cw - 4
      const wh = ch - 5
      const on = rng() < 0.34
      ctx.fillStyle = on ? lit : glass
      ctx.fillRect(wx, wy, ww, wh)
      if (on) {
        ctx.fillStyle = 'rgba(255,255,255,0.35)'
        ctx.fillRect(wx + 1, wy + 1, ww - 2, 1)
      } else {
        ctx.fillStyle = 'rgba(0,0,0,0.25)'
        ctx.fillRect(wx, wy + wh - 2, ww, 2)
      }
    }
  }
  // rooftop band
  ctx.fillStyle = 'rgba(0,0,0,0.22)'
  ctx.fillRect(0, 0, 128, 5)
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 4
  return tex
}

function graffitiTexture(word, color) {
  const c = document.createElement('canvas')
  c.width = 512
  c.height = 192
  const ctx = c.getContext('2d')
  ctx.clearRect(0, 0, 512, 192)
  ctx.save()
  ctx.translate(256, 104)
  ctx.rotate(-0.06)
  ctx.font = '900 104px "Arial Black", Impact, sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.lineJoin = 'round'
  ctx.strokeStyle = 'rgba(10,12,20,0.85)'
  ctx.lineWidth = 18
  ctx.strokeText(word, 0, 0)
  ctx.fillStyle = color
  ctx.fillText(word, 0, 0)
  ctx.globalAlpha = 0.5
  ctx.fillStyle = '#ffffff'
  ctx.fillText(word, -4, -4)
  ctx.restore()
  // spray dots
  for (let i = 0; i < 40; i++) {
    ctx.fillStyle = `rgba(255,255,255,${rand(0.05, 0.28)})`
    ctx.beginPath()
    ctx.arc(rand(10, 500), rand(10, 180), rand(1, 5), 0, Math.PI * 2)
    ctx.fill()
  }
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

function signTexture(text, color, sub = '') {
  const c = document.createElement('canvas')
  c.width = 512
  c.height = 192
  const ctx = c.getContext('2d')
  ctx.fillStyle = '#0a0f1c'
  ctx.fillRect(0, 0, 512, 192)
  ctx.strokeStyle = color
  ctx.lineWidth = 6
  ctx.strokeRect(8, 8, 496, 176)
  ctx.font = '900 76px "Arial Black", Impact, sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.shadowColor = color
  ctx.shadowBlur = 24
  ctx.fillStyle = color
  ctx.fillText(text, 256, sub ? 82 : 96)
  if (sub) {
    ctx.shadowBlur = 8
    ctx.font = '700 28px "Trebuchet MS", sans-serif'
    ctx.fillStyle = '#e9f6ff'
    ctx.fillText(sub, 256, 146)
  }
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

export function createWorld(scene) {
  const rideables = []
  const buildings = []
  const colliders = []
  const ramps = []
  const cars = []
  const peds = []
  const palms = []
  const coins = []
  const foam = []

  const asphalt = noiseTexture([56, 59, 67], 26, 96, 24)
  const concrete = noiseTexture([172, 167, 156], 18, 96, 16)
  const sandTex = noiseTexture([226, 196, 137], 20, 96, 26)
  const wood = noiseTexture([132, 92, 61], 22, 96, 14)

  const M = {
    grass: new THREE.MeshLambertMaterial({ color: 0x6f9a62 }),
    road: new THREE.MeshLambertMaterial({ map: asphalt, color: 0xbfc2c9 }),
    sidewalk: new THREE.MeshLambertMaterial({ map: concrete, color: 0xd6d0c1 }),
    concrete: new THREE.MeshLambertMaterial({ map: concrete, color: 0xbdb7a8 }),
    sand: new THREE.MeshLambertMaterial({ map: sandTex, color: 0xf3d59b }),
    wood: new THREE.MeshLambertMaterial({ map: wood, color: 0xb08054 }),
    dark: new THREE.MeshLambertMaterial({ color: 0x232833 }),
    metal: new THREE.MeshStandardMaterial({ color: 0x9aa7b4, roughness: 0.45, metalness: 0.7 }),
    ramp: new THREE.MeshStandardMaterial({ color: 0x5c6470, roughness: 0.82, metalness: 0.08 }),
    rampDark: new THREE.MeshStandardMaterial({ color: 0x3c434d, roughness: 0.9, metalness: 0.05 }),
    accentCyan: new THREE.MeshStandardMaterial({ color: 0x00e5ff, emissive: 0x00b8cc, emissiveIntensity: 1.7, roughness: 0.35 }),
    accentPink: new THREE.MeshStandardMaterial({ color: 0xff3d8b, emissive: 0xd21f68, emissiveIntensity: 1.7, roughness: 0.35 }),
    accentGold: new THREE.MeshStandardMaterial({ color: 0xffc83d, emissive: 0xd89a00, emissiveIntensity: 1.4, roughness: 0.4 }),
    white: new THREE.MeshLambertMaterial({ color: 0xf2eee3 }),
    glass: new THREE.MeshLambertMaterial({ color: 0x8fd4e8, transparent: true, opacity: 0.75 }),
    window: new THREE.MeshBasicMaterial({ color: 0xffd27a }),
    water: new THREE.MeshStandardMaterial({ color: 0x2c93ad, roughness: 0.28, metalness: 0.25 }),
  }

  function addBox(w, h, d, material, x, y, z, opts = {}) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material)
    mesh.position.set(x, y, z)
    mesh.rotation.y = opts.rotY || 0
    mesh.castShadow = opts.castShadow !== false
    mesh.receiveShadow = opts.receiveShadow !== false
    scene.add(mesh)
    if (opts.collider) {
      colliders.push({
        minX: x - w / 2, maxX: x + w / 2,
        minZ: z - d / 2, maxZ: z + d / 2,
        height: h,
      })
    }
    if (opts.rideable) rideables.push(mesh)
    return mesh
  }

  function addPlane(w, d, material, x, z, y = 0.01) {
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, d), material)
    mesh.rotation.x = -Math.PI / 2
    mesh.position.set(x, y, z)
    mesh.receiveShadow = true
    scene.add(mesh)
    return mesh
  }

  // ---------------------------------------------------------------- ground
  addPlane(560, 560, M.grass, 40, 10, 0)
  addPlane(74, 320, M.sand, 185, 10, 0.015)
  addPlane(190, 420, M.water, 310, 10, -0.22)
  addPlane(66, 420, M.wood, 151.5, 10, 0.05) // boardwalk
  addPlane(74, 66, M.concrete, -60, 52, 0.03)

  // Ocean sparkle bands
  const foamMat = new THREE.MeshBasicMaterial({ color: 0xe8fbff, transparent: true, opacity: 0.45 })
  for (let i = 0; i < 8; i++) {
    const w = rand(30, 90)
    const strip = new THREE.Mesh(new THREE.PlaneGeometry(w, 0.8), foamMat)
    strip.rotation.x = -Math.PI / 2
    strip.position.set(rand(222, 240), -0.18, rand(-140, 160))
    scene.add(strip)
    foam.push({ mesh: strip, baseX: strip.position.x, phase: rand(0, 6), speed: rand(0.4, 1.1) })
  }

  // ---------------------------------------------------------------- roads
  const roads = [
    { x: 30, z: 0, w: 360, d: 17, dir: 'x' },
    { x: 0, z: 10, w: 15, d: 300, dir: 'z' },
    { x: 40, z: 115, w: 370, d: 13, dir: 'x' },
    { x: 84, z: -75, w: 124, d: 11, dir: 'x' },
    { x: 56, z: -75, w: 11, d: 130, dir: 'z' },
    { x: 116, z: -75, w: 11, d: 130, dir: 'z' },
  ]
  roads.forEach(r => addPlane(r.w, r.d, M.road, r.x, r.z, 0.02))

  // sidewalks
  const walks = [
    [-30, 11.2, 300, 4], [-30, -11.2, 300, 4],
    [9.5, 10, 4, 300], [-9.5, 10, 4, 300],
    [40, 107, 360, 3.6], [40, 123, 360, 3.6],
  ]
  walks.forEach(([x, z, w, d]) => {
    const m = addBox(w, 0.12, d, M.sidewalk, x, 0.06, z, { castShadow: false })
    rideables.push(m)
  })

  // road dashes
  const dashGeo = new THREE.BoxGeometry(0.24, 0.03, 2.8)
  const dashMat = new THREE.MeshBasicMaterial({ color: 0xf6e7b5 })
  const dashes = []
  for (let x = -130; x <= 210; x += 10) {
    if (Math.abs(x) < 9) continue
    dashes.push({ x, z: 0, rot: 0 })
    dashes.push({ x, z: 115, rot: 0 })
  }
  for (let z = -130; z <= 150; z += 10) {
    if (Math.abs(z - 10) < 9) continue
    dashes.push({ x: 0, z, rot: Math.PI / 2 })
  }
  for (let x = 30; x <= 140; x += 10) dashes.push({ x, z: -75, rot: 0 })
  const dashMesh = new THREE.InstancedMesh(dashGeo, dashMat, dashes.length)
  const dummy = new THREE.Object3D()
  dashes.forEach((d, i) => {
    dummy.position.set(d.x, 0.045, d.z)
    dummy.rotation.set(0, d.rot, 0)
    dummy.scale.set(1, 1, 1)
    dummy.updateMatrix()
    dashMesh.setMatrixAt(i, dummy.matrix)
  })
  dashMesh.receiveShadow = true
  scene.add(dashMesh)

  // crosswalk stripes
  const cwGeo = new THREE.BoxGeometry(0.65, 0.03, 5.2)
  const cwMat = new THREE.MeshBasicMaterial({ color: 0xf2efe4 })
  const cw = []
  for (let i = 0; i < 9; i++) {
    cw.push({ x: -5.6 + i * 1.4, z: 10.8, rot: 0 })
    cw.push({ x: -5.6 + i * 1.4, z: -10.8, rot: 0 })
    cw.push({ x: 9.8, z: -8 + i * 2, rot: Math.PI / 2 })
    cw.push({ x: -9.8, z: -8 + i * 2, rot: Math.PI / 2 })
  }
  const cwMesh = new THREE.InstancedMesh(cwGeo, cwMat, cw.length)
  cw.forEach((d, i) => {
    dummy.position.set(d.x, 0.05, d.z)
    dummy.rotation.set(0, d.rot, 0)
    dummy.scale.set(1, 1, 1)
    dummy.updateMatrix()
    cwMesh.setMatrixAt(i, dummy.matrix)
  })
  scene.add(cwMesh)

  // ---------------------------------------------------------------- city
  const facadeMats = [
    new THREE.MeshLambertMaterial({ map: facadeTexture('#27324a', '#16243a', '#ffd58a') }),
    new THREE.MeshLambertMaterial({ map: facadeTexture('#3a3040', '#221d2e', '#ffc27a') }),
    new THREE.MeshLambertMaterial({ map: facadeTexture('#223b3b', '#122a2c', '#ffe0a3') }),
    new THREE.MeshLambertMaterial({ map: facadeTexture('#46352c', '#2a201d', '#ffd9a0') }),
  ]
  const roofMat = new THREE.MeshLambertMaterial({ color: 0x2c3038 })
  const citySpots = []
  const xCols = [38, 70, 102, 134]
  const zRows = [-120, -88, -56]
  xCols.forEach((cx, ix) => {
    zRows.forEach((cz, iz) => {
      if (ix === 0 && iz === 2) return // little plaza
      const w = rand(19, 24)
      const d = rand(19, 24)
      const h = rand(14, 30) + (ix === 3 ? rand(8, 24) : rand(0, 14))
      citySpots.push({ x: cx + rand(-1.5, 1.5), z: cz + rand(-1.5, 1.5), w, d, h })
    })
  })
  citySpots.push({ x: 38, z: -145, w: 22, d: 18, h: 56 })
  citySpots.push({ x: 100, z: -142, w: 26, d: 16, h: 44 })

  citySpots.forEach((b, i) => {
    const mat = facadeMats[i % facadeMats.length]
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(b.w, b.h, b.d), mat)
    mesh.position.set(b.x, b.h / 2, b.z)
    mesh.castShadow = true
    mesh.receiveShadow = true
    scene.add(mesh)
    buildings.push({ x: b.x, z: b.z, w: b.w, d: b.d, h: b.h })
    colliders.push({
      minX: b.x - b.w / 2, maxX: b.x + b.w / 2,
      minZ: b.z - b.d / 2, maxZ: b.z + b.d / 2,
      height: b.h,
    })
    // roof
    const roof = new THREE.Mesh(new THREE.BoxGeometry(b.w + 0.6, 0.7, b.d + 0.6), roofMat)
    roof.position.set(b.x, b.h + 0.35, b.z)
    roof.castShadow = true
    scene.add(roof)
    // rooftop units / antenna
    if (b.h > 34) {
      const ant = addBox(0.16, rand(5, 9), 0.16, M.metal, b.x + rand(-3, 3), b.h + 3, b.z + rand(-3, 3))
      ant.castShadow = false
      const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.28, 8, 6), M.accentPink)
      beacon.position.copy(ant.position).y += 4
      scene.add(beacon)
    } else if (i % 3 === 0) {
      addBox(rand(3, 6), rand(1.5, 2.6), rand(3, 6), roofMat, b.x + rand(-3, 3), b.h + 1.4, b.z + rand(-3, 3))
    }
    // vertical neon corner strip
    if (i % 4 === 1) {
      const neonMat = i % 8 === 1 ? M.accentCyan : M.accentPink
      const strip = new THREE.Mesh(new THREE.BoxGeometry(0.18, b.h * 0.82, 0.18), neonMat)
      strip.position.set(b.x + b.w / 2 - 0.2, b.h * 0.45, b.z + b.d / 2 + 0.02)
      scene.add(strip)
    }
  })

  // neon shop signs facing the main road
  const signWords = [
    ['NOODLE', '#ff4f9a', 'OPEN LATE'],
    ['VOLT', '#38f6ff', 'E-SCOOTERS'],
    ['SUNSET', '#ffc83d', 'SURF CO.'],
    ['RAD', '#7dff6a', 'SKATE'],
  ]
  signWords.forEach((s, i) => {
    const b = citySpots[i * 3 + 2]
    if (!b) return
    const sign = new THREE.Mesh(
      new THREE.PlaneGeometry(7.5, 2.8),
      new THREE.MeshBasicMaterial({ map: signTexture(s[0], s[1], s[2]), transparent: false }),
    )
    sign.position.set(b.x + rand(-2, 2), 5.6, b.z + b.d / 2 + 0.06)
    scene.add(sign)
  })

  // low beach shops
  const shopColors = [0xff8a5b, 0x59d9c7, 0xf2cf5b, 0xa88bff, 0xff6f91]
  for (let i = 0; i < 5; i++) {
    const x = 34 + i * 25
    const z = 130
    addBox(16, 6.5, 11, new THREE.MeshLambertMaterial({ color: shopColors[i] }), x, 3.25, z, { collider: true })
    const awning = addBox(17, 0.35, 3.2, M.white, x, 4.4, z - 6.2)
    awning.castShadow = true
    const door = addBox(3, 3, 0.2, M.dark, x, 1.5, z - 5.6)
    door.castShadow = false
  }

  // ---------------------------------------------------------------- skate park
  // concrete border
  const borderMat = new THREE.MeshStandardMaterial({ color: 0x2a3039, roughness: 0.9 })
  addBox(76, 0.12, 2, borderMat, -60, 0.1, 19, { castShadow: false })
  addBox(76, 0.12, 2, borderMat, -60, 0.1, 85, { castShadow: false })
  addBox(2, 0.12, 66, borderMat, -97, 0.1, 52, { castShadow: false })
  addBox(2, 0.12, 66, borderMat, -23, 0.1, 52, { castShadow: false })
  // accent lines
  addBox(70, 0.06, 0.35, M.accentCyan, -60, 0.09, 22)
  addBox(0.35, 0.06, 60, M.accentPink, -92, 0.09, 52)
  addBox(70, 0.06, 0.35, M.accentGold, -60, 0.09, 82)

  function wedgeGeometry(w, l, h) {
    const hw = w / 2
    const hl = l / 2
    const A = [-hw, 0, -hl], B = [hw, 0, -hl], C = [hw, h, hl], D = [-hw, h, hl]
    const E = [-hw, 0, hl], F = [hw, 0, hl]
    const v = []
    const tri = (a, b, c) => v.push(...a, ...b, ...c)
    // top slope
    tri(A, D, C); tri(A, C, B)
    // bottom
    tri(A, B, C); tri(A, C, D)
    // front vertical lip
    tri(A, B, C); tri(A, C, D)
    tri(E, F, C); tri(E, C, D)
    // left side
    tri(A, E, D)
    // right side
    tri(B, C, F)
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3))
    g.computeVertexNormals()
    return g
  }

  function addWedge(x, z, rotY, w, l, h, accent = M.accentCyan) {
    const geo = wedgeGeometry(w, l, h)
    const mesh = new THREE.Mesh(geo, M.ramp)
    mesh.position.set(x, 0, z)
    mesh.rotation.y = rotY
    mesh.castShadow = true
    mesh.receiveShadow = true
    scene.add(mesh)
    rideables.push(mesh)
    const lip = new THREE.Mesh(new THREE.BoxGeometry(w, 0.14, 0.22), accent)
    lip.position.set(0, h - 0.03, l / 2)
    lip.castShadow = false
    mesh.add(lip)
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.05, l * 0.94), accent)
    stripe.position.set(w / 2 - 0.15, h * 0.45, 0)
    stripe.rotation.x = -Math.atan2(h, l)
    stripe.castShadow = false
    mesh.add(stripe)
    ramps.push({ x, z, rotY, w, l, h, type: 'kicker' })
    return mesh
  }

  function addQuarter(x, z, rotY, w, l, h, accent = M.accentPink) {
    const group = new THREE.Group()
    group.position.set(x, 0, z)
    group.rotation.y = rotY
    scene.add(group)
    const segs = 9
    for (let i = 0; i < segs; i++) {
      const t0 = i / segs
      const t1 = (i + 1) / segs
      const z0 = -l / 2 + t0 * l
      const z1 = -l / 2 + t1 * l
      const y0 = h * t0 * t0
      const y1 = h * t1 * t1
      const len = Math.hypot(z1 - z0, y1 - y0) + 0.03
      const box = new THREE.Mesh(new THREE.BoxGeometry(w, 0.22, len), M.ramp)
      box.position.set(0, (y0 + y1) / 2 - 0.11, (z0 + z1) / 2)
      box.rotation.x = -Math.atan2(y1 - y0, z1 - z0)
      box.castShadow = true
      box.receiveShadow = true
      group.add(box)
      rideables.push(box)
    }
    const lip = new THREE.Mesh(new THREE.BoxGeometry(w, 0.16, 0.3), accent)
    lip.position.set(0, h - 0.05, l / 2)
    group.add(lip)
    // side skirts
    for (const side of [-1, 1]) {
      const skirt = new THREE.Mesh(new THREE.BoxGeometry(0.18, h * 0.55, l * 0.92), M.rampDark)
      skirt.position.set(side * (w / 2), h * 0.28, 0)
      group.add(skirt)
    }
    ramps.push({ x, z, rotY, w, l, h, type: 'quarter' })
    return group
  }

  function addFunbox(x, z, size, topH, rampL) {
    const top = addBox(size, topH, size, M.ramp, x, topH / 2, z, { rideable: true })
    const edge = new THREE.Mesh(new THREE.BoxGeometry(size + 0.1, 0.1, size + 0.1), M.accentGold)
    edge.position.set(x, topH + 0.02, z)
    scene.add(edge)
    addWedge(x, z + size / 2 + rampL / 2, Math.PI, size, rampL, topH, M.accentGold)
    addWedge(x, z - size / 2 - rampL / 2, 0, size, rampL, topH, M.accentGold)
    addWedge(x + size / 2 + rampL / 2, z, -Math.PI / 2, size, rampL, topH, M.accentGold)
    addWedge(x - size / 2 - rampL / 2, z, Math.PI / 2, size, rampL, topH, M.accentGold)
    return top
  }

  // half pipe
  addQuarter(-84, 52, Math.PI / 2, 20, 7, 3.5)
  addQuarter(-36, 52, -Math.PI / 2, 20, 7, 3.5)
  // funbox
  addFunbox(-60, 31, 10, 1.45, 4.6)
  // kickers
  addWedge(-88, 76, Math.PI, 9, 8, 2.5)
  addWedge(-32, 76, Math.PI, 9, 8, 2.1)
  addWedge(-60, 80, Math.PI, 13, 10, 3.1, M.accentPink)
  // wall ride quarter on the east edge
  addQuarter(-25.5, 62, -Math.PI / 2, 15, 6, 2.9, M.accentCyan)

  // rails & manual pads
  const railMat = new THREE.MeshStandardMaterial({ color: 0xd9e6f2, roughness: 0.3, metalness: 0.9 })
  for (let i = 0; i < 2; i++) {
    addBox(0.14, 0.14, 9, railMat, -69 + i * 18, 0.62, 45)
    addBox(0.14, 0.6, 0.14, railMat, -69 + i * 18, 0.32, 40.6)
    addBox(0.14, 0.6, 0.14, railMat, -69 + i * 18, 0.32, 49.4)
  }
  addBox(7, 0.5, 4, M.rampDark, -52, 0.25, 65)
  addBox(7, 0.5, 4, M.rampDark, -72, 0.25, 65)

  // graffiti walls
  const wall = addBox(72, 3.4, 0.6, new THREE.MeshLambertMaterial({ color: 0x30353f }), -60, 1.7, 88, { collider: true })
  const words = [['VOLT', '#00e5ff'], ['SHRED', '#ff3d8b'], ['RUSH', '#ffc83d'], ['SUNSET', '#7dff6a']]
  words.forEach((w, i) => {
    const p = new THREE.Mesh(
      new THREE.PlaneGeometry(16, 4),
      new THREE.MeshBasicMaterial({ map: graffitiTexture(w[0], w[1]), transparent: true }),
    )
    p.position.set(-84 + i * 17.5, 2.1, 88.34)
    scene.add(p)
  })

  // bleachers
  for (let i = 0; i < 3; i++) {
    addBox(16, 0.55 + i * 0.5, 1.6, M.rampDark, -14, (0.55 + i * 0.5) / 2, 46 + i * 1.7)
  }
  addBox(16, 0.25, 0.3, M.accentCyan, -14, 2.15, 45.9)

  // park lamps
  const parkLampPositions = [[-92, 26], [-28, 26], [-92, 80], [-28, 80]]
  parkLampPositions.forEach(([x, z]) => {
    addBox(0.16, 5.2, 0.16, M.dark, x, 2.6, z)
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.26, 8, 6), M.accentCyan)
    bulb.position.set(x, 5.25, z)
    scene.add(bulb)
  })

  // ---------------------------------------------------------------- pier
  const pier = addBox(70, 0.5, 9, M.wood, 195, 1.0, -38, { rideable: true, collider: false })
  pier.receiveShadow = true
  addWedge(156, -38, Math.PI / 2, 9, 8, 1.25, M.accentGold)
  for (let i = 0; i < 7; i++) {
    addBox(0.5, 2.4, 0.5, M.wood, 165 + i * 10, -0.2, -42)
    addBox(0.5, 2.4, 0.5, M.wood, 165 + i * 10, -0.2, -34)
  }
  addBox(0.3, 1.1, 9, M.metal, 229, 1.8, -38)
  addBox(70, 0.1, 0.12, M.metal, 195, 2.35, -42.4)
  addBox(70, 0.1, 0.12, M.metal, 195, 2.35, -33.6)
  // pier sign
  const pierSign = new THREE.Mesh(
    new THREE.PlaneGeometry(8, 3),
    new THREE.MeshBasicMaterial({ map: signTexture('PIER 9', '#ffc83d', 'SUNSET COAST') }),
  )
  pierSign.position.set(195, 4.4, -42.6)
  scene.add(pierSign)

  // ---------------------------------------------------------------- beach props
  const palmTrunkGeo = new THREE.CylinderGeometry(0.16, 0.34, 6, 6)
  const palmTrunkMat = new THREE.MeshLambertMaterial({ color: 0x8b6a45 })
  const frondGeo = new THREE.BoxGeometry(4.2, 0.08, 0.62)
  const frondMat = new THREE.MeshLambertMaterial({ color: 0x3f8f55 })
  const palmPositions = []
  for (let i = 0; i < 11; i++) {
    palmPositions.push({ x: rand(158, 210), z: rand(-135, 150), s: rand(0.8, 1.25), rot: rand(0, 6.28) })
  }
  palmPositions.push({ x: -101, z: 24, s: 1, rot: 1 }, { x: -18, z: 84, s: 0.9, rot: 3 })
  const trunkInst = new THREE.InstancedMesh(palmTrunkGeo, palmTrunkMat, palmPositions.length)
  const frondInst = new THREE.InstancedMesh(frondGeo, frondMat, palmPositions.length * 7)
  palmPositions.forEach((p, i) => {
    dummy.position.set(p.x, 3 * p.s, p.z)
    dummy.rotation.set(0, p.rot, 0.08)
    dummy.scale.set(p.s, p.s, p.s)
    dummy.updateMatrix()
    trunkInst.setMatrixAt(i, dummy.matrix)
    for (let f = 0; f < 7; f++) {
      const a = (f / 7) * Math.PI * 2 + p.rot
      dummy.position.set(p.x + Math.cos(a) * 1.7 * p.s, 6 * p.s + Math.sin(f) * 0.15, p.z + Math.sin(a) * 1.7 * p.s)
      dummy.rotation.set(0.08 * Math.cos(a), -a, 0.22)
      dummy.scale.set(p.s, p.s, p.s)
      dummy.updateMatrix()
      frondInst.setMatrixAt(i * 7 + f, dummy.matrix)
    }
    palms.push(p)
  })
  trunkInst.castShadow = true
  frondInst.castShadow = true
  scene.add(trunkInst, frondInst)

  // round street trees (instanced)
  const treeCount = 26
  const trunkGeo = new THREE.CylinderGeometry(0.16, 0.24, 2.1, 6)
  const leafGeo = new THREE.IcosahedronGeometry(1.45, 0)
  const treeTrunkInst = new THREE.InstancedMesh(trunkGeo, palmTrunkMat, treeCount)
  const treeLeafInst = new THREE.InstancedMesh(leafGeo, new THREE.MeshLambertMaterial({ color: 0xffffff }), treeCount)
  const leafColors = [0x4f8f4d, 0x5fa35a, 0x3d7d48, 0x6eaa55]
  const treePositions = []
  for (let i = 0; i < treeCount; i++) {
    let x, z
    if (i < 12) { x = -130 + i * 13; z = 13.6 }
    else if (i < 22) { x = -128 + (i - 12) * 20; z = -13.6 }
    else { x = rand(-115, 145); z = rand(100, 126) }
    treePositions.push({ x, z, s: rand(0.8, 1.35) })
    dummy.position.set(x, 1.05, z)
    dummy.rotation.set(0, rand(0, 6.28), 0)
    dummy.scale.set(1, 1, 1)
    dummy.updateMatrix()
    treeTrunkInst.setMatrixAt(i, dummy.matrix)
    dummy.position.set(x, 2.7, z)
    dummy.rotation.set(rand(0, 1), rand(0, 6.28), 0)
    dummy.scale.set(0.85, 0.95, 0.85)
    dummy.updateMatrix()
    treeLeafInst.setMatrixAt(i, dummy.matrix)
    treeLeafInst.setColorAt(i, new THREE.Color(pick(leafColors)))
  }
  treeTrunkInst.castShadow = true
  treeLeafInst.castShadow = true
  scene.add(treeTrunkInst, treeLeafInst)

  // umbrellas
  const umbrellaColors = [0xff5d73, 0x2fc7c9, 0xffc83d, 0xa97bff, 0xff8a3d]
  for (let i = 0; i < 5; i++) {
    const x = rand(165, 205)
    const z = rand(70, 150)
    const pole = addBox(0.1, 2.4, 0.1, M.white, x, 1.2, z)
    pole.castShadow = true
    const canopy = new THREE.Mesh(
      new THREE.ConeGeometry(2.2, 0.85, 10),
      new THREE.MeshLambertMaterial({ color: umbrellaColors[i] }),
    )
    canopy.position.set(x, 2.5, z)
    canopy.castShadow = true
    scene.add(canopy)
  }

  // lifeguard tower
  addBox(3.4, 0.25, 3.4, M.wood, 176, 2.4, 108)
  addBox(0.2, 2.4, 0.2, M.wood, 174.6, 1.2, 106.6)
  addBox(0.2, 2.4, 0.2, M.wood, 177.4, 1.2, 106.6)
  addBox(0.2, 2.4, 0.2, M.wood, 174.6, 1.2, 109.4)
  addBox(0.2, 2.4, 0.2, M.wood, 177.4, 1.2, 109.4)
  addBox(2.6, 1.8, 2.6, new THREE.MeshLambertMaterial({ color: 0xf0e6cf }), 176, 3.4, 108)
  addBox(3.2, 0.25, 3.2, new THREE.MeshLambertMaterial({ color: 0xe25353 }), 176, 4.4, 108)

  // ---------------------------------------------------------------- shop garage
  const garageX = -18, garageZ = 12
  addBox(9, 4.6, 7, new THREE.MeshLambertMaterial({ color: 0x1d2634 }), garageX, 2.3, garageZ, { collider: true })
  const garageFront = new THREE.Mesh(
    new THREE.PlaneGeometry(8.4, 2.4),
    new THREE.MeshBasicMaterial({ map: signTexture('VOLT GARAGE', '#38f6ff', 'SCOOTER SHOP'), transparent: false }),
  )
  garageFront.position.set(garageX, 3.15, garageZ + 3.56)
  scene.add(garageFront)
  addBox(10.2, 0.35, 2.4, M.accentCyan, garageX, 4.7, garageZ + 1.2)
  addBox(9.4, 0.25, 7.4, M.dark, garageX, 4.65, garageZ)
  // display scooters outside
  for (let i = 0; i < 3; i++) {
    const sx = garageX - 3 + i * 3
    addBox(0.18, 0.7, 0.18, M.metal, sx, 0.35, garageZ + 5.2)
    addBox(1.2, 0.12, 0.35, new THREE.MeshLambertMaterial({ color: [0x2fd6cf, 0xff4f9a, 0xffc83d][i] }), sx, 0.74, garageZ + 5.2)
    addBox(0.12, 0.12, 1.1, M.dark, sx, 0.68, garageZ + 5.2)
  }
  const shopGlow = new THREE.Mesh(
    new THREE.RingGeometry(4.6, 5.3, 40),
    new THREE.MeshBasicMaterial({ color: 0x38f6ff, transparent: true, opacity: 0.45, side: THREE.DoubleSide }),
  )
  shopGlow.rotation.x = -Math.PI / 2
  shopGlow.position.set(garageX, 0.07, garageZ + 1)
  scene.add(shopGlow)

  // ---------------------------------------------------------------- street lamps
  const lampPositions = []
  for (let x = -120; x <= 200; x += 26) {
    lampPositions.push([x, 14.5], [x, -14.5])
  }
  for (let z = -110; z <= 145; z += 30) {
    lampPositions.push([12.8, z], [-12.8, z])
  }
  const poleGeo = new THREE.CylinderGeometry(0.09, 0.13, 5.2, 6)
  const bulbGeo = new THREE.SphereGeometry(0.24, 8, 6)
  const poleInst = new THREE.InstancedMesh(poleGeo, M.dark, lampPositions.length)
  const bulbInst = new THREE.InstancedMesh(bulbGeo, new THREE.MeshBasicMaterial({ color: 0xffe6b0 }), lampPositions.length)
  lampPositions.forEach(([x, z], i) => {
    dummy.position.set(x, 2.6, z)
    dummy.rotation.set(0, 0, 0)
    dummy.scale.set(1, 1, 1)
    dummy.updateMatrix()
    poleInst.setMatrixAt(i, dummy.matrix)
    dummy.position.set(x, 5.25, z)
    dummy.updateMatrix()
    bulbInst.setMatrixAt(i, dummy.matrix)
  })
  poleInst.castShadow = true
  scene.add(poleInst, bulbInst)

  // traffic lights at the plaza crossing
  for (const [x, z, rot] of [[10.6, 9.6, 0], [-10.6, -9.6, Math.PI], [10.6, -9.6, -Math.PI / 2]]) {
    addBox(0.16, 4.4, 0.16, M.dark, x, 2.2, z)
    const box = addBox(0.5, 1.25, 0.42, M.dark, x, 4.2, z, { rotY: rot })
    const light = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff5555 }))
    light.position.set(x + Math.sin(rot) * 0.24, 4.5, z + Math.cos(rot) * 0.24)
    scene.add(light)
  }

  // ---------------------------------------------------------------- moving cars
  const carColors = [0xf2f0e6, 0xe84f4f, 0x3e7be8, 0x2fd6a0, 0xffc83d, 0x9a6bff, 0xff8a3d, 0x39414f]
  const wheelGeo = new THREE.CylinderGeometry(0.34, 0.34, 0.26, 10)
  const wheelMat = new THREE.MeshLambertMaterial({ color: 0x171a20 })
  const windowMat = new THREE.MeshLambertMaterial({ color: 0x9fd6e8 })
  function makeCar(color) {
    const g = new THREE.Group()
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.62, 4.1), new THREE.MeshLambertMaterial({ color }))
    body.position.y = 0.62
    body.castShadow = true
    g.add(body)
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.62, 0.56, 2.1), windowMat)
    cabin.position.set(0, 1.12, -0.15)
    cabin.castShadow = true
    g.add(cabin)
    const roof = new THREE.Mesh(new THREE.BoxGeometry(1.55, 0.12, 1.9), new THREE.MeshLambertMaterial({ color }))
    roof.position.set(0, 1.44, -0.15)
    g.add(roof)
    for (const sx of [-0.98, 0.98]) {
      for (const sz of [-1.35, 1.35]) {
        const w = new THREE.Mesh(wheelGeo, wheelMat)
        w.rotation.z = Math.PI / 2
        w.position.set(sx, 0.34, sz)
        g.add(w)
      }
    }
    for (const sx of [-0.62, 0.62]) {
      const hl = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.16, 0.06), M.accentGold)
      hl.position.set(sx, 0.66, 2.06)
      g.add(hl)
      const tl = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.14, 0.06), new THREE.MeshBasicMaterial({ color: 0xff2b3d }))
      tl.position.set(sx, 0.66, -2.06)
      g.add(tl)
    }
    scene.add(g)
    return g
  }
  const carSpecs = [
    { axis: 'x', lane: 4.3, pos: -120, speed: 12, dir: 1 },
    { axis: 'x', lane: 4.3, pos: 20, speed: 10, dir: 1 },
    { axis: 'x', lane: 4.3, pos: 140, speed: 14, dir: 1 },
    { axis: 'x', lane: -4.3, pos: 90, speed: 11, dir: -1 },
    { axis: 'x', lane: -4.3, pos: -40, speed: 13, dir: -1 },
    { axis: 'z', lane: 4.1, pos: -80, speed: 9, dir: 1 },
    { axis: 'z', lane: -4.1, pos: 60, speed: 10, dir: -1 },
    { axis: 'z', lane: 4.1, pos: 120, speed: 8, dir: 1 },
  ]
  carSpecs.forEach((s, i) => {
    const mesh = makeCar(carColors[i % carColors.length])
    if (s.axis === 'x') {
      mesh.position.set(s.pos, 0, s.lane)
      mesh.rotation.y = s.dir > 0 ? Math.PI / 2 : -Math.PI / 2
    } else {
      mesh.position.set(s.lane, 0, s.pos)
      mesh.rotation.y = s.dir > 0 ? 0 : Math.PI
    }
    cars.push({ mesh, ...s })
  })

  // ---------------------------------------------------------------- pedestrians
  const pedCount = 16
  const bodyGeo = new THREE.CapsuleGeometry(0.2, 0.52, 3, 6)
  const headGeo = new THREE.SphereGeometry(0.17, 8, 6)
  const pedBodyInst = new THREE.InstancedMesh(bodyGeo, new THREE.MeshLambertMaterial({ color: 0xffffff }), pedCount)
  const pedHeadInst = new THREE.InstancedMesh(headGeo, new THREE.MeshLambertMaterial({ color: 0xffffff }), pedCount)
  const pedColors = [0xff8a5b, 0x59d9c7, 0xf2cf5b, 0xa88bff, 0xff6f91, 0x6fa8ff, 0x9fe06f]
  const skin = [0xf1c6a5, 0xd9a06e, 0x9c6a44, 0x6b452d]
  const pedPaths = [
    { axis: 'x', at: 14.5, min: -110, max: 190 },
    { axis: 'x', at: -14.5, min: -110, max: 190 },
    { axis: 'z', at: 12.8, min: -100, max: 140 },
    { axis: 'z', at: -12.8, min: -100, max: 140 },
    { axis: 'x', at: 107.8, min: -60, max: 180 },
  ]
  for (let i = 0; i < pedCount; i++) {
    const path = pedPaths[i % pedPaths.length]
    peds.push({
      path,
      t: rand(path.min, path.max),
      dir: rng() < 0.5 ? 1 : -1,
      speed: rand(0.9, 1.7),
      phase: rand(0, 6.28),
      scale: rand(0.88, 1.08),
    })
    pedBodyInst.setColorAt(i, new THREE.Color(pick(pedColors)))
    pedHeadInst.setColorAt(i, new THREE.Color(pick(skin)))
  }
  pedBodyInst.castShadow = true
  pedHeadInst.castShadow = true
  scene.add(pedBodyInst, pedHeadInst)

  // ---------------------------------------------------------------- coins
  const coinGeo = new THREE.CylinderGeometry(0.42, 0.42, 0.1, 14)
  const coinMat = new THREE.MeshStandardMaterial({
    color: 0xffc83d, emissive: 0xcc8a00, emissiveIntensity: 1.2,
    metalness: 0.8, roughness: 0.25,
  })
  const coinZones = [
    { x: -60, z: 52, r: 26, n: 12 },
    { x: 80, z: -70, r: 45, n: 12 },
    { x: 10, z: 0, r: 18, n: 6 },
    { x: 185, z: 20, r: 45, n: 10 },
    { x: 0, z: 90, r: 30, n: 8 },
  ]
  const coinPositions = []
  coinZones.forEach(zone => {
    for (let i = 0; i < zone.n; i++) {
      const a = rand(0, Math.PI * 2)
      const r = Math.sqrt(rng()) * zone.r
      const x = zone.x + Math.cos(a) * r
      const z = zone.z + Math.sin(a) * r
      if (Math.abs(x) < 9 && Math.abs(z - 10) < 150) continue
      if (x > 150 && x < 158) continue
      coinPositions.push({ x, z })
    }
  })
  const coinInst = new THREE.InstancedMesh(coinGeo, coinMat, coinPositions.length)
  coinInst.castShadow = false
  scene.add(coinInst)
  coinPositions.forEach((p, i) => {
    coins.push({ x: p.x, z: p.z, baseY: 0.95, active: true, respawn: 0, phase: rand(0, 6.28), index: i })
  })

  // ---------------------------------------------------------------- quest marker
  const marker = new THREE.Group()
  const beamMat = new THREE.MeshBasicMaterial({ color: 0x38f6ff, transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false })
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 34, 12, 1, true), beamMat)
  beam.position.y = 17
  marker.add(beam)
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(1.6, 2.1, 32),
    new THREE.MeshBasicMaterial({ color: 0x38f6ff, transparent: true, opacity: 0.8, side: THREE.DoubleSide }),
  )
  ring.rotation.x = -Math.PI / 2
  ring.position.y = 0.1
  marker.add(ring)
  const diamond = new THREE.Mesh(new THREE.OctahedronGeometry(1.15, 0), new THREE.MeshBasicMaterial({ color: 0x9ffcff }))
  diamond.position.y = 6.4
  marker.add(diamond)
  marker.visible = false
  scene.add(marker)

  // ---------------------------------------------------------------- sky / backdrop
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {
      topColor: { value: new THREE.Color('#27599f') },
      midColor: { value: new THREE.Color('#f28a68') },
      botColor: { value: new THREE.Color('#ffe3b0') },
    },
    vertexShader: `varying vec3 vPos; void main(){ vPos = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `
      uniform vec3 topColor; uniform vec3 midColor; uniform vec3 botColor;
      varying vec3 vPos;
      void main(){
        float h = normalize(vPos).y;
        vec3 col = mix(botColor, midColor, smoothstep(-0.02, 0.22, h));
        col = mix(col, topColor, smoothstep(0.2, 0.85, h));
        gl_FragColor = vec4(col, 1.0);
      }`,
  })
  const sky = new THREE.Mesh(new THREE.SphereGeometry(620, 32, 18), skyMat)
  scene.add(sky)

  const sun = new THREE.Mesh(new THREE.SphereGeometry(17, 20, 14), new THREE.MeshBasicMaterial({ color: 0xfff2c9 }))
  sun.position.set(300, 78, -300)
  scene.add(sun)
  const sunGlow = new THREE.Mesh(
    new THREE.SphereGeometry(38, 20, 14),
    new THREE.MeshBasicMaterial({ color: 0xffc27a, transparent: true, opacity: 0.28, depthWrite: false }),
  )
  sunGlow.position.copy(sun.position)
  scene.add(sunGlow)

  const cloudMat = new THREE.MeshBasicMaterial({ color: 0xffd9c4, transparent: true, opacity: 0.72 })
  for (let i = 0; i < 14; i++) {
    const cloud = new THREE.Mesh(new THREE.SphereGeometry(rand(8, 18), 10, 7), cloudMat)
    cloud.position.set(rand(-320, 360), rand(65, 120), rand(-360, 160))
    cloud.scale.set(rand(1.6, 3.4), rand(0.3, 0.55), 1)
    scene.add(cloud)
  }

  // distant hills
  const hillMat = new THREE.MeshLambertMaterial({ color: 0x6b6b93 })
  for (let i = 0; i < 9; i++) {
    const hill = new THREE.Mesh(new THREE.ConeGeometry(rand(38, 74), rand(28, 58), 6), hillMat)
    hill.position.set(-190 + i * 55, 8, -225 - rand(0, 60))
    scene.add(hill)
  }
  const westHills = new THREE.MeshLambertMaterial({ color: 0x7d7a9b })
  for (let i = 0; i < 5; i++) {
    const hill = new THREE.Mesh(new THREE.ConeGeometry(rand(30, 60), rand(20, 42), 5), westHills)
    hill.position.set(-250 - rand(0, 60), 6, -120 + i * 70)
    scene.add(hill)
  }

  // boundary fence around the playable area (visual only)
  const fenceMat = new THREE.MeshLambertMaterial({ color: 0x8a919e })
  const fencePosts = []
  for (let x = -136; x <= 226; x += 12) fencePosts.push([x, 168], [x, -146])
  for (let z = -144; z <= 166; z += 12) fencePosts.push([-138, z], [228, z])
  const postGeo = new THREE.BoxGeometry(0.14, 1.6, 0.14)
  const postInst = new THREE.InstancedMesh(postGeo, fenceMat, fencePosts.length)
  fencePosts.forEach(([x, z], i) => {
    dummy.position.set(x, 0.8, z)
    dummy.rotation.set(0, 0, 0)
    dummy.scale.set(1, 1, 1)
    dummy.updateMatrix()
    postInst.setMatrixAt(i, dummy.matrix)
  })
  postInst.castShadow = false
  scene.add(postInst)

  // ---------------------------------------------------------------- ground raycasting
  const ray = new THREE.Raycaster()
  ray.far = 80
  const down = new THREE.Vector3(0, -1, 0)
  const rayOrigin = new THREE.Vector3()

  function groundHeight(x, z, fromY = 8) {
    rayOrigin.set(x, fromY + 1.2, z)
    ray.set(rayOrigin, down)
    const hits = ray.intersectObjects(rideables, false)
    return hits.length ? hits[0].point.y : 0
  }

  // ---------------------------------------------------------------- update
  const coinDummy = new THREE.Object3D()
  const pedDummy = new THREE.Object3D()
  let coinClock = 0

  function update(dt, time) {
    // cars
    for (const car of cars) {
      car.pos += car.speed * car.dir * dt
      if (car.axis === 'x') {
        if (car.pos > 210) car.pos = -130
        if (car.pos < -130) car.pos = 210
        car.mesh.position.x = car.pos
      } else {
        if (car.pos > 155) car.pos = -120
        if (car.pos < -120) car.pos = 155
        car.mesh.position.z = car.pos
      }
    }

    // pedestrians
    for (let i = 0; i < peds.length; i++) {
      const p = peds[i]
      p.t += p.speed * p.dir * dt
      if (p.t > p.path.max) { p.t = p.path.max; p.dir = -1 }
      if (p.t < p.path.min) { p.t = p.path.min; p.dir = 1 }
      let x, z
      if (p.path.axis === 'x') { x = p.t; z = p.path.at }
      else { x = p.path.at; z = p.t }
      const bob = Math.abs(Math.sin(time * 6 + p.phase)) * 0.06
      pedDummy.position.set(x, 0.46 * p.scale + bob, z)
      pedDummy.rotation.set(0, p.path.axis === 'x' ? (p.dir > 0 ? Math.PI / 2 : -Math.PI / 2) : (p.dir > 0 ? 0 : Math.PI), 0)
      pedDummy.scale.setScalar(p.scale)
      pedDummy.updateMatrix()
      pedBodyInst.setMatrixAt(i, pedDummy.matrix)
      pedDummy.position.y += 0.52 * p.scale
      pedDummy.updateMatrix()
      pedHeadInst.setMatrixAt(i, pedDummy.matrix)
    }
    pedBodyInst.instanceMatrix.needsUpdate = true
    pedHeadInst.instanceMatrix.needsUpdate = true

    // coins
    coinClock += dt
    for (const c of coins) {
      if (!c.active) {
        c.respawn -= dt
        if (c.respawn <= 0) c.active = true
      }
      if (c.active) {
        const bob = Math.sin(time * 2.2 + c.phase) * 0.13
        coinDummy.position.set(c.x, c.baseY + bob, c.z)
        coinDummy.rotation.set(0, time * 3 + c.phase, Math.PI / 2)
        coinDummy.scale.setScalar(1)
      } else {
        coinDummy.position.set(c.x, -50, c.z)
        coinDummy.scale.setScalar(0.001)
      }
      coinDummy.updateMatrix()
      coinInst.setMatrixAt(c.index, coinDummy.matrix)
    }
    coinInst.instanceMatrix.needsUpdate = true

    // marker
    if (marker.visible) {
      ring.scale.setScalar(1 + Math.sin(time * 3.4) * 0.12)
      diamond.rotation.y = time * 1.8
      diamond.position.y = 6.4 + Math.sin(time * 2.2) * 0.35
      beamMat.opacity = 0.16 + Math.sin(time * 2.6) * 0.06
    }

    // water
    for (const f of foam) {
      f.mesh.position.x = f.baseX + Math.sin(time * f.speed + f.phase) * 2.4
    }
  }

  function setMarker(x, z, color = 0x38f6ff) {
    marker.position.set(x, 0, z)
    marker.visible = true
    beamMat.color.setHex(color)
    ring.material.color.setHex(color)
    diamond.material.color.setHex(color)
  }

  function hideMarker() {
    marker.visible = false
  }

  function collectCoin(c) {
    if (!c.active) return false
    c.active = false
    c.respawn = 26
    return true
  }

  const mapData = {
    bounds: { minX: -140, maxX: 230, minZ: -150, maxZ: 170 },
    roads: [
      { x1: -150, z1: 0, x2: 210, z2: 0, w: 17 },
      { x1: 0, z1: -140, x2: 0, z2: 160, w: 15 },
      { x1: -145, z1: 115, x2: 225, z2: 115, w: 13 },
      { x1: 22, z1: -75, x2: 146, z2: -75, w: 11 },
      { x1: 56, z1: -140, x2: 56, z2: -10, w: 11 },
      { x1: 116, z1: -140, x2: 116, z2: -10, w: 11 },
    ],
    zones: [
      { x: -60, z: 52, w: 74, d: 66, color: '#3d4a3c' },
      { x: 85, z: -75, w: 120, d: 120, color: '#2a3348' },
      { x: 185, z: 10, w: 70, d: 320, color: '#7a6a4a' },
      { x: 300, z: 10, w: 150, d: 340, color: '#1d5b73' },
    ],
    buildings,
    shop: { x: garageX, z: garageZ },
    skate: { x: -60, z: 52 },
  }

  const landmarks = {
    skate: { name: 'Skate Park', x: -60, z: 52 },
    downtown: { name: 'Downtown', x: 85, z: -75 },
    beach: { name: 'Sunset Beach', x: 185, z: 40 },
    pier: { name: 'Old Pier', x: 198, z: -38 },
    plaza: { name: 'Volt Plaza', x: 0, z: 0 },
    garage: { name: 'Volt Garage', x: garageX, z: garageZ },
  }

  scene.updateMatrixWorld(true)

  return {
    rideables,
    buildings,
    colliders,
    ramps,
    cars,
    coins,
    landmarks,
    mapData,
    groundHeight,
    update,
    setMarker,
    hideMarker,
    collectCoin,
    marker,
  }
}
