// ============================================================
// interaccion.ts — agarrar, llevar, soltar y empujar botones.
//
//  · Agarrar: la mano se cierra (puño) tocando un "agarrable" (la
//    palma a menos de ~6 cm de su caja). El objeto sigue a la mano;
//    al abrirla se suelta y el agarrable decide: snap animado a un
//    puesto válido, o cae hasta la mesa o el piso.
//  · Contorno: blanco cuando la mano está cerca, verde mientras se
//    lleva sobre un puesto válido, rojo sobre uno que no sirve.
//  · Botones: se presionan empujando con la punta del índice.
//  · Computador (?prueba): el mouse arrastra (mano cerrada) y hace
//    clic en los botones. No hay pellizco ni rayos en ningún caso.
// ============================================================
import {
  Box3,
  Plane,
  Raycaster,
  Vector2,
  Vector3,
  type Camera,
  type Object3D,
} from '@iwsdk/core';
import type { Animador } from '../guion/animador.js';
import { COLOR } from './datos.js';
import { Mano, type Manos } from './manos.js';
import { Contorno } from './objetos.js';
import { HUNDIDO_MAX, type Boton3D } from './ui.js';

export type Destino = 'valido' | 'invalido' | null;

export interface Agarrable {
  /** Lo que se toca (su caja en el mundo define el contacto). */
  obj: Object3D;
  activo: () => boolean;
  /** Devuelve lo que se lleva en la mano (el mismo obj u otro nuevo). */
  tomar: (mano: Mano) => Object3D | null;
  /** Mientras se lleva: ¿dónde está? (para el color del contorno). */
  destino?: (llevado: Object3D) => Destino;
  /** Al abrir la mano. */
  soltar: (llevado: Object3D, mano: Mano) => void;
  /** Contorno propio del objeto que se lleva (si no, se crea uno). */
  contornoDe?: (llevado: Object3D) => ConContorno | null;
  /** Contorno en reposo (p. ej. rojo si está dañado). */
  reposo?: (obj: Object3D) => void;
}

/** Algo que se puede resaltar con un color (o apagar con null). */
export interface ConContorno {
  poner(color: string | null): void;
}

interface Llevado {
  ag: Agarrable;
  obj: Object3D;
  offset: Vector3;
}

const ALCANCE = 0.06;

export class Interaccion {
  readonly agarrables: Agarrable[] = [];
  readonly botones: Boton3D[] = [];
  readonly raton = new Mano('mouse');
  /** Altura de apoyo (mesa o piso) en un punto de la oficina (coord. locales). */
  apoyo: (x: number, z: number) => number = () => 0;
  sonar: (que: 'agarrar' | 'soltar' | 'boton' | 'bloqueado') => void = () => undefined;
  private llevando = new Map<Mano, Llevado>();
  private hover = new Map<Mano, Agarrable>();
  private contornos = new Map<Object3D, Contorno>();
  private dentro = new Map<Boton3D, Set<Mano>>();
  private caja = new Box3();
  private v = new Vector3();
  private w = new Vector3();
  // Mouse
  private rayo = new Raycaster();
  private ndc = new Vector2();
  private plano = new Plane();
  private arrastre: Agarrable | null = null;
  private tiempo = 0;

  constructor(
    private raiz: Object3D,
    private manos: Manos,
    private camara: () => Camera,
    private anim: Animador,
    lienzo: HTMLCanvasElement | null,
  ) {
    if (lienzo) {
      lienzo.addEventListener('pointerdown', (e) => this.ratonAbajo(e, lienzo));
      lienzo.addEventListener('pointermove', (e) => this.ratonMueve(e, lienzo));
      window.addEventListener('pointerup', () => this.raton.fijarCerrada(false));
    }
  }

  /** ¿Esa mano lleva algo? */
  lleva(mano: Mano): Object3D | null {
    return this.llevando.get(mano)?.obj ?? null;
  }

  /** Suelta todo sin avisar (cambio de fase). */
  soltarTodo(): void {
    for (const [, l] of this.llevando) {
      this.reposar(l);
    }
    this.llevando.clear();
    this.arrastre = null;
  }

  contornoDe(l: { ag: Agarrable; obj: Object3D }): ConContorno {
    const propio = l.ag.contornoDe?.(l.obj);
    if (propio) {
      return propio;
    }
    let c = this.contornos.get(l.obj);
    if (!c) {
      c = new Contorno(l.obj, 1.06);
      this.contornos.set(l.obj, c);
    }
    return c;
  }

  private reposar(l: { ag: Agarrable; obj: Object3D }): void {
    if (l.ag.reposo) {
      l.ag.reposo(l.obj);
    } else {
      this.contornoDe(l).poner(null);
    }
  }

  /** Deja caer un objeto hasta la mesa o el piso (gravedad básica). */
  caer(obj: Object3D, alFinal?: () => void): void {
    const p = obj.position;
    const y = this.apoyo(p.x, p.z);
    const altura = Math.max(0, p.y - y);
    this.v.set(p.x, y, p.z);
    this.anim.mover(obj, this.v, Math.max(0.12, Math.sqrt((2 * altura) / 9.8)), { fin: alFinal });
  }

  actualizar(dt: number): void {
    this.tiempo += dt;
    const manos = [...this.manos.lista, this.raton];
    for (const mano of manos) {
      if (!mano.presente) {
        this.terminar(mano);
        continue;
      }
      const llevado = this.llevando.get(mano);
      if (llevado) {
        // Sigue a la mano.
        this.w.copy(mano.palma).add(llevado.offset);
        llevado.obj.position.copy(this.raiz.worldToLocal(this.w));
        const d = llevado.ag.destino?.(llevado.obj) ?? null;
        this.contornoDe(llevado).poner(d === 'valido' ? COLOR.verde : d === 'invalido' ? COLOR.rojo : '#FFFFFF');
        if (mano.recienAbierta || !mano.cerrada) {
          this.terminar(mano);
        }
        continue;
      }
      // Mano libre: ¿toca algo?
      const cerca = mano === this.raton ? this.arrastre : this.masCercano(mano);
      const antes = this.hover.get(mano);
      if (antes && antes !== cerca) {
        this.reposar({ ag: antes, obj: antes.obj });
        this.hover.delete(mano);
      }
      if (cerca && mano !== this.raton) {
        this.hover.set(mano, cerca);
        this.contornoDe({ ag: cerca, obj: cerca.obj }).poner('#FFFFFF');
      }
      if (cerca && mano.recienCerrada) {
        this.empezar(mano, cerca);
      }
    }
    this.botonesConIndice();
  }

  private masCercano(mano: Mano): Agarrable | null {
    let mejor: Agarrable | null = null;
    let dist = ALCANCE;
    for (const ag of this.agarrables) {
      if (!ag.activo() || !this.visible(ag.obj) || this.ocupado(ag)) {
        continue;
      }
      this.caja.setFromObject(ag.obj);
      const d = this.caja.distanceToPoint(mano.palma);
      if (d < dist) {
        dist = d;
        mejor = ag;
      }
    }
    return mejor;
  }

  private ocupado(ag: Agarrable): boolean {
    for (const l of this.llevando.values()) {
      if (l.ag === ag && l.obj === ag.obj) {
        return true;
      }
    }
    return false;
  }

  private empezar(mano: Mano, ag: Agarrable): void {
    this.reposar({ ag, obj: ag.obj });
    this.hover.delete(mano);
    const obj = ag.tomar(mano);
    if (!obj) {
      if (mano === this.raton) {
        this.arrastre = null;
      }
      return;
    }
    this.anim.cancelar(obj);
    obj.getWorldPosition(this.v);
    const offset = this.v.sub(mano.palma).clone();
    // Lo que sale nuevo (de una caja o de la repisa) va justo en la mano.
    if (obj !== ag.obj || offset.length() > 0.12) {
      offset.set(0, -0.03, 0);
    }
    this.llevando.set(mano, { ag, obj, offset });
    this.sonar('agarrar');
    mano.vibrar(0.4, 40);
  }

  private terminar(mano: Mano): void {
    const l = this.llevando.get(mano);
    if (l) {
      this.llevando.delete(mano);
      this.reposar(l);
      this.sonar('soltar');
      l.ag.soltar(l.obj, mano);
    }
    if (mano === this.raton) {
      this.arrastre = null;
      this.raton.presente = this.raton.cerrada;
    }
    const h = this.hover.get(mano);
    if (h && !mano.presente) {
      this.reposar({ ag: h, obj: h.obj });
      this.hover.delete(mano);
    }
  }

  private visible(o: Object3D | null): boolean {
    while (o) {
      if (!o.visible) {
        return false;
      }
      o = o.parent;
    }
    return true;
  }

  // ---- Botones con la punta del índice ----------------------------

  private botonesConIndice(): void {
    for (const boton of this.botones) {
      if (!boton.visibleEnEscena()) {
        boton.hundir(0);
        this.dentro.get(boton)?.clear();
        continue;
      }
      let set = this.dentro.get(boton);
      if (!set) {
        set = new Set();
        this.dentro.set(boton, set);
      }
      let hundido = 0;
      for (const mano of this.manos.lista) {
        if (!mano.presente || (mano.tipo === 'mano' && mano.cerrada)) {
          set.delete(mano);
          continue;
        }
        // Punta del índice en el espacio del botón (la cara mira a +Z).
        const p = boton.grupo.worldToLocal(this.v.copy(mano.indice));
        const cara = boton.grosor;
        const sobre = Math.abs(p.x) < boton.anchoM / 2 + 0.008 && Math.abs(p.y) < boton.altoM / 2 + 0.008;
        if (!sobre || p.z > cara + 0.025 || p.z < -0.05) {
          set.delete(mano);
          continue;
        }
        const entra = cara - p.z;
        if (entra > 0) {
          hundido = Math.max(hundido, entra);
        }
        if (entra > 0.006 && !set.has(mano)) {
          set.add(mano);
          this.presionar(boton, mano);
        } else if (entra < -0.012) {
          set.delete(mano);
        }
      }
      boton.hundir(hundido);
      boton.pintar(this.tiempo);
    }
  }

  presionar(boton: Boton3D, mano?: Mano): void {
    boton.tocadoEn = this.tiempo;
    mano?.vibrar(0.7, 50);
    if (boton.bloqueado) {
      this.sonar('bloqueado');
      boton.alBloqueado();
    } else {
      this.sonar('boton');
      boton.alPresionar();
    }
    if (!mano) {
      // Con el mouse: un hundido corto para que se vea.
      boton.hundir(HUNDIDO_MAX);
      setTimeout(() => boton.hundir(0), 140);
    }
  }

  // ---- Mouse (modo prueba en el computador) -------------------------

  private apuntar(e: PointerEvent, lienzo: HTMLCanvasElement): void {
    const r = lienzo.getBoundingClientRect();
    this.ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    this.rayo.setFromCamera(this.ndc, this.camara());
  }

  private ratonAbajo(e: PointerEvent, lienzo: HTMLCanvasElement): void {
    this.apuntar(e, lienzo);
    // Botones primero.
    let mejor = Infinity;
    let boton: Boton3D | null = null;
    for (const b of this.botones) {
      if (!b.visibleEnEscena()) {
        continue;
      }
      const hit = this.rayo.intersectObject(b.cuerpo, false)[0];
      if (hit && hit.distance < mejor) {
        mejor = hit.distance;
        boton = b;
      }
    }
    if (boton) {
      this.presionar(boton);
      return;
    }
    // Después, lo que se puede agarrar.
    let ag: Agarrable | null = null;
    let punto: Vector3 | null = null;
    mejor = Infinity;
    for (const a of this.agarrables) {
      if (!a.activo() || !this.visible(a.obj)) {
        continue;
      }
      const hits = this.rayo.intersectObject(a.obj, true).filter((h) => this.visible(h.object));
      if (hits[0] && hits[0].distance < mejor) {
        mejor = hits[0].distance;
        ag = a;
        punto = hits[0].point.clone();
      }
    }
    if (!ag || !punto) {
      return;
    }
    // Plano frente a la cámara que pasa por el punto: ahí se mueve la "mano".
    const camara = this.camara();
    camara.getWorldDirection(this.w);
    this.plano.setFromNormalAndCoplanarPoint(this.w.negate(), punto);
    this.arrastre = ag;
    this.raton.presente = true;
    this.raton.palma.copy(punto);
    this.raton.indice.copy(punto);
    this.raton.fijarCerrada(false);
    this.raton.fijarCerrada(true);
  }

  private ratonMueve(e: PointerEvent, lienzo: HTMLCanvasElement): void {
    if (!this.raton.cerrada) {
      return;
    }
    this.apuntar(e, lienzo);
    const p = this.rayo.ray.intersectPlane(this.plano, this.w);
    if (p) {
      this.raton.palma.copy(p);
      this.raton.indice.copy(p);
    }
  }
}
