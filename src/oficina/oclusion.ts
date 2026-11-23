// ============================================================
// oclusion.ts — que las manos reales tapen lo virtual.
//
//  · Con WebXR Depth Sensing (Quest 3): el DepthSensingSystem de
//    IWSDK compara la profundidad real con la de cada píxel virtual
//    en modo MinMax (separa lo cercano de lo lejano en cada zona y
//    funde solo en el borde: el contorno de la mano queda definido,
//    sin halo borroso). IWSDK solo parcha los materiales que existen
//    cuando se marca la entidad; como en la oficina aparecen objetos
//    todo el tiempo (cajas, donaciones), aquí se parchan también los
//    materiales nuevos.
//  · Siempre (haya o no profundidad): la malla de la mano de IWSDK,
//    que sigue cada articulación, se vuelve un "oclusor" invisible
//    (no pinta color, sí escribe profundidad y se dibuja primero).
//    IWSDK ya la agranda 5 %; aquí se infla 2 mm más por sus normales
//    para cubrir el borde real de los dedos. Da un contorno nítido que sigue la mano sin retraso; la
//    profundidad completa lo que la malla no cubre (mangas, objetos).
//  · La mano dibujada (con su contorno) nunca se ve.
//  · Lo que se lleva en la mano nunca se tapa (ver interaccion.ts).
// ============================================================
import {
  DepthSensingSystem,
  MeshBasicMaterial,
  type Entity,
  type Material,
  type Mesh,
  type Object3D,
  type World,
} from '@iwsdk/core';

/** Cuánto se infla la malla de la mano (m) para cubrir el borde real. */
const INFLAR = 0.002;

/** No pinta color pero sí profundidad: tapa lo que está detrás. */
const OCLUSOR = new MeshBasicMaterial({ colorWrite: false });
OCLUSOR.onBeforeCompile = (shader) => {
  shader.vertexShader = shader.vertexShader.replace(
    '#include <skinning_vertex>',
    [
      '#include <skinning_vertex>',
      '#ifdef USE_SKINNING',
      `  transformed += normalize( objectNormal ) * ${INFLAR.toFixed(4)};`,
      '#else',
      `  transformed += normalize( normal ) * ${INFLAR.toFixed(4)};`,
      '#endif',
    ].join('\n'),
  );
};
OCLUSOR.customProgramCacheKey = () => 'calida-oclusor-mano';

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
    // Mano de IWSDK: siempre oclusor invisible, dibujado antes que todo.
    for (const modelo of manos) {
      modelo?.traverse((o) => {
        const m = o as Mesh;
        if (m.isMesh && m.material !== OCLUSOR) {
          m.material = OCLUSOR;
          m.renderOrder = -10;
          // La malla con huesos puede quedar fuera de su caja original.
          m.frustumCulled = false;
        }
      });
    }
    this.t += dt;
    if (!profundidad || this.t < 0.5) {
      return;
    }
    this.t = 0;
    const sistema = this.world.getSystem(DepthSensingSystem) as unknown as
      | { entityShaderMap?: Map<Entity, Set<Uniformes>> }
      | undefined;
    const uniformes = sistema?.entityShaderMap?.get(this.raizEnt);
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
