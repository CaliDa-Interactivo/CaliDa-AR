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
  orden: number;
  /** Rellenar la palma (para tapar). */
  palma: boolean;
  /** Solo contorno: sin la muñeca ni sus huesos (la línea se desvanece hacia el brazo). */
  contorno: boolean;
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
    this.esferas = new InstancedMesh(new SphereGeometry(1, 14, 10), op.material, N_ART * 2);
    this.capsulas = new InstancedMesh(new CylinderGeometry(1, 1, 1, 12, 1, true), op.material, HUESOS.length * 2);
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
        const radio = r[i] + margen;
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
        const radio = Math.min(r[i], r[j]) + margen;
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
/** Línea blanca fina alrededor de la mano (como la de las manos del Quest). */
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
 * La mano real tapa lo virtual a ras (radio real, sin margen) y lleva una
 * línea blanca fina alrededor. No se dibuja nada más de la mano: se ve la
 * mano real (passthrough).
 */
export class OclusorManos {
  readonly grupo = new Group();
  private tapa = new PiezasMano({ material: MATERIAL_TAPA, margen: 0, orden: -10, palma: true, contorno: false });
  private linea = new PiezasMano({ material: MATERIAL_LINEA, margen: GROSOR_LINEA, orden: -9, palma: false, contorno: true });
  private datos: (DatosMano | null)[] = [null, null];

  constructor() {
    this.grupo.add(this.tapa.grupo, this.linea.grupo);
  }

  actualizar(manos: Mano[]): void {
    manos.forEach((mano, k) => (this.datos[k] = mano.conArticulaciones ? mano : null));
    this.tapa.actualizar(this.datos);
    this.linea.actualizar(this.datos);
  }
}
