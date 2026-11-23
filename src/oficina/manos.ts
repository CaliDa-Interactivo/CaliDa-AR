// ============================================================
// manos.ts — lectura de las manos con WebXR: PINZA sin rayos.
//
//  · Agarrar: pinza entre la punta del pulgar y la del índice.
//    Menos de ~1,8 cm = pinza cerrada; más de ~3,5 cm = abierta (dos
//    umbrales para que no parpadee). El punto de la pinza (entre las
//    dos puntas) es lo que toca los objetos: cerca de uno lo resalta
//    (hover) y al cerrar la pinza se agarra. No hay rayos.
//  · Empujar botones: la punta del índice (poke).
//  · Respaldo con controles del Quest: el gatillo (o el gatillo
//    lateral) cierra la pinza y la punta del control hace de índice.
//
// Todo en el espacio del mundo (el jugador está en el origen).
// ============================================================
import { Quaternion, Vector3 } from '@iwsdk/core';

/** Distancia pulgar–índice para cerrar y para abrir la pinza (m). */
const CIERRA = 0.018;
const ABRE = 0.035;

export type TipoMano = 'mano' | 'control' | 'mouse';

export class Mano {
  presente = false;
  tipo: TipoMano = 'mano';
  /** Centro de la palma (o de la empuñadura del control). */
  readonly palma = new Vector3();
  /** Punta del índice (o punta del control). */
  readonly indice = new Vector3();
  readonly giro = new Quaternion();
  /** Hacia dónde mira la palma (sale de ella). */
  readonly normal = new Vector3(0, -1, 0);
  /** Punto de la pinza (entre las puntas del pulgar y el índice): toca y lleva los objetos. */
  readonly agarre = new Vector3();
  cerrada = false;
  recienCerrada = false;
  recienAbierta = false;
  /** Para vibrar con el control (las manos no vibran). */
  fuente: XRInputSource | null = null;

  constructor(readonly lado: 'left' | 'right' | 'mouse') {}

  /** Pone el estado de cerrada y calcula los flancos. */
  fijarCerrada(cerrada: boolean): void {
    this.recienCerrada = cerrada && !this.cerrada;
    this.recienAbierta = !cerrada && this.cerrada;
    this.cerrada = cerrada;
  }

  vibrar(fuerza = 0.6, ms = 60): void {
    const motor = this.fuente?.gamepad?.hapticActuators?.[0] as
      | { pulse?: (fuerza: number, ms: number) => Promise<boolean> }
      | undefined;
    void motor?.pulse?.(fuerza, ms);
  }
}

export class Manos {
  readonly izquierda = new Mano('left');
  readonly derecha = new Mano('right');
  private v = new Vector3();
  private p = new Vector3();

  get lista(): Mano[] {
    return [this.izquierda, this.derecha];
  }

  actualizar(sesion: XRSession | undefined, cuadro: XRFrame | null, espacio: XRReferenceSpace | null): void {
    const vistas = new Set<Mano>();
    if (sesion && cuadro && espacio) {
      for (const fuente of sesion.inputSources) {
        if (fuente.handedness !== 'left' && fuente.handedness !== 'right') {
          continue;
        }
        const mano = fuente.handedness === 'left' ? this.izquierda : this.derecha;
        const ok = fuente.hand ? this.leerMano(mano, fuente, cuadro, espacio) : this.leerControl(mano, fuente, cuadro, espacio);
        if (ok) {
          mano.fuente = fuente;
          vistas.add(mano);
        }
      }
    }
    for (const mano of this.lista) {
      if (!vistas.has(mano)) {
        mano.presente = false;
        mano.fijarCerrada(false);
      }
    }
  }

  private leerMano(mano: Mano, fuente: XRInputSource, cuadro: XRFrame, espacio: XRReferenceSpace): boolean {
    const mano3 = fuente.hand!;
    const pose = (j: XRHandJoint) => {
      const art = mano3.get(j);
      return art && cuadro.getJointPose ? cuadro.getJointPose(art, espacio) : undefined;
    };
    // Centro de la palma: entre la muñeca y la base del dedo medio.
    const muneca = pose('wrist');
    const base = pose('middle-finger-metacarpal');
    const indice = pose('index-finger-tip');
    if (!muneca || !base || !indice) {
      return false;
    }
    const pulgar = pose('thumb-tip');
    if (!pulgar) {
      return false;
    }
    const bp = base.transform.position;
    const mp = muneca.transform.position;
    this.p.set((bp.x * 2 + mp.x) / 3, (bp.y * 2 + mp.y) / 3, (bp.z * 2 + mp.z) / 3);
    mano.tipo = 'mano';
    mano.presente = true;
    mano.palma.copy(this.p);
    const ip = indice.transform.position;
    mano.indice.set(ip.x, ip.y, ip.z);
    const o = muneca.transform.orientation;
    mano.giro.set(o.x, o.y, o.z, o.w);
    // En las articulaciones de WebXR el eje -Y sale de la palma.
    mano.normal.set(0, -1, 0).applyQuaternion(mano.giro);
    // Pinza: punto medio entre las puntas del pulgar y el índice.
    const tp = pulgar.transform.position;
    this.v.set(tp.x, tp.y, tp.z);
    const distancia = this.v.distanceTo(mano.indice);
    mano.agarre.copy(this.v).add(mano.indice).multiplyScalar(0.5);
    mano.fijarCerrada(mano.cerrada ? distancia < ABRE : distancia < CIERRA);
    return true;
  }

  private leerControl(mano: Mano, fuente: XRInputSource, cuadro: XRFrame, espacio: XRReferenceSpace): boolean {
    const espacioAgarre = fuente.gripSpace;
    if (!espacioAgarre) {
      return false;
    }
    const pose = cuadro.getPose(espacioAgarre, espacio);
    if (!pose) {
      return false;
    }
    const t = pose.transform;
    mano.tipo = 'control';
    mano.presente = true;
    mano.palma.set(t.position.x, t.position.y, t.position.z);
    mano.giro.set(t.orientation.x, t.orientation.y, t.orientation.z, t.orientation.w);
    mano.normal.set(0, 0, -1).applyQuaternion(mano.giro);
    // La "punta del índice" es la punta del control (6 cm hacia adelante).
    mano.indice.set(0, -0.01, -0.06).applyQuaternion(mano.giro).add(mano.palma);
    mano.agarre.set(0, 0, -0.04).applyQuaternion(mano.giro).add(mano.palma);
    // Gatillo (botón 0) o gatillo lateral (botón 1) = cerrar la pinza.
    const boton = fuente.gamepad?.buttons;
    mano.fijarCerrada(!!(boton?.[0]?.pressed || boton?.[1]?.pressed));
    return true;
  }
}
