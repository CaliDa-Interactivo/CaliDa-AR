// Movimientos suaves (posición, escala y un arco opcional), con espera.
import { Object3D, Vector3 } from '@iwsdk/core';

interface Movimiento {
  obj: Object3D;
  desde: Vector3;
  hasta: Vector3;
  mover: boolean;
  e0: number;
  e1: number;
  t: number;
  dur: number;
  arco: number;
  iniciado: boolean;
  fin?: () => void;
}

export interface OpcionesMovimiento {
  escala?: number;
  arco?: number;
  espera?: number;
  fin?: () => void;
}

const suave = (k: number): number => k * k * (3 - 2 * k);

export class Animador {
  private lista: Movimiento[] = [];

  mover(obj: Object3D, hasta: Vector3 | null, dur: number, o: OpcionesMovimiento = {}): void {
    this.cancelar(obj);
    this.lista.push({
      obj,
      desde: new Vector3(),
      hasta: (hasta ?? obj.position).clone(),
      mover: hasta !== null,
      e0: 1,
      e1: o.escala ?? -1,
      t: -(o.espera ?? 0),
      dur,
      arco: o.arco ?? 0,
      iniciado: false,
      fin: o.fin,
    });
  }

  cancelar(obj: Object3D): void {
    for (let i = this.lista.length - 1; i >= 0; i--) {
      if (this.lista[i].obj === obj) {
        this.lista.splice(i, 1);
      }
    }
  }

  /** ¿Ese objeto se está moviendo ahora? */
  tiene(obj: Object3D): boolean {
    return this.lista.some((m) => m.obj === obj);
  }

  limpiar(): void {
    this.lista.length = 0;
  }

  actualizar(dt: number): void {
    for (let i = this.lista.length - 1; i >= 0; i--) {
      const m = this.lista[i];
      m.t += dt;
      if (m.t < 0) {
        continue;
      }
      if (!m.iniciado) {
        m.iniciado = true;
        m.desde.copy(m.obj.position);
        m.e0 = m.obj.scale.x;
        m.obj.visible = true;
      }
      const k = suave(Math.min(1, m.t / m.dur));
      if (m.mover) {
        m.obj.position.lerpVectors(m.desde, m.hasta, k);
        m.obj.position.y += Math.sin(Math.PI * k) * m.arco;
      }
      if (m.e1 >= 0) {
        m.obj.scale.setScalar(m.e0 + (m.e1 - m.e0) * k);
      }
      if (m.t >= m.dur) {
        this.lista.splice(i, 1);
        m.fin?.();
      }
    }
  }
}
