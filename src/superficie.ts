// ============================================================
// superficie.ts — dónde poner la estantería sobre una superficie real
// (mesa, escritorio) que reconoce el visor con la detección de planos de
// WebXR. Sin three.js: se prueba con node (pruebas/superficie.prueba.ts).
// ============================================================

/** Dónde poner la estantería sobre una superficie real (coordenadas del espacio de referencia). */
export interface Superficie {
  /** Centro de la huella de la estantería. */
  x: number;
  z: number;
  /** Altura de la superficie real. */
  y: number;
  /** Giro (como raiz.rotation.y: el frente local −Z mira hacia (−sin, −cos)). */
  giro: number;
}

/** Superficies horizontales que no sirven de mesa (etiquetas de WebXR / Quest). */
const NO_SON_MESA = new Set(['floor', 'ceiling', 'couch', 'bed', 'lamp', 'plant', 'screen', 'window', 'door', 'wall art', 'wall']);

/** ¿El punto (x, z) del espacio del plano está dentro de su contorno? */
function dentroDelContorno(contorno: readonly DOMPointReadOnly[], x: number, z: number): boolean {
  let dentro = false;
  for (let i = 0, j = contorno.length - 1; i < contorno.length; j = i++) {
    const a = contorno[i];
    const b = contorno[j];
    if (a.z > z !== b.z > z && x < ((b.x - a.x) * (z - a.z)) / (b.z - a.z) + a.x) {
      dentro = !dentro;
    }
  }
  return dentro;
}

/**
 * Busca, entre los planos horizontales que reconoce el visor (mesas,
 * escritorios…), dónde poner la estantería: la huella completa
 * (`ancho` × `fondo`, centrada en el punto) debe quedar SOBRE la superficie.
 * Se prefiere lo más cercano a `deseado` (donde quedaría si flotara) con el
 * giro de la mirada, o alineado con los bordes de la mesa si casi coincide.
 * Altura válida: de 35 cm a 1,3 m sobre el piso. null si no hay ninguna.
 */
export function buscarSuperficie(
  cuadro: XRFrame,
  espacio: XRReferenceSpace,
  piso: number,
  deseado: { x: number; z: number; giro: number },
  ancho: number,
  fondo: number,
): Superficie | null {
  const planos = cuadro.detectedPlanes;
  if (!planos) {
    return null;
  }
  let mejor: Superficie | null = null;
  let mejorPuntaje = Infinity;
  const hw = ancho / 2;
  const hd = fondo / 2;
  for (const plano of planos) {
    if (String(plano.orientation).toLowerCase() !== 'horizontal') {
      continue;
    }
    const etiqueta = String(plano.semanticLabel ?? '').toLowerCase();
    if (NO_SON_MESA.has(etiqueta)) {
      continue;
    }
    const pose = cuadro.getPose(plano.planeSpace, espacio);
    if (!pose || plano.polygon.length < 3) {
      continue;
    }
    const m = pose.transform.matrix;
    const altura = m[13] - piso;
    if (altura < 0.35 || altura > 1.3) {
      continue;
    }
    // Ejes del plano en el mundo (para pasar puntos al espacio del plano).
    const tx = m[12];
    const tz = m[14];
    const enPlano = (x: number, z: number) => {
      const dx = x - tx;
      const dz = z - tz;
      return { x: dx * m[0] + dz * m[2], z: dx * m[8] + dz * m[10] };
    };
    const cabe = (cx: number, cz: number, giro: number) => {
      const c = Math.cos(giro);
      const s = Math.sin(giro);
      for (const [lx, lz] of [
        [0, 0],
        [-hw, -hd],
        [hw, -hd],
        [hw, hd],
        [-hw, hd],
      ]) {
        const p = enPlano(cx + lx * c + lz * s, cz - lx * s + lz * c);
        if (!dentroDelContorno(plano.polygon, p.x, p.z)) {
          return false;
        }
      }
      return true;
    };
    // Giros: el de la mirada y, si casi coincide, el de un borde de la mesa.
    const giros = [deseado.giro];
    const ejes = [Math.atan2(-m[0], -m[2]), Math.atan2(-m[8], -m[10])];
    for (const base of ejes) {
      for (let k = 0; k < 4; k++) {
        const g = base + (k * Math.PI) / 2;
        const d = Math.atan2(Math.sin(g - deseado.giro), Math.cos(g - deseado.giro));
        if (Math.abs(d) < 0.6) {
          giros.push(deseado.giro + d);
        }
      }
    }
    for (const giro of giros) {
      const c = Math.cos(giro);
      const s = Math.sin(giro);
      const extraGiro = giro === deseado.giro ? 0 : 0.05;
      // Corrimientos de lado (lx) y de fondo (lz) en el frente de la persona:
      // hasta 1,2 m más adelante y 80 cm a cada lado.
      for (let lz = -1.2; lz <= 0.35; lz += 0.05) {
        for (let lx = -0.8; lx <= 0.8; lx += 0.05) {
          const puntaje = Math.abs(lx) + Math.abs(lz) + extraGiro;
          if (puntaje >= mejorPuntaje) {
            continue;
          }
          const cx = deseado.x + lx * c + lz * s;
          const cz = deseado.z - lx * s + lz * c;
          if (cabe(cx, cz, giro)) {
            mejorPuntaje = puntaje;
            mejor = { x: cx, z: cz, y: m[13], giro };
          }
        }
      }
    }
  }
  return mejor;
}
