// ============================================================
// oclusion.ts — que las manos reales tapen lo virtual.
//
//  · Por defecto (Quest 3): three.js escribe la profundidad real del visor
//    en el búfer de profundidad antes de dibujar, así lo real (las manos)
//    tapa lo virtual a ras, con borde nítido. No hace falta nada aquí.
//  · Con ?oclusionsuave: el DepthSensingSystem de IWSDK compara la
//    profundidad real con la de cada píxel virtual (borde suave). IWSDK
//    solo parcha los materiales que existen cuando se marca la entidad;
//    como en la oficina aparecen objetos todo el tiempo (cajas,
//    donaciones), aquí se parchan también los nuevos, y se corrige el
//    factor de metros que dejaba la escena invisible en el Quest.
//  · La mano real tapa lo virtual con OclusorManos (abajo): una mano
//    invisible armada con las articulaciones y radios reales que da
//    WebXR. La malla de la mano de IWSDK no se dibuja ni tapa nada: es
//    genérica, no coincide con la mano real y dejaba una silueta gris
//    corrida sobre los objetos.
//  · Los objetos no cambian de color cerca de la mano: solo se recortan
//    donde la mano real está delante.
//  · Lo que se lleva en la mano nunca se tapa (ver interaccion.ts).
// ============================================================
import {
  BackSide,
  BufferAttribute,
  BufferGeometry,
  CylinderGeometry,
  DepthSensingSystem,
  DoubleSide,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  Quaternion,
  SphereGeometry,
  Vector3,
  type Entity,
  type Material,
  type Object3D,
  type World,
} from '@iwsdk/core';
import type { Mano } from './manos.js';
import { radioSeguro } from './seguridad-oclusion.js';

/** La malla de la mano de IWSDK: no se dibuja (ni color ni profundidad). */
const INVISIBLE = new MeshBasicMaterial({ visible: false });

type Uniformes = Record<string, { value: unknown }>;

export class Oclusion {
  private parchados = new WeakSet<Material>();
  private t = 1;

  constructor(
    private world: World,
    private raiz: Object3D,
    private raizEnt: Entity,
  ) {}

  /** ¿El visor concedió la profundidad del entorno? */
  get conProfundidad(): boolean {
    return !!this.world.xrSession?.enabledFeatures?.includes('depth-sensing');
  }

  actualizar(dt: number, manos: (Object3D | undefined)[]): void {
    const profundidad = this.conProfundidad;
    // Mano de IWSDK: invisible (la mano real la recorta la profundidad).
    for (const modelo of manos) {
      if (modelo && modelo.visible) {
        modelo.visible = false;
      }
      modelo?.traverse((o) => {
        const m = o as Mesh;
        if (m.isMesh && m.material !== INVISIBLE) {
          m.material = INVISIBLE;
        }
      });
    }
    const sistema = this.world.getSystem(DepthSensingSystem) as unknown as
      | { entityShaderMap?: Map<Entity, Set<Uniformes>> }
      | undefined;
    const uniformes = sistema?.entityShaderMap?.get(this.raizEnt);
    if (uniformes && !this.corrector) {
      this.instalarCorrector(uniformes);
    }
    this.t += dt;
    if (!profundidad || this.t < 0.5) {
      return;
    }
    this.t = 0;
    if (!uniformes) {
      return;
    }
    this.raiz.traverse((o) => {
      const m = o as Mesh;
      if (!m.isMesh) {
        return;
      }
      for (const mat of Array.isArray(m.material) ? m.material : [m.material]) {
        if (mat && !this.parchados.has(mat)) {
          this.parchados.add(mat);
          this.parchar(mat, uniformes);
        }
      }
    });
  }

  private corrector = false;

  /**
   * Corrección para el Quest 3. Con la profundidad de la GPU, IWSDK pasa a
   * metros con `rawValueToMeters × depthNear / (1 − valor)`: esa fórmula ya
   * da metros, así que el factor debe ser 1. El Quest reporta otro factor
   * (el de milímetros), con lo que todo lo real parecía estar pegado a los
   * ojos y la escena virtual entera quedaba "tapada" (no se veía nada).
   * Justo antes de dibujar (después de que IWSDK pone sus valores) se deja
   * el factor en 1.
   */
  private instalarCorrector(uniformes: Set<Uniformes>): void {
    this.corrector = true;
    const escena = this.world.scene;
    const previo = escena.onBeforeRender.bind(escena);
    escena.onBeforeRender = (...args) => {
      previo(...args);
      if (this.world.xrSession?.depthUsage !== 'gpu-optimized') {
        return;
      }
      for (const u of uniformes) {
        const factor = u.uRawValueToMeters;
        if (factor && factor.value !== 1) {
          factor.value = 1;
        }
      }
    };
  }

  private parchar(mat: Material, uniformes: Set<Uniformes>): void {
    if ((mat.userData.shader as { uniforms?: Uniformes } | undefined)?.uniforms?.occlusionEnabled) {
      return; // ya lo parchó IWSDK
    }
    mat.transparent = true;
    const previo = mat.onBeforeCompile.bind(mat);
    mat.onBeforeCompile = (shader, renderer) => {
      previo(shader, renderer);
      if (!shader.uniforms.occlusionEnabled) {
        (DepthSensingSystem as unknown as { addOcclusionToShader: (s: unknown) => void }).addOcclusionToShader(shader);
      }
      mat.userData.shader = shader;
      uniformes.add(shader.uniforms as Uniformes);
    };
    mat.needsUpdate = true;
  }
}

/**
 * Pone un objeto "encima de todo" mientras se lleva en la mano: se dibuja
 * de último (renderOrder alto, en la cola de transparentes), justo después
 * de borrar la profundidad (así ninguna otra cosa ni la mano lo tapan,
 * pero sus propias partes sí se ordenan bien) y sin oclusión por la
 * profundidad real. Devuelve la función que lo deja como estaba.
 */
export function ponerEncima(obj: Object3D, limpiador: Mesh): () => void {
  const mallas: { m: Mesh; orden: number; antes: Mesh['onBeforeRender']; despues: Mesh['onAfterRender'] }[] = [];
  const materiales = new Map<Material, boolean>();
  obj.traverse((o) => {
    const m = o as Mesh;
    if (!m.isMesh || m === limpiador) {
      return;
    }
    mallas.push({ m, orden: m.renderOrder, antes: m.onBeforeRender, despues: m.onAfterRender });
    m.renderOrder = 1000;
    const lista = () => (Array.isArray(m.material) ? m.material : [m.material]).filter(Boolean);
    for (const mat of lista()) {
      if (!materiales.has(mat)) {
        materiales.set(mat, mat.transparent);
        mat.transparent = true;
      }
    }
    // Sin oclusión por profundidad solo mientras se dibuja esta malla.
    let guardado: { u: { value: unknown }; v: unknown }[] = [];
    m.onBeforeRender = () => {
      guardado = [];
      for (const mat of lista()) {
        const u = (mat.userData.shader as { uniforms?: Uniformes } | undefined)?.uniforms?.occlusionEnabled;
        if (u) {
          guardado.push({ u, v: u.value });
          u.value = false;
        }
      }
    };
    m.onAfterRender = () => {
      for (const { u, v } of guardado) {
        u.value = v;
      }
      guardado = [];
    };
  });
  obj.add(limpiador);
  return () => {
    limpiador.removeFromParent();
    for (const { m, orden, antes, despues } of mallas) {
      m.renderOrder = orden;
      m.onBeforeRender = antes;
      m.onAfterRender = despues;
    }
    materiales.forEach((transparente, mat) => (mat.transparent = transparente));
  };
}

// ---- Mano real que tapa lo virtual (sin depender de la profundidad) ----
//
// WebXR da la posición y el radio REAL de las 25 articulaciones de cada
// mano. Con eso se arma, cada cuadro, una mano invisible ajustada a la
// mano de verdad: una esfera por articulación, una cápsula por cada hueso
// (con el grosor de sus articulaciones) y la palma rellena. No pinta
// color, solo profundidad, y se dibuja antes que todo: lo virtual que
// queda detrás de la mano real no se dibuja y se ve la mano (passthrough).

/** Huesos (pares de articulaciones) que se cubren con una cápsula. */
const HUESOS: [number, number][] = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8], [8, 9],
  [0, 10], [10, 11], [11, 12], [12, 13], [13, 14],
  [0, 15], [15, 16], [16, 17], [17, 18], [18, 19],
  [0, 20], [20, 21], [21, 22], [22, 23], [23, 24],
  // Nudillos unidos (el borde de la palma).
  [6, 11], [11, 16], [16, 21],
];
/** Triángulos de la palma (índices de articulaciones). */
const PALMA = [0, 5, 6, 0, 6, 11, 0, 11, 16, 0, 16, 21, 0, 21, 20, 1, 2, 5, 0, 1, 5];
const N_ART = 25;

/** Lo que se dibuja de una mano: posiciones (25 × xyz) y radios de sus articulaciones. */
export interface DatosMano {
  articulaciones: Float32Array;
  radios: Float32Array;
}

export interface OpcionesPiezas {
  material: Material;
  /** Lo que se suma al radio real (m). */
  margen: number;
  /** Factor del radio real (por defecto 1). La mano invisible usa un poco menos: sin halo. */
  escalaRadio?: number;
  orden: number;
  /** Rellenar la palma (para tapar). */
  palma: boolean;
  /** Solo contorno: sin la muñeca ni sus huesos (la línea se desvanece hacia el brazo). */
  contorno: boolean;
  /**
   * Esferas intermedias por hueso: el grosor pasa suave de una articulación a
   * la otra (dedo orgánico, que se afina hacia la punta) en vez de un tubo recto.
   */
  intermedias?: number;
}

/** Esferas, cápsulas y palma de una o dos manos (para tapar, dibujar o contornear). */
export class PiezasMano {
  readonly grupo = new Group();
  private esferas: InstancedMesh;
  private capsulas: InstancedMesh;
  private palmas: Mesh[] = [];
  private m = new Matrix4();
  private a = new Vector3();
  private b = new Vector3();
  private d = new Vector3();
  private q = new Quaternion();
  private s = new Vector3();
  private arriba = new Vector3(0, 1, 0);

  constructor(private op: OpcionesPiezas) {
    // Muchos segmentos: el borde de los dedos se ve redondo, no en rectas.
    const extra = (op.intermedias ?? 0) * HUESOS.length;
    this.esferas = new InstancedMesh(new SphereGeometry(1, 24, 16), op.material, (N_ART + extra) * 2);
    this.capsulas = new InstancedMesh(new CylinderGeometry(1, 1, 1, 24, 1, true), op.material, HUESOS.length * 2);
    for (const malla of [this.esferas, this.capsulas]) {
      malla.renderOrder = op.orden;
      malla.frustumCulled = false;
      malla.count = 0;
      malla.userData.sinContorno = true;
      this.grupo.add(malla);
    }
    for (let k = 0; k < 2 && op.palma; k++) {
      const g = new BufferGeometry();
      g.setAttribute('position', new BufferAttribute(new Float32Array(N_ART * 3), 3));
      g.setIndex(PALMA);
      const palma = new Mesh(g, op.material);
      palma.renderOrder = op.orden;
      palma.frustumCulled = false;
      palma.visible = false;
      palma.userData.sinContorno = true;
      this.palmas.push(palma);
      this.grupo.add(palma);
    }
  }

  /** `manos[k]` null = esa mano no está. */
  actualizar(manos: (DatosMano | null)[]): void {
    let nE = 0;
    let nC = 0;
    const margen = this.op.margen;
    const f = this.op.escalaRadio ?? 1;
    manos.forEach((mano, k) => {
      const palma = this.palmas[k];
      if (!mano) {
        if (palma) {
          palma.visible = false;
        }
        return;
      }
      const p = mano.articulaciones;
      const r = mano.radios;
      for (let i = 0; i < N_ART; i++) {
        if (this.op.contorno && SIN_CONTORNO.has(i)) {
          continue;
        }
        const radio = radioSeguro(r[i]) * f + margen;
        this.m.makeScale(radio, radio, radio).setPosition(p[i * 3], p[i * 3 + 1], p[i * 3 + 2]);
        this.esferas.setMatrixAt(nE++, this.m);
      }
      for (const [i, j] of HUESOS) {
        if (this.op.contorno && i === 0) {
          continue;
        }
        this.a.set(p[i * 3], p[i * 3 + 1], p[i * 3 + 2]);
        this.b.set(p[j * 3], p[j * 3 + 1], p[j * 3 + 2]);
        this.d.subVectors(this.b, this.a);
        const largo = this.d.length();
        if (largo < 1e-4) {
          continue;
        }
        const ri = radioSeguro(r[i]) * f + margen;
        const rj = radioSeguro(r[j]) * f + margen;
        // Esferas intermedias con el grosor interpolado: el hueso se afina
        // suave hacia la punta y las uniones quedan redondeadas.
        const n = this.op.intermedias ?? 0;
        for (let t = 1; t <= n; t++) {
          const k = t / (n + 1);
          const radioK = ri + (rj - ri) * k;
          this.m
            .makeScale(radioK, radioK, radioK)
            .setPosition(this.a.x + this.d.x * k, this.a.y + this.d.y * k, this.a.z + this.d.z * k);
          this.esferas.setMatrixAt(nE++, this.m);
        }
        const radio = Math.min(ri, rj);
        this.q.setFromUnitVectors(this.arriba, this.d.multiplyScalar(1 / largo));
        this.s.set(radio, largo, radio);
        this.a.add(this.b).multiplyScalar(0.5);
        this.m.compose(this.a, this.q, this.s);
        this.capsulas.setMatrixAt(nC++, this.m);
      }
      if (palma) {
        const pos = palma.geometry.getAttribute('position') as BufferAttribute;
        (pos.array as Float32Array).set(p);
        pos.needsUpdate = true;
        palma.visible = true;
      }
    });
    this.esferas.count = nE;
    this.capsulas.count = nC;
    this.esferas.instanceMatrix.needsUpdate = true;
    this.capsulas.instanceMatrix.needsUpdate = true;
  }
}

/** La muñeca y la base de los dedos no llevan línea (se desvanece hacia el brazo, como en el Quest). */
const SIN_CONTORNO = new Set([0, 1, 5, 10, 15, 20]);

/** No pinta color, solo profundidad: tapa lo virtual que queda detrás. */
const MATERIAL_TAPA = new MeshBasicMaterial({ colorWrite: false, side: DoubleSide });
/** Línea blanca fina alrededor de la mano de ejemplo (demo.ts). */
export const MATERIAL_LINEA = new MeshBasicMaterial({
  color: '#FFFFFF',
  side: BackSide,
  transparent: true,
  opacity: 0.9,
  depthWrite: false,
  toneMapped: false,
});
/** Grosor de la línea blanca (m). */
export const GROSOR_LINEA = 0.0022;

/**
 * Brazo de una persona adulta (m): del hombro al codo y del codo a la
 * muñeca, y el grosor del antebrazo junto a la muñeca y junto al codo.
 */
export const BRAZO = { superior: 0.29, antebrazo: 0.26, radioMuneca: 0.027, radioCodo: 0.04 };
/** Hombro respecto a los ojos: más abajo, hacia el lado de cada mano y un poco atrás (m). */
const HOMBRO = { abajo: 0.24, lado: 0.18, atras: 0.06 };
/** Esferas a lo largo del antebrazo (más: borde más suave). */
const ESFERAS_ANTEBRAZO = 12;

/**
 * Dónde está el codo, a partir del hombro (estimado desde la cabeza) y de la
 * muñeca (real): un brazo de dos huesos con el codo hacia abajo y un poco
 * afuera, como cae naturalmente. Escribe el codo en `salida`.
 */
export function estimarCodo(
  hombro: { x: number; y: number; z: number },
  muneca: { x: number; y: number; z: number },
  afuera: { x: number; z: number },
  salida: { x: number; y: number; z: number },
): void {
  const L1 = BRAZO.superior;
  const L2 = BRAZO.antebrazo;
  let dx = muneca.x - hombro.x;
  let dy = muneca.y - hombro.y;
  let dz = muneca.z - hombro.z;
  const d0 = Math.hypot(dx, dy, dz) || 1e-6;
  dx /= d0;
  dy /= d0;
  dz /= d0;
  // Brazo estirado de más (la estimación del hombro no es exacta): codo en la línea.
  const d = Math.min(d0, L1 + L2 - 1e-4);
  // Distancia del hombro al pie del codo sobre la línea hombro–muñeca, y altura del codo.
  const a = (L1 * L1 - L2 * L2 + d * d) / (2 * d);
  const h = Math.sqrt(Math.max(0, L1 * L1 - a * a));
  // El codo cae hacia abajo y un poco hacia afuera (perpendicular a la línea).
  let px = afuera.x * 0.5;
  let py = -1;
  let pz = afuera.z * 0.5;
  const punto = px * dx + py * dy + pz * dz;
  px -= punto * dx;
  py -= punto * dy;
  pz -= punto * dz;
  const lp = Math.hypot(px, py, pz);
  if (lp < 1e-6) {
    px = 0;
    py = -1;
    pz = 0;
  } else {
    px /= lp;
    py /= lp;
    pz /= lp;
  }
  // Desde la muñeca, el codo queda a la distancia real del antebrazo.
  const ex = hombro.x + dx * a + px * h;
  const ey = hombro.y + dy * a + py * h;
  const ez = hombro.z + dz * a + pz * h;
  let fx = ex - muneca.x;
  let fy = ey - muneca.y;
  let fz = ez - muneca.z;
  const lf = Math.hypot(fx, fy, fz) || 1e-6;
  fx /= lf;
  fy /= lf;
  fz /= lf;
  salida.x = muneca.x + fx * L2;
  salida.y = muneca.y + fy * L2;
  salida.z = muneca.z + fz * L2;
}

/**
 * La mano real tapa lo virtual a ras (radio real, sin margen), con dedos que
 * se afinan suave, y también el antebrazo: de la muñeca hacia el codo, que se
 * estima con el hombro (a partir de la cabeza) para que siga al brazo real
 * aunque se doble la muñeca. No se dibuja nada: se ve la mano real (passthrough).
 */
export class OclusorManos {
  readonly grupo = new Group();
  private tapa = new PiezasMano({
    material: MATERIAL_TAPA,
    margen: 0,
    escalaRadio: 0.92,
    orden: -10,
    palma: true,
    contorno: false,
    intermedias: 3,
  });
  private datos: (DatosMano | null)[] = [null, null];
  private brazoCil: InstancedMesh;
  private brazoEsf: InstancedMesh;
  private m = new Matrix4();
  private a = new Vector3();
  private b = new Vector3();
  private d = new Vector3();
  private c = new Vector3();
  private q = new Quaternion();
  private s = new Vector3();
  private arriba = new Vector3(0, 1, 0);
  private cabeza = new Vector3();
  private frente = new Vector3(0, 0, -1);
  private hombro = new Vector3();
  private codo = new Vector3();
  private codoSuave = [new Vector3(), new Vector3()];
  private hayCodo = [false, false];
  private afuera = { x: 0, z: 0 };

  constructor() {
    this.brazoCil = new InstancedMesh(new CylinderGeometry(1, 1, 1, 24, 1, true), MATERIAL_TAPA, ESFERAS_ANTEBRAZO * 2);
    this.brazoEsf = new InstancedMesh(new SphereGeometry(1, 24, 16), MATERIAL_TAPA, (ESFERAS_ANTEBRAZO + 1) * 2);
    for (const malla of [this.brazoCil, this.brazoEsf]) {
      malla.renderOrder = -10;
      malla.frustumCulled = false;
      malla.count = 0;
      malla.userData.sinContorno = true;
    }
    this.grupo.add(this.tapa.grupo, this.brazoCil, this.brazoEsf);
  }

  /**
   * `cabeza` y `frente`: posición de los ojos y hacia dónde mira, en
   * coordenadas del mundo (para estimar los hombros).
   */
  actualizar(manos: Mano[], cabeza?: Vector3, frente?: Vector3): void {
    manos.forEach((mano, k) => (this.datos[k] = mano.conArticulaciones ? mano : null));
    this.tapa.actualizar(this.datos);
    const conCabeza = !!cabeza && !!frente;
    if (cabeza && frente) {
      // Cabeza y su frente (horizontal) en las coordenadas de las manos.
      this.grupo.updateWorldMatrix(true, false);
      this.cabeza.copy(cabeza);
      this.grupo.worldToLocal(this.cabeza);
      this.d.copy(cabeza).add(frente);
      this.grupo.worldToLocal(this.d);
      this.frente.subVectors(this.d, this.cabeza);
      this.frente.y = 0;
      if (this.frente.lengthSq() < 1e-6) {
        this.frente.set(0, 0, -1);
      }
      this.frente.normalize();
    }
    let nC = 0;
    let nE = 0;
    manos.forEach((mano, k) => {
      if (!mano.conArticulaciones || (mano.lado !== 'left' && mano.lado !== 'right')) {
        this.hayCodo[k] = false;
        return;
      }
      const p = mano.articulaciones;
      const muneca = this.a.set(p[0], p[1], p[2]);
      // Afuera: a la derecha de la mirada para la mano derecha, a la izquierda para la izquierda.
      const signo = mano.lado === 'right' ? 1 : -1;
      this.afuera.x = -this.frente.z * signo;
      this.afuera.z = this.frente.x * signo;
      if (conCabeza) {
        this.hombro.set(
          this.cabeza.x + this.afuera.x * HOMBRO.lado - this.frente.x * HOMBRO.atras,
          this.cabeza.y - HOMBRO.abajo,
          this.cabeza.z + this.afuera.z * HOMBRO.lado - this.frente.z * HOMBRO.atras,
        );
        estimarCodo(this.hombro, muneca, this.afuera, this.codo);
      } else {
        // Sin cabeza: hacia atrás de la muñeca, en el sentido que se aleja de la palma.
        this.d.set(0, 0, 1).applyQuaternion(mano.giro);
        this.c.set(p[0] - p[30], p[1] - p[31], p[2] - p[32]);
        if (this.d.dot(this.c) < 0) {
          this.d.negate();
        }
        this.codo.copy(muneca).addScaledVector(this.d, BRAZO.antebrazo);
      }
      // El codo se mueve suave (no tiembla con la muñeca).
      const suave = this.codoSuave[k];
      if (this.hayCodo[k]) {
        suave.lerp(this.codo, 0.35);
      } else {
        suave.copy(this.codo);
        this.hayCodo[k] = true;
      }
      // Antebrazo: esferas y tramos que se ensanchan de la muñeca al codo.
      this.d.subVectors(suave, muneca);
      const largo = this.d.length();
      if (largo < 1e-3) {
        return;
      }
      this.d.multiplyScalar(1 / largo);
      this.q.setFromUnitVectors(this.arriba, this.d);
      for (let i = 0; i <= ESFERAS_ANTEBRAZO; i++) {
        const t = i / ESFERAS_ANTEBRAZO;
        const r = radioAntebrazo(t);
        this.b.copy(muneca).addScaledVector(this.d, largo * t);
        this.m.makeScale(r, r, r).setPosition(this.b.x, this.b.y, this.b.z);
        this.brazoEsf.setMatrixAt(nE++, this.m);
        if (i > 0) {
          const t0 = (i - 1) / ESFERAS_ANTEBRAZO;
          const rc = Math.min(radioAntebrazo(t0), r);
          this.c.copy(muneca).addScaledVector(this.d, largo * (t0 + t) * 0.5);
          this.s.set(rc, largo / ESFERAS_ANTEBRAZO, rc);
          this.m.compose(this.c, this.q, this.s);
          this.brazoCil.setMatrixAt(nC++, this.m);
        }
      }
    });
    this.brazoCil.count = nC;
    this.brazoEsf.count = nE;
    this.brazoCil.instanceMatrix.needsUpdate = true;
    this.brazoEsf.instanceMatrix.needsUpdate = true;
  }
}

/** Grosor del antebrazo: delgado en la muñeca, se ensancha rápido y llega al del codo. */
function radioAntebrazo(t: number): number {
  return BRAZO.radioMuneca + (BRAZO.radioCodo - BRAZO.radioMuneca) * Math.sqrt(t);
}
