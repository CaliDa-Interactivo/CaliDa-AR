// ============================================================
// oclusion.ts — que las manos reales tapen lo virtual.
//
//  · Con WebXR Depth Sensing (Quest 3): el DepthSensingSystem de
//    IWSDK compara la profundidad real con la de cada píxel virtual
//    (oclusión suave, borde de ~2 cm). IWSDK solo parcha los
//    materiales que existen cuando se marca la entidad; como en la
//    oficina aparecen objetos todo el tiempo (cajas, donaciones),
//    aquí se parchan también los materiales nuevos.
//  · Sin Depth Sensing: la malla de la mano de IWSDK se vuelve un
//    "oclusor" invisible (no pinta color, sí escribe profundidad y se
//    dibuja primero), así tapa lo que queda detrás.
//  · En los dos casos la mano dibujada (con su contorno) no se ve.
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

/** No pinta color pero sí profundidad: tapa lo que está detrás. */
const OCLUSOR = new MeshBasicMaterial({ colorWrite: false });
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
    // Mano de IWSDK: invisible (hay profundidad) u oclusor (no la hay).
    const material = profundidad ? INVISIBLE : OCLUSOR;
    for (const modelo of manos) {
      modelo?.traverse((o) => {
        const m = o as Mesh;
        if (m.isMesh && m.material !== material) {
          m.material = material;
          m.renderOrder = -10;
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
