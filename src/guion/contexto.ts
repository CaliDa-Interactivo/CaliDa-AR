// ============================================================
// contexto.ts — lo que comparten todas las escenas del guion
// "Cali en tu mesa": el mundo, el estado global, las manos, el
// gato, la maqueta y utilidades (crear objetos, mirar a la
// persona, cabeza). Cada escena recibe este contexto.
// ============================================================
import {
  DistanceGrabbable,
  Group,
  MovementMode,
  Object3D,
  Quaternion,
  RayInteractable,
  Vector3,
  VisibilityState,
  type Entity,
  type World,
} from '@iwsdk/core';
import { Tocable } from '../componentes-calida.js';
import { crearMesa, type MesaArmada } from '../modelos.js';
import { AnclaWebXR } from '../webxr.js';
import { Animador } from './animador.js';
import { estadoInicial, type Estado } from './estado.js';
import { Gato } from './gato.js';
import { Manos } from './manos.js';
import { crearMaqueta, type Maqueta } from './maqueta.js';

/** Una escena de la máquina de estados. */
export interface Escena {
  nombre: string;
  entrar(c: Contexto): void;
  actualizar?(c: Contexto, dt: number): void;
  salir?(c: Contexto): void;
  /** Se tocó (pellizco corto, índice o clic) algo con ese id. */
  alTocar?(c: Contexto, id: string, entidad: Entity): void;
  /** Se soltó algo que se había agarrado. `toque`: casi no se movió. */
  alSoltar?(c: Contexto, id: string, entidad: Entity, toque: boolean): void;
}

export const OCULTO = 0.0001;

export class Contexto {
  estado: Estado = estadoInicial();
  readonly anim = new Animador();
  readonly manos = new Manos();
  readonly ancla = new AnclaWebXR();
  /** Punto de la maqueta en el mundo real: todo cuelga de aquí. */
  readonly raiz: Entity;
  readonly maqueta: Maqueta;
  readonly maquetaEnt: Entity;
  readonly gato: Gato;
  readonly mesa: Entity;
  readonly mesaArmada: MesaArmada;
  /** Punto de la mesa que encontró la escena 1. */
  readonly superficie = new Vector3();
  mesaVirtual = false;
  readonly cabeza = new Vector3();
  readonly frente = new Vector3();
  tiempo = 0;
  tEscena = 0;
  /** Con ?prueba se recorre en el computador con el mouse. */
  readonly modoPrueba = new URLSearchParams(window.location.search).has('prueba');
  /** Pasa a la escena siguiente (lo pone la máquina de estados). */
  siguiente: () => void = () => undefined;
  private q = new Quaternion();
  private v = new Vector3();

  constructor(readonly mundo: World) {
    this.raiz = mundo.createTransformEntity(new Group());
    this.maqueta = crearMaqueta();
    this.maquetaEnt = this.crear(this.maqueta.raiz);
    this.mesaArmada = crearMesa();
    this.mesa = this.crearSuelto(this.mesaArmada.raiz);
    this.gato = new Gato(mundo, this.raiz);
    this.tocable(this.gato.entidad, 'gato');
  }

  enXR(): boolean {
    return this.mundo.visibilityState.peek() !== VisibilityState.NonImmersive;
  }

  /** Objeto que cuelga de la maqueta anclada (o de `padre`). */
  crear(obj: Object3D, padre: Entity = this.raiz): Entity {
    return this.mundo.createTransformEntity(obj, { parent: padre });
  }

  /** Objeto suelto en el cuarto (no sigue a la maqueta). */
  crearSuelto(obj: Object3D): Entity {
    return this.mundo.createTransformEntity(obj);
  }

  /** Hace que algo se pueda tocar y, si se pide, agarrar con la mano. */
  tocable(entidad: Entity, id: string, agarrable = false): void {
    entidad.addComponent(Tocable, { id });
    entidad.addComponent(RayInteractable);
    if (agarrable) {
      entidad.addComponent(DistanceGrabbable, {
        movementMode: MovementMode.MoveFromTarget,
        rotate: false,
        scale: false,
      });
    }
  }

  mostrar(entidad: Entity, visible: boolean): void {
    const obj = entidad.object3D!;
    this.anim.cancelar(obj);
    obj.visible = visible;
    obj.scale.setScalar(visible ? 1 : OCULTO);
  }

  /** Posición de la cabeza y hacia dónde mira (sobre el piso). */
  leerCabeza(): void {
    const origen = this.enXR() ? this.mundo.player.head : this.mundo.camera;
    origen.getWorldPosition(this.cabeza);
    origen.getWorldQuaternion(this.q);
    this.frente.set(0, 0, -1).applyQuaternion(this.q);
    this.frente.y = 0;
    if (this.frente.lengthSq() < 0.0001) {
      this.frente.set(0, 0, -1);
    }
    this.frente.normalize();
  }

  /** Gira un objeto para que mire a la persona, sin inclinarse. */
  mirar(obj: Object3D): void {
    obj.getWorldPosition(this.v);
    this.v.set(this.cabeza.x, this.v.y, this.cabeza.z);
    obj.lookAt(this.v);
  }

  /** Pone la raíz en un punto de la mesa, mirando a la persona, y la ancla. */
  plantar(x: number, y: number, z: number): void {
    const raiz = this.raiz.object3D!;
    raiz.position.set(x, y, z);
    raiz.rotation.set(0, Math.atan2(this.cabeza.x - x, this.cabeza.z - z), 0);
    const cuadro = this.mundo.xrFrame;
    const espacio = this.mundo.xrReferenceSpace;
    if (cuadro && espacio) {
      raiz.updateWorldMatrix(true, false);
      this.ancla.crear(cuadro, espacio, raiz);
    }
  }
}
