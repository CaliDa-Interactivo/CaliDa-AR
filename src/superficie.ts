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

/**
 * Alturas (m sobre el piso) de una superficie que sirve de mesa. Por debajo
 * de 60 cm son mesitas de centro, camas o sofás: la oficina quedaba casi en
 * el suelo, lejos y con la pantalla imposible de usar de pie.
 */
export const ALTURA_MIN_MESA = 0.6;
export const ALTURA_MAX_MESA = 1.3;

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
 * Altura válida: de 60 cm a 1,3 m sobre el piso. null si no hay ninguna.
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
    if (altura < ALTURA_MIN_MESA || altura > ALTURA_MAX_MESA) {
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

// ---- Malla del cuarto (Quest 3) -------------------------------------
//
// Si ninguna mesa está marcada como plano, se usa la malla del cuarto que
// arma el visor (mesh-detection): de sus triángulos horizontales a altura
// de mesa se arma una rejilla de zonas planas, y la huella de la
// estantería debe caer entera sobre zonas planas de la misma altura.

/** Una malla del visor: matriz de su espacio (16, por columnas), vértices e índices. */
export interface MallaReal {
  matriz: ArrayLike<number>;
  vertices: ArrayLike<number>;
  indices: ArrayLike<number>;
}

/** Diferencia de altura (m) que se acepta dentro de una misma superficie. */
const TOLERANCIA_ALTURA = 0.03;
/** Parte de la huella que debe ser plana y a la misma altura. */
const PARTE_PLANA = 0.85;

/** Zonas planas (horizontales, a altura de mesa) de la malla del cuarto, en celdas de `tam`. */
export class RejillaPlana {
  private celdas = new Map<number, number>();

  constructor(readonly tam = 0.04) {}

  private clave(ix: number, iz: number): number {
    return (ix + 32768) * 65536 + (iz + 32768);
  }

  get vacia(): boolean {
    return this.celdas.size === 0;
  }

  /** Altura de la zona plana en (x, z), o undefined si no hay. */
  altura(x: number, z: number): number | undefined {
    return this.celdas.get(this.clave(Math.floor(x / this.tam), Math.floor(z / this.tam)));
  }

  /** Vuelve a armar la rejilla con las mallas actuales. */
  armar(mallas: Iterable<MallaReal>, piso: number): void {
    this.celdas.clear();
    const t = this.tam;
    const p = [0, 0, 0, 0, 0, 0, 0, 0, 0];
    for (const malla of mallas) {
      const m = malla.matriz;
      const v = malla.vertices;
      const ind = malla.indices;
      const mundo = (i: number, o: number) => {
        const x = v[i * 3];
        const y = v[i * 3 + 1];
        const z = v[i * 3 + 2];
        p[o] = m[0] * x + m[4] * y + m[8] * z + m[12];
        p[o + 1] = m[1] * x + m[5] * y + m[9] * z + m[13];
        p[o + 2] = m[2] * x + m[6] * y + m[10] * z + m[14];
      };
      for (let k = 0; k + 2 < ind.length; k += 3) {
        mundo(ind[k], 0);
        mundo(ind[k + 1], 3);
        mundo(ind[k + 2], 6);
        // Normal: solo triángulos horizontales.
        const ux = p[3] - p[0];
        const uy = p[4] - p[1];
        const uz = p[5] - p[2];
        const vx = p[6] - p[0];
        const vy = p[7] - p[1];
        const vz = p[8] - p[2];
        const nx = uy * vz - uz * vy;
        const ny = uz * vx - ux * vz;
        const nz = ux * vy - uy * vx;
        const largo = Math.hypot(nx, ny, nz);
        if (largo < 1e-9 || Math.abs(ny) / largo < 0.96) {
          continue;
        }
        const y = (p[1] + p[4] + p[7]) / 3;
        const altura = y - piso;
        if (altura < ALTURA_MIN_MESA || altura > ALTURA_MAX_MESA) {
          continue;
        }
        // Celdas cuyo centro cae dentro del triángulo (en x, z).
        const x0 = Math.floor(Math.min(p[0], p[3], p[6]) / t);
        const x1 = Math.floor(Math.max(p[0], p[3], p[6]) / t);
        const z0 = Math.floor(Math.min(p[2], p[5], p[8]) / t);
        const z1 = Math.floor(Math.max(p[2], p[5], p[8]) / t);
        for (let ix = x0; ix <= x1; ix++) {
          for (let iz = z0; iz <= z1; iz++) {
            const cx = (ix + 0.5) * t;
            const cz = (iz + 0.5) * t;
            if (!dentroTriangulo(cx, cz, p[0], p[2], p[3], p[5], p[6], p[8])) {
              continue;
            }
            const c = this.clave(ix, iz);
            const antes = this.celdas.get(c);
            if (antes === undefined || y > antes) {
              this.celdas.set(c, y);
            }
          }
        }
      }
    }
  }
}

function dentroTriangulo(px: number, pz: number, ax: number, az: number, bx: number, bz: number, cx: number, cz: number): boolean {
  const d1 = (px - bx) * (az - bz) - (ax - bx) * (pz - bz);
  const d2 = (px - cx) * (bz - cz) - (bx - cx) * (pz - cz);
  const d3 = (px - ax) * (cz - az) - (cx - ax) * (pz - az);
  const neg = d1 < 0 || d2 < 0 || d3 < 0;
  const pos = d1 > 0 || d2 > 0 || d3 > 0;
  return !(neg && pos);
}

/**
 * Como buscarSuperficie, pero sobre las zonas planas de la malla del cuarto:
 * la huella (muestreada cada celda) debe caer al menos en un 85 % sobre
 * zonas planas de la misma altura (±3 cm); el resto puede tener objetos
 * encima o huecos de la malla.
 */
export function buscarSuperficieEnMalla(
  rejilla: RejillaPlana,
  deseado: { x: number; z: number; giro: number },
  ancho: number,
  fondo: number,
): Superficie | null {
  if (rejilla.vacia) {
    return null;
  }
  const giro = deseado.giro;
  const c = Math.cos(giro);
  const s = Math.sin(giro);
  const paso = rejilla.tam * 0.9;
  const nx = Math.max(2, Math.ceil(ancho / paso));
  const nz = Math.max(2, Math.ceil(fondo / paso));
  // Muestras de la huella: la mayoría (85 %) debe ser plana y a la misma altura;
  // el resto puede tener cosas encima (un libro, un teclado) o huecos de la malla.
  const total = (nx + 1) * (nz + 1);
  const alturas = new Float32Array(total);
  const alturaEn = (cx: number, cz: number): number | null => {
    let n = 0;
    let faltan = 0;
    const maxFaltan = Math.floor(total * (1 - PARTE_PLANA));
    for (let i = 0; i <= nx; i++) {
      const lx = -ancho / 2 + (ancho * i) / nx;
      for (let j = 0; j <= nz; j++) {
        const lz = -fondo / 2 + (fondo * j) / nz;
        const h = rejilla.altura(cx + lx * c + lz * s, cz - lx * s + lz * c);
        if (h === undefined) {
          if (++faltan > maxFaltan) {
            return null;
          }
        } else {
          alturas[n++] = h;
        }
      }
    }
    // Altura de la superficie: la mediana; cuentan las que están cerca de ella.
    const lista = alturas.slice(0, n).sort();
    const ref = lista[Math.floor(n / 2)];
    let suma = 0;
    let buenas = 0;
    for (let k = 0; k < n; k++) {
      if (Math.abs(lista[k] - ref) <= TOLERANCIA_ALTURA) {
        suma += lista[k];
        buenas++;
      }
    }
    return buenas >= total * PARTE_PLANA ? suma / buenas : null;
  };
  let mejor: Superficie | null = null;
  let mejorPuntaje = Infinity;
  for (let lz = -1.2; lz <= 0.35; lz += 0.05) {
    for (let lx = -0.8; lx <= 0.8; lx += 0.05) {
      const puntaje = Math.abs(lx) + Math.abs(lz);
      if (puntaje >= mejorPuntaje) {
        continue;
      }
      const cx = deseado.x + lx * c + lz * s;
      const cz = deseado.z - lx * s + lz * c;
      const h = alturaEn(cx, cz);
      if (h !== null) {
        mejorPuntaje = puntaje;
        mejor = { x: cx, z: cz, y: h, giro };
      }
    }
  }
  return mejor;
}
