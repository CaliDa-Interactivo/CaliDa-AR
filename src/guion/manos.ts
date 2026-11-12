// ============================================================
// manos.ts — gestos leídos directamente de las manos con WebXR
// (XRHand: articulaciones "wrist", "thumb-tip", "index-finger-tip").
// Por ahora: pellizcar, tocar con el índice, saludar, palma hacia
// arriba y el gesto de dos manos (girar / agrandar). Los demás
// gestos del guion se agregan con sus escenas.
// ============================================================
import { Quaternion, Vector3 } from '@iwsdk/core';

export class Mano {
  presente = false;
  muneca = new Vector3();
  giro = new Quaternion();
  indice = new Vector3();
  pulgar = new Vector3();
  /** Pulgar e índice juntos. */
  pellizco = false;
  pellizcoInicio = false;
  pellizcoFin = false;
  // Saludo: vaivén de la muñeca de lado a lado.
  private ultimoX = 0;
  private direccion = 0;
  private extremo = 0;
  private cambios: number[] = [];

  /** Normal de la palma (en WebXR, el eje -Y de la muñeca). */
  palma(salida: Vector3): Vector3 {
    return salida.set(0, -1, 0).applyQuaternion(this.giro);
  }

  /** Devuelve true el instante en que se completa un saludo. */
  detectarSaludo(lateral: number, alta: boolean, tiempo: number): boolean {
    if (!this.presente || !alta) {
      this.cambios.length = 0;
      this.direccion = 0;
      this.ultimoX = lateral;
      this.extremo = lateral;
      return false;
    }
    const paso = lateral - this.ultimoX;
    this.ultimoX = lateral;
    const dir = paso > 0.0008 ? 1 : paso < -0.0008 ? -1 : 0;
    if (dir !== 0 && dir !== this.direccion) {
      // Cambió de sentido: cuenta si el vaivén fue de más de 3 cm.
      if (this.direccion !== 0 && Math.abs(lateral - this.extremo) > 0.03) {
        this.cambios.push(tiempo);
      }
      this.direccion = dir;
      this.extremo = lateral;
    }
    while (this.cambios.length && tiempo - this.cambios[0] > 1.6) {
      this.cambios.shift();
    }
    if (this.cambios.length >= 3) {
      this.cambios.length = 0;
      return true;
    }
    return false;
  }
}

const ARTICULACIONES: [XRHandJoint, 'muneca' | 'indice' | 'pulgar'][] = [
  ['wrist', 'muneca'],
  ['index-finger-tip', 'indice'],
  ['thumb-tip', 'pulgar'],
];

export class Manos {
  izquierda = new Mano();
  derecha = new Mano();
  /** Verdadero solo en el cuadro en que alguien saluda. */
  saludo = false;
  private v = new Vector3();
  private lado = new Vector3();

  actualizar(
    sesion: XRSession | undefined,
    cuadro: XRFrame | null,
    espacio: XRReferenceSpace | null,
    cabeza: Vector3,
    frente: Vector3,
    tiempo: number,
  ): void {
    this.saludo = false;
    this.izquierda.presente = false;
    this.derecha.presente = false;
    if (sesion && cuadro?.getJointPose && espacio) {
      for (const fuente of sesion.inputSources) {
        if (!fuente.hand || fuente.handedness === 'none') {
          continue;
        }
        const mano = fuente.handedness === 'left' ? this.izquierda : this.derecha;
        let completa = true;
        for (const [nombre, campo] of ARTICULACIONES) {
          const articulacion = fuente.hand.get(nombre);
          const pose = articulacion && cuadro.getJointPose(articulacion, espacio);
          if (!pose) {
            completa = false;
            break;
          }
          const p = pose.transform.position;
          mano[campo].set(p.x, p.y, p.z);
          if (campo === 'muneca') {
            const o = pose.transform.orientation;
            mano.giro.set(o.x, o.y, o.z, o.w);
          }
        }
        mano.presente = completa;
      }
    }
    // Eje de lado a lado visto desde la persona (para el saludo).
    this.lado.set(-frente.z, 0, frente.x);
    for (const mano of [this.izquierda, this.derecha]) {
      const antes = mano.pellizco;
      if (mano.presente) {
        const d = mano.indice.distanceTo(mano.pulgar);
        // Histéresis: se cierra a 2 cm y se suelta a 4 cm.
        mano.pellizco = antes ? d < 0.04 : d < 0.02;
      } else {
        mano.pellizco = false;
      }
      mano.pellizcoInicio = mano.pellizco && !antes;
      mano.pellizcoFin = !mano.pellizco && antes;
      const lateral = this.v.copy(mano.muneca).sub(cabeza).dot(this.lado);
      const alta = mano.muneca.y > cabeza.y - 0.5;
      if (mano.detectarSaludo(lateral, alta, tiempo)) {
        this.saludo = true;
      }
    }
  }

  /** La palma de esa mano mira hacia la cara de la persona. */
  palmaArriba(mano: Mano, cabeza: Vector3): boolean {
    if (!mano.presente) {
      return false;
    }
    const haciaCabeza = this.lado.copy(cabeza).sub(mano.muneca).normalize();
    return mano.palma(this.v).dot(haciaCabeza) > 0.45;
  }

  /** Las dos manos pellizcando a la vez (girar / agrandar). */
  dosManos(): boolean {
    return this.izquierda.pellizco && this.derecha.pellizco;
  }

  /** Distancia entre los dos pellizcos. */
  separacion(): number {
    return this.izquierda.indice.distanceTo(this.derecha.indice);
  }

  /** Ángulo (visto desde arriba) de la línea que une las dos manos. */
  angulo(): number {
    return Math.atan2(
      this.derecha.indice.z - this.izquierda.indice.z,
      this.derecha.indice.x - this.izquierda.indice.x,
    );
  }
}
