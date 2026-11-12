// ============================================================
// webxr.ts — uso directo de WebXR (la API del navegador de las
// gafas sobre la que funciona IWSDK). Aquí está lo que CaliDa
// le pide a WebXR sin intermediarios:
//
//   · Sesión:  navigator.xr.isSessionSupported('immersive-ar')
//              y session.enabledFeatures (qué concedió el visor)
//   · Planos:  XRFrame.detectedPlanes  → encontrar una mesa real
//   · Anclas:  XRFrame.createAnchor    → la mesa de trabajo queda
//              fija al mundo real aunque la persona camine
//
// IWSDK da la sesión, el cuadro (XRFrame) y el espacio de
// referencia: world.xrSession, world.xrFrame, world.xrReferenceSpace.
// ============================================================
import { Object3D, Quaternion, Vector3 } from '@iwsdk/core';

export interface SoporteWebXR {
  /** El navegador tiene WebXR (navigator.xr). */
  api: boolean;
  /** Puede abrir una sesión de realidad aumentada (immersive-ar). */
  realidadAumentada: boolean;
}

/** Pregunta al navegador si puede abrir una sesión de realidad aumentada. */
export async function comprobarWebXR(): Promise<SoporteWebXR> {
  const xr = navigator.xr;
  if (!xr) {
    return { api: false, realidadAumentada: false };
  }
  const realidadAumentada = await xr
    .isSessionSupported('immersive-ar')
    .catch(() => false);
  return { api: true, realidadAumentada };
}

/** Nombres en español de las funciones de WebXR que usa la experiencia. */
const NOMBRES: Record<string, string> = {
  'hand-tracking': 'manos',
  'plane-detection': 'detección de planos',
  'mesh-detection': 'malla del espacio',
  anchors: 'anclas',
  'hit-test': 'prueba de superficie',
  'local-floor': 'piso real',
};

/** Qué funciones de WebXR concedió el visor al abrir la sesión. */
export function funcionesActivas(sesion: XRSession | undefined): string[] {
  return (sesion?.enabledFeatures ?? [])
    .filter((f) => f in NOMBRES)
    .map((f) => NOMBRES[f]);
}

/**
 * Busca una mesa real entre los planos que WebXR detectó en este cuadro
 * (XRFrame.detectedPlanes): un plano horizontal, a la altura de una mesa,
 * con espacio suficiente y cerca de la persona. Deja en `salida` el centro
 * de la superficie.
 */
export function buscarMesa(
  cuadro: XRFrame,
  espacio: XRReferenceSpace,
  cabeza: Vector3,
  salida: Vector3,
): boolean {
  const planos = cuadro.detectedPlanes;
  if (!planos) {
    return false;
  }
  let mejor = Infinity;
  for (const plano of planos) {
    if (String(plano.orientation).toLowerCase() !== 'horizontal') {
      continue;
    }
    const etiqueta = String(plano.semanticLabel ?? '').toLowerCase();
    if (etiqueta === 'floor' || etiqueta === 'ceiling') {
      continue;
    }
    const pose = cuadro.getPose(plano.planeSpace, espacio);
    if (!pose) {
      continue;
    }
    // El contorno viene en el espacio del plano (y = 0).
    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;
    for (const p of plano.polygon) {
      minX = Math.min(minX, p.x);
      maxX = Math.max(maxX, p.x);
      minZ = Math.min(minZ, p.z);
      maxZ = Math.max(maxZ, p.z);
    }
    const ancho = maxX - minX;
    const fondo = maxZ - minZ;
    if (Math.max(ancho, fondo) < 0.45 || Math.min(ancho, fondo) < 0.3) {
      continue;
    }
    // Centro del contorno, llevado al mundo con la matriz de la pose.
    const cx = (minX + maxX) / 2;
    const cz = (minZ + maxZ) / 2;
    const m = pose.transform.matrix;
    const x = m[0] * cx + m[8] * cz + m[12];
    const y = m[1] * cx + m[9] * cz + m[13];
    const z = m[2] * cx + m[10] * cz + m[14];
    if (y < 0.35 || y > 1.25) {
      continue;
    }
    const distancia = Math.hypot(x - cabeza.x, z - cabeza.z);
    if (distancia < 2.5 && distancia < mejor) {
      mejor = distancia;
      salida.set(x, y, z);
    }
  }
  return mejor < Infinity;
}

/**
 * Ancla de WebXR: fija un objeto a un punto del mundo real. El visor
 * corrige el ancla a medida que entiende mejor el espacio, y el objeto la
 * sigue, así no se "resbala" cuando la persona se mueve.
 */
export class AnclaWebXR {
  private ancla: XRAnchor | null = null;
  private pedido = 0;
  private posicion = new Vector3();
  private giro = new Quaternion();

  get activa(): boolean {
    return this.ancla !== null;
  }

  /** Pide un ancla donde está el objeto ahora (necesita la función "anchors"). */
  crear(cuadro: XRFrame, espacio: XRReferenceSpace, objeto: Object3D): void {
    this.soltar();
    if (!cuadro.createAnchor) {
      return;
    }
    const pedido = ++this.pedido;
    objeto.getWorldPosition(this.posicion);
    objeto.getWorldQuaternion(this.giro);
    const pose = new XRRigidTransform(
      { x: this.posicion.x, y: this.posicion.y, z: this.posicion.z },
      { x: this.giro.x, y: this.giro.y, z: this.giro.z, w: this.giro.w },
    );
    cuadro
      .createAnchor(pose, espacio)
      .then((ancla) => {
        // Si mientras tanto se pidió otra o se soltó, esta ya no sirve.
        if (pedido === this.pedido) {
          this.ancla = ancla;
        } else {
          ancla.delete();
        }
      })
      .catch(() => undefined);
  }

  /** Pone el objeto donde está el ancla en este cuadro. */
  seguir(cuadro: XRFrame, espacio: XRReferenceSpace, objeto: Object3D): void {
    if (!this.ancla || !cuadro.trackedAnchors?.has(this.ancla)) {
      return;
    }
    const pose = cuadro.getPose(this.ancla.anchorSpace, espacio);
    if (!pose) {
      return;
    }
    const { position: p, orientation: o } = pose.transform;
    objeto.position.set(p.x, p.y, p.z);
    objeto.quaternion.set(o.x, o.y, o.z, o.w);
  }

  soltar(): void {
    this.pedido++;
    this.ancla?.delete();
    this.ancla = null;
  }
}
