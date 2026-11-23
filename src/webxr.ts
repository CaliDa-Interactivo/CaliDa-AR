// ============================================================
// webxr.ts — uso directo de WebXR (la API del navegador de las
// gafas sobre la que funciona IWSDK). Aquí está lo que CaliDa
// le pide a WebXR sin intermediarios:
//
//   · Sesión:  navigator.xr.isSessionSupported('immersive-ar')
//              y session.enabledFeatures (qué concedió el visor)
//   · Planos:  XRFrame.detectedPlanes  → encontrar el piso (o una mesa)
//   · Superficie: hit-test              → el piso si no hay planos
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

/**
 * Encuentra el piso real para poner la mesa flotante a la altura de la
 * cintura. Primero con los planos que detectó el visor (plane-detection:
 * el de etiqueta "floor" o el horizontal más bajo); si no hay planos, con
 * la prueba de superficie (hit-test) de un rayo que sale de la cabeza hacia
 * abajo y adelante. Si nada responde, `piso` queda en null y se usa el piso
 * del espacio de referencia (y = 0) con el botón manual "Colocar aquí".
 */
export class SondaPiso {
  piso: number | null = null;
  /** De dónde salió: 'planos', 'superficie' o null. */
  fuente: 'planos' | 'superficie' | null = null;
  private hit: XRHitTestSource | null = null;
  private sesion: XRSession | null = null;

  actualizar(
    sesion: XRSession | null | undefined,
    cuadro: XRFrame | null | undefined,
    espacio: XRReferenceSpace | null | undefined,
    cabezaY: number,
  ): void {
    if (!sesion || !cuadro || !espacio) {
      return;
    }
    if (sesion !== this.sesion) {
      this.sesion = sesion;
      this.hit = null;
      this.piso = null;
      this.fuente = null;
      this.pedirSuperficie(sesion);
    }
    let y = Infinity;
    let fuente: SondaPiso['fuente'] = null;
    for (const plano of cuadro.detectedPlanes ?? []) {
      if (String(plano.orientation).toLowerCase() !== 'horizontal') {
        continue;
      }
      const pose = cuadro.getPose(plano.planeSpace, espacio);
      if (!pose) {
        continue;
      }
      const py = pose.transform.position.y;
      const etiqueta = String(plano.semanticLabel ?? '').toLowerCase();
      if ((etiqueta === 'floor' || py < cabezaY - 1.0) && py < y) {
        y = py;
        fuente = 'planos';
      }
    }
    if (!fuente && this.hit) {
      const resultado = cuadro.getHitTestResults(this.hit)[0];
      const pose = resultado?.getPose(espacio);
      if (pose && pose.transform.position.y < cabezaY - 0.9) {
        y = pose.transform.position.y;
        fuente = 'superficie';
      }
    }
    if (fuente) {
      this.piso = this.piso === null ? y : this.piso + (y - this.piso) * 0.1;
      this.fuente = fuente;
    }
  }

  private pedirSuperficie(sesion: XRSession): void {
    if (!sesion.requestHitTestSource || typeof XRRay === 'undefined') {
      return;
    }
    sesion
      .requestReferenceSpace('viewer')
      .then((visor) =>
        sesion.requestHitTestSource!({
          space: visor,
          offsetRay: new XRRay({ x: 0, y: 0, z: 0, w: 1 }, { x: 0, y: -0.85, z: -0.5, w: 0 }),
        }),
      )
      .then((fuente) => {
        if (!fuente) {
          return;
        }
        if (this.sesion === sesion) {
          this.hit = fuente;
        } else {
          fuente.cancel();
        }
      })
      .catch(() => undefined);
  }
}
