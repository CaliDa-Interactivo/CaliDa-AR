// ============================================================
// maquina.ts — máquina de estados de "Cali en tu mesa": corre
// las escenas en orden y les reparte lo que pasa (toques, cosas
// que se agarran y se sueltan, manos, tiempo).
//
// Escenas hechas: 1 DETECTAR_MESA · 2 COLOCAR_MAQUETA · 3 MISION
// (las demás del MVP se agregan a la lista ESCENAS en su orden).
// ============================================================
import {
  createSystem,
  Grabbed,
  Pressed,
  Vector3,
  VisibilityState,
  type Entity,
} from '@iwsdk/core';
import { Tocable } from '../componentes-calida.js';
import { Contexto, type Escena } from './contexto.js';
import { crearDetectarMesa } from './escenas/01-detectar-mesa.js';
import { crearColocarMaqueta } from './escenas/02-colocar-maqueta.js';
import { crearMision } from './escenas/03-mision.js';
import { crearNotificacionCajas } from './escenas/05-cajas.js';
import { crearRestock } from './escenas/06-restock.js';
import { estadoInicial } from './estado.js';
import { sonidos } from './sonidos.js';

export class GuionSystem extends createSystem({
  tocado: { required: [Tocable, Pressed] },
  agarrado: { required: [Tocable, Grabbed] },
}) {
  private c!: Contexto;
  private escenas: Escena[] = [];
  private indice = -1;
  private actual: Escena | null = null;
  private reinicioEn = -1;
  // Lo que la persona tiene tomado ahora, con el punto donde lo tomó.
  private enMano = new Map<Entity, Vector3>();

  init(): void {
    this.c = new Contexto(this.world);
    this.c.siguiente = () => this.ir(this.indice + 1);
    // Opciones del panel del centro de acopio. Sus tareas llegan con las
    // escenas 5 a 10; por ahora el panel y el gato dicen qué hará cada una.
    const TAREA = {
      recibir: 'Aquí recibirás las cajas que la gente trae al centro.',
      surtir: 'Aquí pondrás cada donación en su repisa y apartarás lo dañado.',
      despachar: 'Aquí armarás un lote y lo enviarás a una zona del mapa.',
    };
    this.c.alElegirOpcion = (opcion) => {
      sonidos.clic();
      this.c.escribirPanel('estado', TAREA[opcion]);
      if (this.c.gato.visible) {
        this.c.gato.decir(TAREA[opcion]);
      }
    };
    this.escenas = [
      crearDetectarMesa(),
      crearColocarMaqueta(),
      crearMision(),
      crearNotificacionCajas(),
      crearRestock(),
    ];
    this.c.avisos.alAccion = (aviso) => this.actual?.alAviso?.(this.c, aviso);

    // Tocar o agarrar: empieza con "presionado" o "agarrado" (lo que llegue
    // primero) y termina cuando ya no queda ninguno de los dos.
    const toma = (e: Entity) => {
      if (!this.enMano.has(e) && e.object3D) {
        this.c.anim.cancelar(e.object3D);
        this.enMano.set(e, e.object3D.position.clone());
      }
    };
    this.queries.tocado.subscribe('qualify', toma);
    this.queries.agarrado.subscribe('qualify', toma);

    // Al entrar o salir de la sesión de realidad aumentada, se empieza de nuevo.
    let anterior = this.world.visibilityState.peek();
    this.cleanupFuncs.push(
      this.world.visibilityState.subscribe((estado) => {
        const antes = anterior === VisibilityState.NonImmersive;
        const ahora = estado === VisibilityState.NonImmersive;
        anterior = estado;
        if (antes !== ahora) {
          this.reinicioEn = this.c.tiempo + 0.5;
        }
      }),
    );
    this.reiniciar();
  }

  private reiniciar(): void {
    const c = this.c;
    this.actual?.salir?.(c);
    this.actual = null;
    c.anim.limpiar();
    c.ancla.soltar();
    c.estado = estadoInicial();
    c.gato.ocultar();
    c.mostrar(c.maquetaEnt, false);
    c.mostrarPanel(false);
    c.avisos.reiniciar();
    c.llegadas.reiniciar();
    c.mostrar(c.mesa, false);
    this.enMano.clear();
    c.leerCabeza();
    this.ir(0);
  }

  private ir(indice: number): void {
    const c = this.c;
    this.actual?.salir?.(c);
    if (indice >= this.escenas.length) {
      // Todavía no hay más escenas: el gato lo dice.
      this.actual = null;
      this.indice = this.escenas.length;
      c.estado.escena = 'CONTINUARA';
      c.gato.animar('quieto');
      c.gato.decir(
        'Hasta aquí va esta versión. Pronto: las necesidades de cada zona y la urgencia por lluvias en Oriente.',
        'Continuará',
      );
      return;
    }
    this.indice = indice;
    this.actual = this.escenas[indice];
    c.estado.escena = this.actual.nombre;
    c.tEscena = 0;
    this.actual.entrar(c);
  }

  private soltar(entidad: Entity, inicio: Vector3): void {
    const obj = entidad.object3D;
    if (!obj || !this.actual) {
      return;
    }
    const id = entidad.getValue(Tocable, 'id') as string;
    const toque = obj.position.distanceTo(inicio) < 0.035;
    if (toque) {
      // La campana y sus avisos responden en cualquier escena.
      if (this.c.avisos.tocar(id)) {
        return;
      }
      this.actual.alTocar?.(this.c, id, entidad);
    }
    this.actual.alSoltar?.(this.c, id, entidad, toque);
  }

  update(delta: number): void {
    const c = this.c;
    const dt = Math.min(delta, 0.05);
    c.tiempo += dt;
    c.tEscena += dt;
    if (this.reinicioEn >= 0 && c.tiempo >= this.reinicioEn) {
      this.reinicioEn = -1;
      this.reiniciar();
    }

    c.leerCabeza();
    c.manos.actualizar(
      this.world.xrSession,
      this.world.xrFrame,
      this.world.xrReferenceSpace,
      c.cabeza,
      c.frente,
      c.tiempo,
    );

    // La maqueta sigue a su ancla de WebXR.
    const cuadro = this.world.xrFrame;
    const espacio = this.world.xrReferenceSpace;
    if (c.ancla.activa && cuadro && espacio) {
      c.ancla.seguir(cuadro, espacio, c.raiz.object3D!);
    }

    // Se soltó algo: ya no está ni agarrado ni presionado.
    for (const [entidad, inicio] of this.enMano) {
      if (!entidad.hasComponent(Grabbed) && !entidad.hasComponent(Pressed)) {
        this.enMano.delete(entidad);
        this.soltar(entidad, inicio);
      }
    }

    c.anim.actualizar(dt);
    this.actual?.actualizar?.(c, dt);
    c.avisos.actualizar(dt);
    c.gato.actualizar(c.tiempo, c.cabeza);
  }
}
