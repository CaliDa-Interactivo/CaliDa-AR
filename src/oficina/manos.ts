// ============================================================
// manos.ts — lectura de las manos con WebXR, SIN pellizco.
//
//  · Agarrar: puño o agarre completo. Se mide la distancia promedio
//    de las puntas de los dedos (índice, medio, anular y meñique)
//    al centro de la palma: menos de ~4,5 cm = mano cerrada; más de
//    ~6,5 cm = abierta (dos umbrales para que no parpadee).
//  · La palma "de canto" (vertical) junto a un objeto lo resalta;
//    al cerrar el puño se agarra.
//  · Empujar botones: la punta del índice (poke).
//  · Respaldo con controles del Quest: el gatillo lateral (squeeze)
//    cierra la "mano" y la punta del control hace de índice.
//
// Todo en el espacio del mundo (el jugador está en el origen).
// ============================================================
import { Quaternion, Vector3 } from '@iwsdk/core';

const CIERRA = 0.045;
const ABRE = 0.065;

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
  /** Dónde va lo que se lleva: centro de la palma, un poco hacia los nudillos y afuera. */
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

const PUNTAS: XRHandJoint[] = [
  'index-finger-tip',
  'middle-finger-tip',
  'ring-finger-tip',
  'pinky-finger-tip',
];

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
    const nudillo = pose('middle-finger-phalanx-proximal');
    if (!muneca || !base || !indice) {
      return false;
    }
    const bp = base.transform.position;
    const mp = muneca.transform.position;
    this.p.set((bp.x * 2 + mp.x) / 3, (bp.y * 2 + mp.y) / 3, (bp.z * 2 + mp.z) / 3);
    let suma = 0;
    let n = 0;
    for (const punta of PUNTAS) {
      const pp = pose(punta);
      if (pp) {
        const t = pp.transform.position;
        suma += this.v.set(t.x, t.y, t.z).distanceTo(this.p);
        n++;
      }
    }
    if (n < 3) {
      return false;
    }
    const promedio = suma / n;
    mano.tipo = 'mano';
    mano.presente = true;
    mano.palma.copy(this.p);
    const ip = indice.transform.position;
    mano.indice.set(ip.x, ip.y, ip.z);
    const o = muneca.transform.orientation;
    mano.giro.set(o.x, o.y, o.z, o.w);
    // En las articulaciones de WebXR el eje -Y sale de la palma.
    mano.normal.set(0, -1, 0).applyQuaternion(mano.giro);
    const np = nudillo?.transform.position ?? bp;
    mano.agarre
      .set(np.x, np.y, np.z)
      .sub(this.p)
      .multiplyScalar(0.55)
      .add(this.p)
      .addScaledVector(mano.normal, 0.035);
    mano.fijarCerrada(mano.cerrada ? promedio < ABRE : promedio < CIERRA);
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
    mano.agarre.copy(mano.palma);
    // La "punta del índice" es la punta del control (6 cm hacia adelante).
    mano.indice.set(0, -0.01, -0.06).applyQuaternion(mano.giro).add(mano.palma);
    // Gatillo lateral (botón 1 del perfil xr-standard) = cerrar la mano.
    const lateral = fuente.gamepad?.buttons[1]?.pressed ?? false;
    mano.fijarCerrada(lateral);
    return true;
  }
}
