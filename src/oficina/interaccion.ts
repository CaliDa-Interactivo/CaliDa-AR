// ============================================================
// interaccion.ts — agarrar, llevar, soltar y empujar botones.
//
//  · Agarrar con PINZA (pulgar e índice), sin rayos: el punto de la
//    pinza a menos de ~5 cm de un "agarrable" lo resalta (hover: contorno
//    blanco) y al cerrar la pinza se agarra. Lo que se lleva va en la
//    pinza, conserva el giro con que se tomó y sigue la mano suavizado
//    (~50 ms); lo grande se achica un poco y siempre se ve encima de
//    la mano. Al abrir la pinza se suelta y el agarrable decide: snap
//    animado a un puesto válido, o cae hasta la mesa o el piso.
//  · Sonidos: "pop" al agarrar; el juego suena el acierto o el error
//    al soltar en un puesto; si solo cae, un golpe suave.
//  · Contorno: blanco cuando la mano está cerca, verde mientras se
//    lleva sobre un puesto válido, rojo sobre uno que no sirve.
//  · Botones: se presionan empujando con la punta del índice.
//  · Computador (?prueba): el mouse arrastra (mano cerrada) y hace
//    clic en los botones. No hay rayos en ningún caso.
// ============================================================
import {
  Box3,
  Mesh,
  MeshBasicMaterial,
  Plane,
  PlaneGeometry,
  Quaternion,
  Raycaster,
  Vector2,
  Vector3,
  type Camera,
  type Object3D,
  type WebGLRenderer,
} from '@iwsdk/core';
import type { Animador } from '../guion/animador.js';
import { COLOR } from './datos.js';
import { Mano, type Manos } from './manos.js';
import { ponerEncima } from './oclusion.js';
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
  /** (Sin uso con la pinza; se conserva por compatibilidad.) */
  palmaLibre?: boolean;
  /**
   * Distancia de la pinza para resaltarlo y agarrarlo (por defecto 5 cm).
   * Las zonas grandes (compartimientos de la estantería) usan casi 0: hay
   * que meter la pinza adentro, así no se agarran por error.
   */
  alcance?: number;
}

/** Algo que se puede resaltar con un color (o apagar con null). */
export interface ConContorno {
  poner(color: string | null): void;
}

interface Llevado {
  ag: Agarrable;
  obj: Object3D;
  /** Solo para el mouse: distancia fija al punto agarrado. */
  offset: Vector3;
  /** Giro del objeto respecto a la mano al agarrarlo. */
  giroRel: Quaternion;
  /** Centro del objeto en sus coordenadas (para centrarlo en la palma). */
  centro: Vector3;
  /** Punto y giro suavizados (en el mundo). */
  punto: Vector3;
  giro: Quaternion;
  escala0: Vector3;
  giro0: Quaternion;
  /** Factor para achicar lo grande mientras se lleva. */
  achicar: number;
  restaurar: () => void;
  limpiador: Mesh;
}

/** Distancia del punto de la pinza a un objeto para resaltarlo y agarrarlo. */
const ALCANCE = 0.05;
/** Suavizado del seguimiento de la muñeca (segundos). */
const SUAVE = 0.05;
/** Lo que mide más que esto se achica mientras se lleva. */
const GRANDE = 0.16;

const MATERIAL_LIMPIADOR = new MeshBasicMaterial({ colorWrite: false, depthWrite: false, depthTest: false, transparent: true });
const GEOMETRIA_LIMPIADOR = new PlaneGeometry(0.001, 0.001);

/** Malla mínima que borra la profundidad justo antes de dibujar lo que se lleva. */
export function crearLimpiador(): Mesh {
  const m = new Mesh(GEOMETRIA_LIMPIADOR, MATERIAL_LIMPIADOR);
  m.renderOrder = 999;
  m.frustumCulled = false;
  m.userData.sinContorno = true;
  m.onBeforeRender = (renderer: WebGLRenderer) => renderer.clearDepth();
  return m;
}

export class Interaccion {
  readonly agarrables: Agarrable[] = [];
  readonly botones: Boton3D[] = [];
  readonly raton = new Mano('mouse');
  /** Altura de apoyo (mesa o piso) en un punto de la oficina (coord. locales). */
  apoyo: (x: number, z: number) => number = () => 0;
  sonar: (que: 'agarrar' | 'soltar' | 'boton' | 'bloqueado') => void = () => undefined;
  private llevando = new Map<Mano, Llevado>();
  private hover = new Map<Mano, Agarrable>();
  /** Último hover de cada mano (para agarrar mientras el puño se cierra). */
  private ultimoHover = new Map<Mano, { ag: Agarrable; t: number }>();
  private q = new Quaternion();
  private q2 = new Quaternion();
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
      l.restaurar();
      l.obj.scale.copy(l.escala0);
      l.obj.quaternion.copy(l.giro0);
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
        this.seguirMano(llevado, mano, dt);
        const d = llevado.ag.destino?.(llevado.obj) ?? null;
        this.contornoDe(llevado).poner(d === 'valido' ? COLOR.verde : d === 'invalido' ? COLOR.rojo : '#FFFFFF');
        if (mano.recienAbierta || !mano.cerrada) {
          this.terminar(mano);
        }
        continue;
      }
      // Mano libre: ¿toca algo?
      let cerca = mano === this.raton ? this.arrastre : this.masCercano(mano);
      if (cerca && mano !== this.raton) {
        this.ultimoHover.set(mano, { ag: cerca, t: this.tiempo });
      }
      // Al cerrar la pinza los dedos se mueven un poco: vale el hover de hace un momento.
      const u = this.ultimoHover.get(mano);
      if (!cerca && mano.recienCerrada && u && this.tiempo - u.t < 0.4 && this.masCercano(mano, 1.6) === u.ag) {
        cerca = u.ag;
      }
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

  /**
   * Lo que se resalta (hover) y se agarra: lo más cercano a la pinza dentro
   * de su alcance. Si la pinza está dentro de varios a la vez (p. ej. la caja
   * abierta y un compartimiento), gana el más pequeño.
   */
  private masCercano(mano: Mano, factor = 1): Agarrable | null {
    let mejor: Agarrable | null = null;
    let dist = Infinity;
    let vol = Infinity;
    for (const ag of this.agarrables) {
      if (!ag.activo() || !this.visible(ag.obj) || this.ocupado(ag)) {
        continue;
      }
      this.caja.setFromObject(ag.obj);
      const d = this.caja.distanceToPoint(mano.agarre);
      if (d >= (ag.alcance ?? ALCANCE) * factor) {
        continue;
      }
      this.caja.getSize(this.w);
      const v = this.w.x * this.w.y * this.w.z;
      const empate = Math.abs(d - dist) < 0.004;
      if ((empate && v < vol) || (!empate && d < dist)) {
        dist = d;
        vol = v;
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
    obj.updateWorldMatrix(true, true);
    obj.getWorldPosition(this.v);
    const offset = this.v.clone().sub(mano.agarre);
    // Lo que sale nuevo (de una caja o de la repisa) va justo en la mano.
    if (obj !== ag.obj || offset.length() > 0.12) {
      offset.set(0, -0.03, 0);
    }
    this.caja.setFromObject(obj);
    const tam = this.caja.getSize(this.w);
    const mayor = Math.max(tam.x, tam.y, tam.z);
    const centro = obj.worldToLocal(this.caja.getCenter(new Vector3()));
    obj.getWorldQuaternion(this.q);
    const limpiador = crearLimpiador();
    const l: Llevado = {
      ag,
      obj,
      offset,
      giroRel: mano.giro.clone().invert().multiply(this.q),
      centro,
      punto: this.v.clone(),
      giro: this.q.clone(),
      escala0: obj.scale.clone(),
      giro0: obj.quaternion.clone(),
      achicar: mayor > GRANDE ? Math.max(0.55, GRANDE / mayor) : 1,
      restaurar: () => undefined,
      limpiador,
    };
    // Primero el contorno (para que también quede encima).
    this.contornoDe(l);
    l.restaurar = ponerEncima(obj, limpiador);
    this.llevando.set(mano, l);
    this.sonar('agarrar');
    mano.vibrar(0.4, 40);
  }

  /** El objeto sigue a la mano: posición y giro suavizados (~50 ms). */
  private seguirMano(l: Llevado, mano: Mano, dt: number): void {
    const obj = l.obj;
    const padre = obj.parent;
    if (!padre) {
      return;
    }
    if (mano === this.raton) {
      this.w.copy(mano.agarre).add(l.offset);
      obj.position.copy(padre.worldToLocal(this.w));
      return;
    }
    const k = 1 - Math.exp(-dt / SUAVE);
    // Achicar lo grande poco a poco.
    this.w.copy(l.escala0).multiplyScalar(l.achicar);
    obj.scale.lerp(this.w, Math.min(1, dt * 10));
    // Giro: el de la mano con el giro relativo del momento de agarrar.
    this.q.copy(mano.giro).multiply(l.giroRel);
    l.giro.slerp(this.q, k);
    l.punto.lerp(mano.agarre, k);
    padre.updateWorldMatrix(true, false);
    padre.getWorldQuaternion(this.q2);
    obj.quaternion.copy(this.q2.invert().multiply(l.giro));
    // Que el centro del objeto (no su origen) quede en el punto de agarre.
    padre.getWorldScale(this.w);
    this.v
      .copy(l.centro)
      .multiply(obj.scale)
      .multiply(this.w)
      .applyQuaternion(l.giro);
    this.w.copy(l.punto).sub(this.v);
    obj.position.copy(padre.worldToLocal(this.w));
  }

  private terminar(mano: Mano): void {
    const l = this.llevando.get(mano);
    if (l) {
      this.llevando.delete(mano);
      const d = l.ag.destino?.(l.obj) ?? null;
      l.restaurar();
      if (mano !== this.raton) {
        l.obj.scale.copy(l.escala0);
        l.obj.quaternion.copy(l.giro0);
      }
      this.reposar(l);
      // En un puesto, el juego suena el acierto o el error; si solo cae, un golpe suave.
      if (d === null) {
        this.sonar('soltar');
      }
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
    this.raton.agarre.copy(punto);
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
      this.raton.agarre.copy(p);
      this.raton.indice.copy(p);
    }
  }
}
