// From AirsupHQ/airsup-lab (MIT) — src/scene/room.ts (excerpt: studioEnvironment only, exported)
import * as THREE from 'three'

export function studioEnvironment(renderer: THREE.WebGLRenderer) {
  const s = new THREE.Scene()
  const grad = document.createElement('canvas')
  grad.width = 4
  grad.height = 256
  const g = grad.getContext('2d')!
  const lg = g.createLinearGradient(0, 0, 0, 256)
  lg.addColorStop(0, '#4a4c56')
  lg.addColorStop(0.5, '#2c2a2c')
  lg.addColorStop(1, '#17150f')
  g.fillStyle = lg
  g.fillRect(0, 0, 4, 256)
  const gt = new THREE.CanvasTexture(grad)
  gt.colorSpace = THREE.SRGBColorSpace
  const dome = new THREE.Mesh(new THREE.SphereGeometry(30, 32, 16), new THREE.MeshBasicMaterial({ map: gt, side: THREE.BackSide }))
  s.add(dome)
  // softbox texture: bright core with a soft falloff to the edge
  const sb = document.createElement('canvas')
  sb.width = sb.height = 128
  const c = sb.getContext('2d')!
  const rg = c.createRadialGradient(64, 64, 10, 64, 64, 64)
  rg.addColorStop(0, '#ffffff')
  rg.addColorStop(0.65, '#f4f4f4')
  rg.addColorStop(1, '#000000')
  c.fillStyle = rg
  c.fillRect(0, 0, 128, 128)
  const st = new THREE.CanvasTexture(sb)
  const panel = (w: number, h: number, p: [number, number, number], look: [number, number, number], color: number, k: number) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: st, color: new THREE.Color(color).multiplyScalar(k), side: THREE.DoubleSide }))
    m.position.set(...p)
    m.lookAt(...look)
    s.add(m)
  }
  panel(12, 5, [0, 9, 1], [0, 0, 0], 0xfff3e6, 5.0) // overhead
  panel(16, 1.4, [0, 4.5, 8], [0, 1.2, 0], 0xf4f7ff, 3.2) // long front strip, high
  panel(16, 1.0, [0, 1.6, 9], [0, 1.2, 0], 0xdfe8ff, 1.2) // long front strip, low
  panel(14, 1.6, [0, 5, -9], [0, 1.2, 0], 0x8fb4ff, 2.6) // cool back rim
  panel(2.5, 9, [-10, 3, -2], [0, 2, 0], 0xa8c6ff, 2.0) // cool side
  panel(2.5, 9, [10, 3, 1], [0, 2, 0], 0xffd6ae, 2.2) // warm side
  panel(10, 10, [0, -3, 0], [0, 1, 0], 0x2a241e, 0.6) // floor bounce
  const pm = new THREE.PMREMGenerator(renderer)
  const tex = pm.fromScene(s, 0.02).texture
  pm.dispose()
  return tex
}
