// From AirsupHQ/airsup-lab (MIT) — src/engine/raptor.ts (excerpt: only the GEO thrust chamber contour that plume.ts needs)
// @ts-nocheck -- upstream compiles under a looser tsconfig (no noUncheckedIndexedAccess); kept as-is
import type { P2 } from '../core/geometry'

const D = Math.PI / 180

/* ------------------------------------------------------------------------ */
/* Thrust chamber contour. Engine frame: +Y from nozzle to powerhead, the    */
/* injector face at y = 0. Units are metres at full size.                    */
/* ------------------------------------------------------------------------ */

export const GEO = (() => {
  const Rt = 0.115, Rc = 0.205, beta = 32 * D, r1 = 0.08, r2 = 1.5 * Rt, r3 = 0.382 * Rt
  const thN = 32 * D, thE = 8 * D, Re = 0.67, Lcyl = 0.24, Ln = 1.6
  const ra = Rt + r2 * (1 - Math.cos(beta)), ya = r2 * Math.sin(beta)
  const re1 = Rc - r1 * (1 - Math.cos(beta))
  const ye1 = ya + (re1 - ra) / Math.tan(beta)
  const yc1 = ye1 + r1 * Math.sin(beta)
  const yT = -Lcyl - yc1
  const yE = yT - Ln
  const pts: P2[] = []
  for (let i = 0; i <= 12; i++) pts.push([Rc, -(Lcyl * i) / 12])
  for (let i = 1; i <= 16; i++) {
    const ph = -(beta * i) / 16
    pts.push([Rc - r1 + r1 * Math.cos(ph), yT + yc1 + r1 * Math.sin(ph)])
  }
  for (let i = 0; i <= 20; i++) {
    const ph = Math.PI - beta + (beta * i) / 20
    pts.push([Rt + r2 + r2 * Math.cos(ph), yT + r2 * Math.sin(ph)])
  }
  for (let i = 1; i <= 12; i++) {
    const ph = Math.PI + (thN * i) / 12
    pts.push([Rt + r3 + r3 * Math.cos(ph), yT + r3 * Math.sin(ph)])
  }
  const N = pts[pts.length - 1]
  const dN: P2 = [Math.sin(thN), -Math.cos(thN)]
  const dE: P2 = [Math.sin(thE), -Math.cos(thE)]
  const E: P2 = [Re, yE]
  const det = dN[0] * -dE[1] - dN[1] * -dE[0]
  const bx = E[0] - N[0], by = E[1] - N[1]
  const a = (bx * -dE[1] - by * -dE[0]) / det
  const Q: P2 = [N[0] + a * dN[0], N[1] + a * dN[1]]
  for (let i = 1; i <= 96; i++) {
    const t = i / 96
    pts.push([
      (1 - t) * (1 - t) * N[0] + 2 * (1 - t) * t * Q[0] + t * t * E[0],
      (1 - t) * (1 - t) * N[1] + 2 * (1 - t) * t * Q[1] + t * t * E[1],
    ])
  }
  const ys = pts.map((p) => p[1]), rs = pts.map((p) => p[0])
  const Rin = (y: number) => {
    if (y >= 0) return Rc
    if (y <= yE) return Re
    let lo = 0, hi = ys.length - 1
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1
      if (ys[mid] > y) lo = mid
      else hi = mid
    }
    const t = (y - ys[lo]) / (ys[hi] - ys[lo] || 1)
    return rs[lo] + (rs[hi] - rs[lo]) * t
  }
  return { Rt, Rc, Re, yT, yE, yCyl: -Lcyl, Rin, contour: pts, top: 1.1 }
})()

const tL = 0.011, tC = 0.014
