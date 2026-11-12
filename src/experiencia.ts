// ============================================================
// experiencia.ts — el flujo completo de CaliDa en realidad
// aumentada (diagrama del equipo):
//
//   bienvenida → buscando superficie → (mesa real | mesa virtual)
//   → selección (estantería + caja) → camión → mapa de Cali
//   → viaje → refugio (carpa + situaciones)
//   → ¿alcanzó? no: vuelve a la selección · sí: cierre
//
// Todo cuelga de una "estación" que se pone sobre la mesa.
// ============================================================
import {
  AudioSource,
  AudioUtils,
  createSystem,
  DistanceGrabbable,
  Grabbed,
  Group,
  Hovered,
  MovementMode,
  Object3D,
  Pressed,
  Quaternion,
  RayInteractable,
  Vector3,
  VisibilityState,
  XRPlane as PlanoXR,
  type Entity,
} from '@iwsdk/core';
import { Boton, CajaDonacion, Casa, Producto } from './componentes-calida.js';
import { COLOR, CUPO_CAJA, PRODUCTOS, REFUGIOS, indiceProducto } from './datos.js';
import {
  MAPA,
  MUEBLE,
  PLATAFORMA,
  crearAro,
  crearCaja,
  crearCamion,
  crearCarpa,
  crearCasa,
  crearEstanteria,
  crearGato,
  crearMapa,
  crearMesa,
  crearProducto,
  crearTarima,
  recorridoHasta,
  type CajaArmada,
  type GatoArmado,
  type MesaArmada,
} from './modelos.js';
import { Etiqueta, Globo, PastillaBoton } from './texto.js';

type Fase =
  | 'bienvenida'
  | 'buscando'
  | 'seleccion'
  | 'camion'
  | 'mapa'
  | 'viaje'
  | 'refugio'
  | 'fin';

type Accion =
  | ''
  | 'entrar'
  | 'comenzar'
  | 'cerrar'
  | 'enviar'
  | 'continuar'
  | 'volver'
  | 'reiniciar';

// --- Distribución sobre la mesa (metros, en la estación; +z hacia la persona)
const ANCHO_ESTANTERIA = 0.8;
const ESCALA_MUEBLE = ANCHO_ESTANTERIA / MUEBLE.ancho;
const POS_ESTANTERIA = new Vector3(-0.22, 0, -0.2);
const POS_CAJA = new Vector3(0.42, 0, 0.12);
const POS_GATO = new Vector3(0.52, 0, -0.2);
const POS_CAMION = new Vector3(-0.2, 0, 0.21);
const POS_MAPA = new Vector3(-0.2, 0, -0.04);
const POS_CAMION_REFUGIO = new Vector3(-0.4, 0, 0.02);
const POS_CAJA_REFUGIO = new Vector3(0.08, 0, 0.14);
const ALTO_GATO = 0.3;
const ESCALA_EN_CAJA = 0.62;
const ESCALA_CAMION_MAPA = 0.3;
const OCULTO = 0.0001;
const VELOCIDAD_CAMION = 0.13; // metros por segundo sobre el mapa
const EJE_Y = new Vector3(0, 1, 0);

interface Movimiento {
  obj: Object3D;
  desde: Vector3;
  hasta: Vector3;
  mover: boolean;
  e0: number;
  e1: number; // < 0: no cambia la escala
  t: number;
  dur: number;
  arco: number;
  fin?: () => void;
}

const suave = (k: number): number => k * k * (3 - 2 * k);

function lista(nombres: string[]): string {
  if (nombres.length <= 1) {
    return nombres.join('');
  }
  return `${nombres.slice(0, -1).join(', ')} y ${nombres[nombres.length - 1]}`;
}

export class ExperienciaSystem extends createSystem({
  planos: { required: [PlanoXR] },
  productoAgarrado: { required: [Producto, Grabbed] },
  productoSenalado: { required: [Producto, Hovered] },
  productoPresionado: { required: [Producto, Pressed] },
  cajaAgarrada: { required: [CajaDonacion, Grabbed] },
  cajaPresionada: { required: [CajaDonacion, Pressed] },
  botonPresionado: { required: [Boton, Pressed] },
  botonSenalado: { required: [Boton, Hovered] },
  casaPresionada: { required: [Casa, Pressed] },
  casaSenalada: { required: [Casa, Hovered] },
}) {
  // Con ?prueba en la dirección se puede recorrer todo en el computador
  // (con el mouse), sin entrar a la sesión de realidad aumentada.
  private modoPrueba = new URLSearchParams(window.location.search).has('prueba');

  private fase: Fase = 'bienvenida';
  private tFase = 0;
  private reinicioEn = -1;
  private tiempo = 0;

  private estacion!: Entity;
  private gato!: Entity;
  private gatoArmado!: GatoArmado;
  private panel!: Entity;
  private globo = new Globo();
  private botonTexto = new PastillaBoton();
  private boton!: Entity;
  private accion: Accion = '';
  private tBoton = 0;
  private etiqueta = new Etiqueta();
  private etiquetaEnt!: Entity;
  private tarima!: Entity;
  private mesa!: Entity;
  private mesaArmada!: MesaArmada;
  private mesaVirtual = false;
  private estanteria!: Entity;
  private caja!: Entity;
  private cajaArmada!: CajaArmada;
  private camion!: Entity;
  private mapa!: Entity;
  private aro!: Object3D;
  private carpa!: Entity;

  private productos: Entity[] = [];
  private casas: Entity[] = [];
  private repisa: Vector3[] = [];
  private inicioAgarre: Vector3[] = [];
  private enCaja: boolean[] = [];
  private enMano: boolean[] = [];
  private cajaEnMano = false;
  private usado: boolean[] = [];
  private ranuras: number[] = new Array<number>(CUPO_CAJA).fill(-1);
  private cajaCargada = false;
  private cajaLibre = false; // la caja se puede agarrar (fase camión)
  private inicioCaja = new Vector3();

  private destino = -1;
  private resueltas: boolean[][] = REFUGIOS.map(() => [false, false, false]);
  private necesidad = -1; // cuál de las 3 necesidades se está viviendo
  private esperandoUso = false;
  private felizHasta = 0;

  private movimientos: Movimiento[] = [];
  // Viaje del camión por las calles del mapa.
  private ruta: Vector3[] = [];
  private tramo = 0;
  private v1 = new Vector3();
  private v2 = new Vector3();
  private v3 = new Vector3();
  private q1 = new Quaternion();

  // ----------------------------------------------------------------------
  init(): void {
    this.armarEscena();

    this.queries.botonPresionado.subscribe('qualify', () => this.alBoton());
    this.queries.botonSenalado.subscribe('qualify', (e) =>
      e.object3D?.scale.setScalar(this.accion ? 1.07 : OCULTO),
    );
    this.queries.botonSenalado.subscribe('disqualify', (e) =>
      e.object3D?.scale.setScalar(this.accion ? 1 : OCULTO),
    );

    // Tocar o agarrar un producto: empieza con "presionado" o "agarrado"
    // (lo que llegue primero) y termina cuando ya no queda ninguno de los dos.
    // Un toque muy corto solo alcanza a marcar "presionado".
    const tomaProducto = (e: Entity) => {
      const i = e.getValue(Producto, 'indice') as number;
      const obj = e.object3D;
      if (obj && !this.enMano[i]) {
        this.enMano[i] = true;
        this.etiqueta.malla.visible = false;
        this.cancelar(obj);
        this.inicioAgarre[i].copy(obj.position);
      }
    };
    // (dentro del aviso, la marca que se acaba puede seguir puesta: por eso
    // solo se revisa la otra)
    const sueltaProducto = (e: Entity, otra: typeof Grabbed) => {
      const i = e.getValue(Producto, 'indice') as number;
      if (this.enMano[i] && !e.hasComponent(otra)) {
        this.enMano[i] = false;
        this.alSoltarProducto(e);
      }
    };
    this.queries.productoAgarrado.subscribe('qualify', tomaProducto);
    this.queries.productoPresionado.subscribe('qualify', tomaProducto);
    this.queries.productoAgarrado.subscribe('disqualify', (e) => sueltaProducto(e, Pressed));
    this.queries.productoPresionado.subscribe('disqualify', (e) => sueltaProducto(e, Grabbed));
    this.queries.productoSenalado.subscribe('qualify', (e) => {
      const i = e.getValue(Producto, 'indice') as number;
      const obj = e.object3D;
      if (obj && obj.visible) {
        this.mostrarEtiqueta(PRODUCTOS[i].nombre, obj.position, 0.14, COLOR.azul);
      }
    });
    this.queries.productoSenalado.subscribe('disqualify', () =>
      this.ocultarEtiqueta(),
    );

    const tomaCaja = (e: Entity) => {
      if (e.object3D && !this.cajaEnMano) {
        this.cajaEnMano = true;
        this.cancelar(e.object3D);
        this.inicioCaja.copy(e.object3D.position);
      }
    };
    const sueltaCaja = (e: Entity, otra: typeof Grabbed) => {
      if (this.cajaEnMano && !e.hasComponent(otra)) {
        this.cajaEnMano = false;
        this.alSoltarCaja();
      }
    };
    this.queries.cajaAgarrada.subscribe('qualify', tomaCaja);
    this.queries.cajaPresionada.subscribe('qualify', tomaCaja);
    this.queries.cajaAgarrada.subscribe('disqualify', (e) => sueltaCaja(e, Pressed));
    this.queries.cajaPresionada.subscribe('disqualify', (e) => sueltaCaja(e, Grabbed));

    this.queries.casaPresionada.subscribe('qualify', (e) => {
      if (this.fase === 'mapa') {
        this.elegirCasa(e.getValue(Casa, 'indice') as number);
      }
    });
    this.queries.casaSenalada.subscribe('qualify', (e) => {
      const i = e.getValue(Casa, 'indice') as number;
      const obj = e.object3D;
      if (obj && this.fase === 'mapa') {
        this.v1.copy(obj.position).add(this.mapa.object3D!.position);
        this.mostrarEtiqueta(
          REFUGIOS[i].nombre,
          this.v1,
          0.13,
          REFUGIOS[i].urgente ? COLOR.rojo : COLOR.cafe,
        );
      }
    });
    this.queries.casaSenalada.subscribe('disqualify', () => this.ocultarEtiqueta());

    // Al entrar o salir de la sesión, la experiencia empieza de nuevo
    // (un instante después, cuando ya se conoce la posición de la cabeza).
    let anterior = this.world.visibilityState.peek();
    this.cleanupFuncs.push(
      this.world.visibilityState.subscribe((estado) => {
        const antes = anterior === VisibilityState.NonImmersive;
        const ahora = estado === VisibilityState.NonImmersive;
        anterior = estado;
        if (antes !== ahora) {
          this.reinicioEn = this.tiempo + 0.5;
        }
      }),
    );

    // Roboto puede terminar de cargar después del primer dibujo.
    void document.fonts
      ?.load('700 40px Roboto')
      .then(() => document.fonts.load('400 40px Roboto'))
      .then(() => {
        this.globo.dibujar();
        this.botonTexto.dibujar();
      })
      .catch(() => undefined);

    this.reiniciar();
  }

  // --- Armado (una sola vez) --------------------------------------------
  private armarEscena(): void {
    const mundo = this.world;
    this.estacion = mundo.createTransformEntity(new Group());
    const en = (obj: Object3D, padre: Entity = this.estacion): Entity =>
      mundo.createTransformEntity(obj, { parent: padre });

    this.tarima = en(crearTarima());

    this.mesaArmada = crearMesa();
    this.mesa = en(this.mesaArmada.raiz);

    this.estanteria = en(crearEstanteria(ANCHO_ESTANTERIA));
    this.estanteria.object3D!.position.copy(POS_ESTANTERIA);

    // Productos en sus repisas, como en la estantería de la página.
    const porCategoria = new Map<string, number[]>();
    PRODUCTOS.forEach((p, i) => {
      const grupo = porCategoria.get(p.categoria) ?? [];
      grupo.push(i);
      porCategoria.set(p.categoria, grupo);
    });
    PRODUCTOS.forEach((dato, i) => {
      const c = MUEBLE.compartimientos[dato.categoria];
      const grupo = porCategoria.get(dato.categoria) as number[];
      const puesto = grupo.indexOf(i);
      const paso = (c.x1 - c.x0) / grupo.length;
      const ancho = Math.min(0.092, paso * ESCALA_MUEBLE * 0.74);
      const alto = (c.y1 - c.y0) * ESCALA_MUEBLE * 0.8;
      const casa = new Vector3(
        POS_ESTANTERIA.x + (c.x0 + paso * (puesto + 0.5)) * ESCALA_MUEBLE,
        POS_ESTANTERIA.y + c.y0 * ESCALA_MUEBLE,
        POS_ESTANTERIA.z + MUEBLE.zProductos * ESCALA_MUEBLE,
      );
      const ent = en(crearProducto(dato, ancho, alto));
      ent.object3D!.position.copy(casa);
      ent.addComponent(Producto, { indice: i });
      ent.addComponent(RayInteractable);
      ent.addComponent(DistanceGrabbable, {
        movementMode: MovementMode.MoveFromTarget,
        rotate: false,
        scale: false,
      });
      this.productos.push(ent);
      this.repisa.push(casa);
      this.inicioAgarre.push(new Vector3());
      this.enCaja.push(false);
      this.enMano.push(false);
      this.usado.push(false);
    });

    this.cajaArmada = crearCaja();
    this.caja = en(this.cajaArmada.raiz);
    // La caja solo se puede tocar cuando está cerrada (fase del camión):
    // abierta, taparía los productos que tiene adentro.
    this.caja.addComponent(CajaDonacion);

    this.camion = en(crearCamion());

    this.mapa = en(crearMapa());
    this.mapa.object3D!.position.copy(POS_MAPA);
    this.aro = crearAro();
    this.aro.visible = false;
    this.mapa.object3D!.add(this.aro);
    REFUGIOS.forEach((refugio, i) => {
      const ent = en(crearCasa(refugio.urgente, 0.085), this.mapa);
      ent.object3D!.position.set(
        refugio.mapa[0] * (MAPA.ancho / 2 - 0.07),
        MAPA.alto,
        refugio.mapa[1] * (MAPA.fondo / 2 - 0.06),
      );
      ent.object3D!.rotation.y = 0.5;
      ent.addComponent(Casa, { indice: i });
      ent.addComponent(RayInteractable);
      this.casas.push(ent);
    });

    this.gatoArmado = crearGato(ALTO_GATO);
    this.gato = en(this.gatoArmado.raiz);
    this.gato.addComponent(AudioSource, {
      src: './audio/chime.mp3',
      maxInstances: 2,
    });

    // Globo del gato con su botón (siempre miran a la persona).
    this.panel = en(new Group());
    this.panel.object3D!.add(this.globo.malla);
    this.boton = en(this.botonTexto.malla, this.panel);
    this.boton.object3D!.position.set(0, -0.185, 0.012);
    this.boton.addComponent(Boton);
    this.boton.addComponent(RayInteractable);

    this.etiquetaEnt = en(this.etiqueta.malla);
    this.etiqueta.malla.visible = false;

    // La carpa no va en la estación: se arma alrededor de la persona.
    this.carpa = mundo.createTransformEntity(crearCarpa());
  }

  // --- Utilidades --------------------------------------------------------
  private enXR(): boolean {
    return this.world.visibilityState.peek() !== VisibilityState.NonImmersive;
  }

  /** Posición de la cabeza y hacia dónde mira (sobre el piso). */
  private cabeza(pos: Vector3, frente: Vector3): void {
    const origen = this.enXR() ? this.player.head : this.camera;
    origen.getWorldPosition(pos);
    origen.getWorldQuaternion(this.q1);
    frente.set(0, 0, -1).applyQuaternion(this.q1);
    frente.y = 0;
    if (frente.lengthSq() < 0.0001) {
      frente.set(0, 0, -1);
    }
    frente.normalize();
  }

  private mover(
    obj: Object3D,
    hasta: Vector3 | null,
    dur: number,
    opciones: { escala?: number; arco?: number; fin?: () => void } = {},
  ): void {
    this.cancelar(obj);
    this.movimientos.push({
      obj,
      desde: obj.position.clone(),
      hasta: (hasta ?? obj.position).clone(),
      mover: hasta !== null,
      e0: obj.scale.x,
      e1: opciones.escala ?? -1,
      t: 0,
      dur,
      arco: opciones.arco ?? 0,
      fin: opciones.fin,
    });
  }

  private cancelar(obj: Object3D): void {
    for (let i = this.movimientos.length - 1; i >= 0; i--) {
      if (this.movimientos[i].obj === obj) {
        this.movimientos.splice(i, 1);
      }
    }
  }

  private aparecer(ent: Entity, escala = 1): void {
    const obj = ent.object3D!;
    if (!obj.visible) {
      obj.scale.setScalar(0.02);
    }
    obj.visible = true;
    this.mover(obj, null, 0.45, { escala });
  }

  private esconder(ent: Entity, deUna = false): void {
    const obj = ent.object3D!;
    if (deUna || !obj.visible) {
      this.cancelar(obj);
      obj.visible = false;
      obj.scale.setScalar(OCULTO);
      return;
    }
    this.mover(obj, null, 0.3, {
      escala: 0.02,
      fin: () => {
        obj.visible = false;
        obj.scale.setScalar(OCULTO);
      },
    });
  }

  private decir(titulo: string, texto: string, boton = '', accion: Accion = ''): void {
    this.globo.escribir(titulo, texto);
    this.accion = accion;
    this.tBoton = this.tiempo;
    if (accion) {
      this.botonTexto.escribir(boton);
    }
    this.boton.object3D!.visible = accion !== '';
    this.boton.object3D!.scale.setScalar(accion ? 1 : OCULTO);
  }

  private mostrarEtiqueta(texto: string, sobre: Vector3, alto: number, fondo: string): void {
    this.etiqueta.escribir(texto, fondo);
    const obj = this.etiquetaEnt.object3D!;
    obj.position.set(sobre.x, sobre.y + alto, sobre.z + 0.03);
    obj.visible = true;
  }

  private ocultarEtiqueta(): void {
    if (
      this.queries.productoSenalado.entities.size === 0 &&
      this.queries.casaSenalada.entities.size === 0
    ) {
      this.etiqueta.malla.visible = false;
    }
  }

  private abrirCaja(abierta: boolean): void {
    this.cajaArmada.solapas.visible = abierta;
    this.cajaArmada.tapa.visible = !abierta;
  }

  private posRanura(ranura: number, out: Vector3): Vector3 {
    const base = this.caja.object3D!.position;
    return out.set(
      base.x + ((ranura % 3) - 1) * 0.078,
      base.y + 0.05, // sobre un relleno: asoman por el borde y se pueden tomar
      base.z + (ranura < 3 ? -0.042 : 0.045),
    );
  }

  private cuantosEnCaja(): number {
    let n = 0;
    for (let i = 0; i < PRODUCTOS.length; i++) {
      if (this.enCaja[i] && !this.usado[i]) {
        n++;
      }
    }
    return n;
  }

  // --- Inicio ------------------------------------------------------------
  private reiniciar(): void {
    this.movimientos.length = 0;
    this.fase = 'bienvenida';
    this.tFase = 0;
    this.destino = -1;
    this.necesidad = -1;
    this.esperandoUso = false;
    this.cajaCargada = false;
    this.resueltas.forEach((r) => r.fill(false));
    this.ranuras.fill(-1);

    // La estación empieza flotando frente a la persona, con el gato en su tarima.
    this.cabeza(this.v1, this.v2);
    const raiz = this.estacion.object3D!;
    raiz.position.copy(this.v1).addScaledVector(this.v2, 0.95);
    raiz.position.y = Math.max(0.75, this.v1.y - 0.6);
    raiz.rotation.set(0, Math.atan2(-this.v2.x, -this.v2.z), 0);

    this.esconder(this.mesa, true);
    this.esconder(this.estanteria, true);
    this.esconder(this.caja, true);
    this.esconder(this.camion, true);
    this.esconder(this.mapa, true);
    this.esconder(this.carpa, true);
    this.aro.visible = false;
    this.etiqueta.malla.visible = false;
    this.soltarCajaDeLaMano();
    this.abrirCaja(true);
    this.productos.forEach((ent, i) => {
      this.enCaja[i] = false;
      this.usado[i] = false;
      const obj = ent.object3D!;
      obj.position.copy(this.repisa[i]);
      obj.visible = false;
      obj.scale.setScalar(OCULTO);
    });

    const tarima = this.tarima.object3D!;
    tarima.visible = true;
    tarima.scale.setScalar(1);
    tarima.position.set(0, 0, 0);
    this.gato.object3D!.position.set(0, 0.03, 0);
    this.gato.object3D!.scale.setScalar(1);

    if (this.enXR() || this.modoPrueba) {
      this.decir(
        '¡Hola! Soy tu guía',
        'Vas a vivir una donación dos veces: primero como quien dona y luego como quien la recibe.',
        'Comenzar',
        'comenzar',
      );
    } else {
      this.decir(
        'CaliDa en realidad aumentada',
        'Abre esta página en el navegador de tus gafas Meta Quest y toca el botón para entrar.',
        'Entrar',
        'entrar',
      );
    }
  }

  // --- Botón del globo ---------------------------------------------------
  private alBoton(): void {
    if (!this.accion || this.tiempo - this.tBoton < 0.35) {
      return;
    }
    const accion = this.accion;
    this.accion = '';
    switch (accion) {
      case 'entrar':
        this.accion = 'entrar';
        this.world.launchXR();
        break;
      case 'comenzar':
        this.fase = 'buscando';
        this.tFase = 0;
        this.decir(
          'Rol: donante',
          'Estoy mirando tu espacio. Busco una mesa o una superficie plana para trabajar…',
        );
        break;
      case 'cerrar':
        this.cerrarCaja();
        break;
      case 'enviar':
        this.enviar();
        break;
      case 'continuar':
        this.siguienteSituacion();
        break;
      case 'volver':
        this.volverADonar();
        break;
      case 'reiniciar':
        this.reiniciar();
        break;
    }
  }

  // --- Superficie: mesa real o mesa virtual ------------------------------
  private colocarEstacion(): void {
    const real = this.buscarPlano();
    const raiz = this.estacion.object3D!;
    this.cabeza(this.v1, this.v2);
    if (real) {
      raiz.position.copy(this.v3);
      raiz.position.y += 0.003;
    } else {
      raiz.position.copy(this.v1).addScaledVector(this.v2, 0.95);
      raiz.position.y = 0.76;
    }
    // La estación mira a la persona.
    raiz.rotation.set(
      0,
      Math.atan2(this.v1.x - raiz.position.x, this.v1.z - raiz.position.z),
      0,
    );
    this.mesaVirtual = !real;
    if (this.mesaVirtual) {
      this.mesaArmada.patas.scale.y = Math.max(0.1, raiz.position.y - 0.04);
      this.aparecer(this.mesa);
    }
    this.esconder(this.tarima);
    this.mover(this.gato.object3D!, POS_GATO, 0.7, { arco: 0.12 });
    this.entrarASeleccion(
      real
        ? 'Encontré una superficie en tu espacio y la usaremos como mesa. '
        : 'No encontré una mesa libre, así que traje una. ',
    );
  }

  /** Busca un plano horizontal a la altura de una mesa. Deja el punto en v3. */
  private buscarPlano(): boolean {
    this.cabeza(this.v1, this.v2);
    let mejor = Infinity;
    for (const ent of this.queries.planos.entities) {
      const plano = ent.getValue(PlanoXR, '_plane') as XRPlane | undefined;
      const obj = ent.object3D;
      if (!plano || !obj) {
        continue;
      }
      if (String(plano.orientation).toLowerCase() !== 'horizontal') {
        continue;
      }
      const etiqueta = String(plano.semanticLabel ?? '').toLowerCase();
      if (etiqueta === 'floor' || etiqueta === 'ceiling') {
        continue;
      }
      const pos = obj.getWorldPosition(this.v2);
      if (pos.y < 0.35 || pos.y > 1.25) {
        continue;
      }
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
      if (Math.max(maxX - minX, maxZ - minZ) < 0.45 || Math.min(maxX - minX, maxZ - minZ) < 0.3) {
        continue;
      }
      const distancia = Math.hypot(pos.x - this.v1.x, pos.z - this.v1.z);
      if (distancia < 2.5 && distancia < mejor) {
        mejor = distancia;
        this.v3.copy(pos);
      }
    }
    return mejor < Infinity;
  }

  // --- Selección: de la estantería a la caja -----------------------------
  private entrarASeleccion(inicio: string): void {
    this.fase = 'seleccion';
    this.tFase = 0;
    this.cajaCargada = false;
    this.aparecer(this.estanteria);
    const caja = this.caja.object3D!;
    caja.position.copy(POS_CAJA);
    caja.rotation.set(0, 0, 0);
    this.abrirCaja(true);
    this.aparecer(this.caja);
    this.productos.forEach((ent, i) => {
      const obj = ent.object3D!;
      obj.visible = true;
      if (this.enCaja[i]) {
        obj.scale.setScalar(ESCALA_EN_CAJA);
        this.posRanura(this.ranuras.indexOf(i), obj.position);
      } else {
        obj.position.copy(this.repisa[i]);
        obj.scale.setScalar(0.02);
        this.mover(obj, null, 0.45, { escala: 1 });
      }
    });
    this.mensajeSeleccion(inicio);
  }

  private mensajeSeleccion(inicio = ''): void {
    const n = this.cuantosEnCaja();
    const base =
      inicio +
      'Toma de la estantería lo que quieras donar y llévalo a la caja. ' +
      (n === 0
        ? `Caben ${CUPO_CAJA} cosas.`
        : `Llevas ${n} de ${CUPO_CAJA}. Para sacar algo, tócalo.`);
    if (n > 0) {
      this.decir('Rol: donante', base, 'Cerrar la caja', 'cerrar');
    } else {
      this.decir('Rol: donante', base);
    }
  }

  private alSoltarProducto(ent: Entity): void {
    const i = ent.getValue(Producto, 'indice') as number;
    const obj = ent.object3D;
    if (!obj) {
      return;
    }
    const toque = obj.position.distanceTo(this.inicioAgarre[i]) < 0.035;
    const caja = this.caja.object3D!.position;
    const lejos = Math.hypot(obj.position.x - caja.x, obj.position.z - caja.z);

    if (this.fase === 'seleccion') {
      if (!this.enCaja[i]) {
        if (toque || (lejos < 0.21 && Math.abs(obj.position.y - caja.y) < 0.4)) {
          this.meterEnCaja(i);
        } else {
          this.mover(obj, this.repisa[i], 0.4, { escala: 1 });
        }
      } else if (toque || lejos > 0.24) {
        this.sacarDeCaja(i);
      } else {
        this.mover(obj, this.posRanura(this.ranuras.indexOf(i), this.v1), 0.25);
      }
      return;
    }
    if (this.fase === 'refugio' && this.esperandoUso && this.enCaja[i] && !this.usado[i]) {
      this.usar(i);
      return;
    }
    // En cualquier otro momento vuelve a su sitio.
    if (this.enCaja[i]) {
      this.mover(obj, this.posRanura(this.ranuras.indexOf(i), this.v1), 0.25);
    } else {
      this.mover(obj, this.repisa[i], 0.4);
    }
  }

  private meterEnCaja(i: number): void {
    const obj = this.productos[i].object3D!;
    const ranura = this.ranuras.indexOf(-1);
    if (ranura < 0) {
      this.mover(obj, this.repisa[i], 0.4, { escala: 1 });
      this.decir(
        'Rol: donante',
        `La caja ya está llena (${CUPO_CAJA} de ${CUPO_CAJA}). Toca algo de la caja para sacarlo, o ciérrala.`,
        'Cerrar la caja',
        'cerrar',
      );
      return;
    }
    this.ranuras[ranura] = i;
    this.enCaja[i] = true;
    this.mover(obj, this.posRanura(ranura, this.v1), 0.5, {
      escala: ESCALA_EN_CAJA,
      arco: 0.12,
    });
    this.mensajeSeleccion();
  }

  private sacarDeCaja(i: number): void {
    const ranura = this.ranuras.indexOf(i);
    if (ranura >= 0) {
      this.ranuras[ranura] = -1;
    }
    this.enCaja[i] = false;
    this.mover(this.productos[i].object3D!, this.repisa[i], 0.5, {
      escala: 1,
      arco: 0.12,
    });
    this.mensajeSeleccion();
  }

  // --- Camión ------------------------------------------------------------
  private cerrarCaja(): void {
    this.fase = 'camion';
    this.tFase = 0;
    this.abrirCaja(false);
    this.productos.forEach((ent, i) => {
      if (this.enCaja[i]) {
        ent.object3D!.visible = false;
        ent.object3D!.scale.setScalar(OCULTO);
      }
    });
    const camion = this.camion.object3D!;
    camion.position.copy(POS_CAMION);
    camion.rotation.set(0, 0, 0);
    this.aparecer(this.camion);
    if (!this.caja.hasComponent(RayInteractable)) {
      this.caja.addComponent(RayInteractable);
    }
    if (!this.caja.hasComponent(DistanceGrabbable)) {
      this.caja.addComponent(DistanceGrabbable, {
        movementMode: MovementMode.MoveFromTarget,
        rotate: false,
        scale: false,
      });
    }
    this.cajaLibre = true;
    this.decir(
      'Rol: donante',
      'La caja está lista. Tómala con tu mano (junta el pulgar y el índice) y súbela al camión.',
    );
  }

  private soltarCajaDeLaMano(): void {
    this.cajaLibre = false;
    this.cajaEnMano = false;
    if (this.caja.hasComponent(DistanceGrabbable)) {
      this.caja.removeComponent(DistanceGrabbable);
    }
    if (this.caja.hasComponent(RayInteractable)) {
      this.caja.removeComponent(RayInteractable);
    }
  }

  private alSoltarCaja(): void {
    if (this.fase !== 'camion' || !this.cajaLibre) {
      return;
    }
    const caja = this.caja.object3D!;
    const camion = this.camion.object3D!;
    const meta = this.v1.copy(camion.position).add(PLATAFORMA);
    const toque = caja.position.distanceTo(this.inicioCaja) < 0.035;
    const cerca = Math.hypot(caja.position.x - meta.x, caja.position.z - meta.z) < 0.26;
    if (!toque && !cerca) {
      this.mover(caja, POS_CAJA, 0.4);
      return;
    }
    this.cajaLibre = false;
    this.mover(caja, meta, 0.6, {
      arco: 0.1,
      fin: () => {
        this.soltarCajaDeLaMano();
        this.cajaCargada = true;
        this.felizHasta = this.tiempo + 1.2;
        AudioUtils.play(this.gato);
        this.entrarAlMapa();
      },
    });
  }

  // --- Mapa de Cali ------------------------------------------------------
  private entrarAlMapa(): void {
    this.fase = 'mapa';
    this.tFase = 0;
    this.esconder(this.estanteria);
    this.productos.forEach((ent, i) => {
      if (!this.enCaja[i]) {
        ent.object3D!.visible = false;
        ent.object3D!.scale.setScalar(OCULTO);
      }
    });
    this.aparecer(this.mapa);
    // El camión se vuelve de juguete y se parquea en la esquina del mapa.
    this.v1.set(POS_MAPA.x + 0.28, MAPA.alto, POS_MAPA.z + 0.25);
    this.camion.object3D!.rotation.y = Math.PI;
    this.mover(this.camion.object3D!, this.v1, 0.9, { escala: ESCALA_CAMION_MAPA, arco: 0.08 });
    if (this.destino >= 0) {
      this.elegirCasa(this.destino);
    } else {
      this.aro.visible = false;
      this.decir(
        'Mapa de Cali',
        'Las casas rojas son refugios con urgencia y las amarillas están desabastecidas. Toca una para ver qué necesita.',
      );
    }
  }

  private elegirCasa(i: number): void {
    this.destino = i;
    const refugio = REFUGIOS[i];
    const casa = this.casas[i].object3D!;
    this.aro.position.set(casa.position.x, MAPA.alto + 0.006, casa.position.z);
    this.aro.visible = true;
    const faltan = refugio.necesita
      .filter((_, k) => !this.resueltas[i][k])
      .map((id) => PRODUCTOS[indiceProducto(id)].nombre.toLowerCase());
    this.decir(
      refugio.nombre,
      `Zona ${refugio.zona} · ${refugio.urgente ? 'Urgente' : 'Desabastecido'}.\nNecesita: ${lista(faltan)}.`,
      'Enviar aquí',
      'enviar',
    );
  }

  private enviar(): void {
    if (this.destino < 0) {
      return;
    }
    this.fase = 'viaje';
    this.tFase = 0;
    // El camión recorre la ciudad por las calles hasta el refugio.
    this.cancelar(this.camion.object3D!);
    this.camion.object3D!.scale.setScalar(ESCALA_CAMION_MAPA);
    this.ruta = recorridoHasta(this.destino);
    for (const punto of this.ruta) {
      punto.x += POS_MAPA.x;
      punto.z += POS_MAPA.z;
    }
    this.tramo = 0;
    this.decir(
      REFUGIOS[this.destino].nombre,
      'El camión recorre Cali con tu donación…',
    );
  }

  /** Avanza el camión por su recorrido; al llegar, cambia la perspectiva. */
  private conducir(dt: number): void {
    const camion = this.camion.object3D!;
    let paso = VELOCIDAD_CAMION * dt;
    while (paso > 0 && this.tramo < this.ruta.length) {
      const meta = this.ruta[this.tramo];
      const dx = meta.x - camion.position.x;
      const dz = meta.z - camion.position.z;
      const falta = Math.hypot(dx, dz);
      if (falta <= paso) {
        camion.position.copy(meta);
        paso -= falta;
        this.tramo++;
        continue;
      }
      camion.position.x += (dx / falta) * paso;
      camion.position.z += (dz / falta) * paso;
      camion.position.y = meta.y;
      // Gira suave hacia donde va (adelante es +x).
      const giro = Math.atan2(-dz, dx);
      let diferencia = giro - camion.rotation.y;
      diferencia = Math.atan2(Math.sin(diferencia), Math.cos(diferencia));
      camion.rotation.y += diferencia * Math.min(1, dt * 9);
      paso = 0;
    }
    if (this.tramo >= this.ruta.length) {
      this.llegar();
    }
  }

  // --- Refugio: cambio de perspectiva -----------------------------------
  private llegar(): void {
    this.fase = 'refugio';
    this.tFase = 0;
    this.esperandoUso = false;
    this.cajaCargada = false;
    this.esconder(this.mapa);
    this.aro.visible = false;

    // La carpa aparece sobre la persona, con la entrada hacia la mesa.
    this.cabeza(this.v1, this.v2);
    const carpa = this.carpa.object3D!;
    const mesa = this.estacion.object3D!.position;
    carpa.position.set(this.v1.x, 0, this.v1.z);
    carpa.rotation.set(0, Math.atan2(-(mesa.x - this.v1.x), -(mesa.z - this.v1.z)), 0);
    this.aparecer(this.carpa);

    const camion = this.camion.object3D!;
    camion.rotation.set(0, 0, 0);
    this.mover(camion, POS_CAMION_REFUGIO, 0.8, { escala: 1 });
    const caja = this.caja.object3D!;
    caja.rotation.set(0, 0, 0);
    caja.scale.setScalar(1);
    caja.position.copy(POS_CAJA_REFUGIO);
    this.abrirCaja(true);
    this.productos.forEach((ent, i) => {
      if (this.enCaja[i] && !this.usado[i]) {
        const obj = ent.object3D!;
        obj.visible = true;
        this.posRanura(this.ranuras.indexOf(i), obj.position);
        obj.scale.setScalar(0.02);
        this.mover(obj, null, 0.5, { escala: ESCALA_EN_CAJA });
      }
    });
    this.decir(
      'Rol: beneficiario',
      `El camión llegó a ${REFUGIOS[this.destino].nombre}. Ahora estás dentro de una carpa, un refugio temporal después del terremoto, y eres quien recibe la caja.`,
      'Continuar',
      'continuar',
    );
  }

  private siguienteSituacion(): void {
    const refugio = REFUGIOS[this.destino];
    const k = this.resueltas[this.destino].indexOf(false);
    if (k < 0) {
      this.cerrar();
      return;
    }
    this.necesidad = k;
    const i = indiceProducto(refugio.necesita[k]);
    const dato = PRODUCTOS[i];
    const titulo = `Situación ${k + 1} de 3`;
    if (this.enCaja[i] && !this.usado[i]) {
      this.esperandoUso = true;
      this.decir(titulo, `${dato.situacion} Busca en la caja lo que te ayuda y tómalo.`);
    } else {
      // ¿Los recursos son suficientes? No → volver a la selección.
      this.esperandoUso = false;
      this.decir(
        titulo,
        `${dato.situacion} En la caja no llegó ${dato.nombre.toLowerCase()}: los recursos no alcanzan.`,
        'Volver a donar',
        'volver',
      );
    }
  }

  private usar(i: number): void {
    const refugio = REFUGIOS[this.destino];
    const necesario = indiceProducto(refugio.necesita[this.necesidad]);
    const obj = this.productos[i].object3D!;
    const dato = PRODUCTOS[i];
    if (i !== necesario) {
      this.mover(obj, this.posRanura(this.ranuras.indexOf(i), this.v1), 0.3);
      this.decir(
        `Situación ${this.necesidad + 1} de 3`,
        `Eso (${dato.nombre.toLowerCase()}) ayuda mucho, pero no en esta situación. ${PRODUCTOS[necesario].situacion}`,
      );
      return;
    }
    this.esperandoUso = false;
    this.usado[i] = true;
    this.ranuras[this.ranuras.indexOf(i)] = -1;
    this.resueltas[this.destino][this.necesidad] = true;
    this.felizHasta = this.tiempo + 1.6;
    AudioUtils.play(this.gato);
    this.v1.copy(obj.position);
    this.v1.y += 0.22;
    this.mover(obj, this.v1, 0.7, {
      escala: 0.02,
      fin: () => {
        obj.visible = false;
        obj.scale.setScalar(OCULTO);
      },
    });
    this.decir('¡Resuelto!', dato.alivio, 'Continuar', 'continuar');
  }

  private volverADonar(): void {
    const refugio = REFUGIOS[this.destino];
    const falta = PRODUCTOS[indiceProducto(refugio.necesita[this.necesidad])];
    this.esconder(this.carpa);
    this.esconder(this.camion);
    this.esperandoUso = false;
    // Lo que ya se usó vuelve a estar disponible en la estantería.
    this.productos.forEach((_, i) => {
      if (this.usado[i]) {
        this.usado[i] = false;
        this.enCaja[i] = false;
      }
    });
    this.entrarASeleccion(
      `En ${refugio.nombre} faltó ${falta.nombre.toLowerCase()}. Completa la donación. `,
    );
  }

  private cerrar(): void {
    this.fase = 'fin';
    this.tFase = 0;
    this.felizHasta = this.tiempo + 4;
    AudioUtils.play(this.gato);
    this.decir(
      '¡Gracias por donar!',
      `Tu caja resolvió las tres necesidades de ${REFUGIOS[this.destino].nombre}. En una emergencia, donar lo que de verdad hace falta le cambia el día a alguien.`,
      'Volver a empezar',
      'reiniciar',
    );
  }

  // --- Cada cuadro -------------------------------------------------------
  update(delta: number): void {
    const dt = Math.min(delta, 0.05);
    this.tiempo += dt;
    this.tFase += dt;

    if (this.reinicioEn >= 0 && this.tiempo >= this.reinicioEn) {
      this.reinicioEn = -1;
      this.reiniciar();
    }

    if (this.fase === 'buscando' && this.tFase > (this.enXR() ? 3 : 1.2)) {
      this.colocarEstacion();
    }

    // Red de seguridad: si algo quedó "en la mano" pero ya no está ni
    // agarrado ni presionado (un aviso perdido cuando el equipo va lento),
    // se suelta aquí.
    if (this.cajaEnMano && !this.caja.hasComponent(Grabbed) && !this.caja.hasComponent(Pressed)) {
      this.cajaEnMano = false;
      this.alSoltarCaja();
    }
    for (let i = 0; i < this.productos.length; i++) {
      const ent = this.productos[i];
      if (this.enMano[i] && !ent.hasComponent(Grabbed) && !ent.hasComponent(Pressed)) {
        this.enMano[i] = false;
        this.alSoltarProducto(ent);
      }
    }

    if (this.fase === 'viaje') {
      this.conducir(dt);
    }

    // Movimientos suaves.
    for (let i = this.movimientos.length - 1; i >= 0; i--) {
      const m = this.movimientos[i];
      m.t += dt;
      const k = suave(Math.min(1, m.t / m.dur));
      if (m.mover) {
        m.obj.position.lerpVectors(m.desde, m.hasta, k);
        m.obj.position.y += Math.sin(Math.PI * k) * m.arco;
      }
      if (m.e1 >= 0) {
        m.obj.scale.setScalar(m.e0 + (m.e1 - m.e0) * k);
      }
      if (m.t >= m.dur) {
        this.movimientos.splice(i, 1);
        m.fin?.();
      }
    }

    // La caja cargada viaja con el camión.
    if (this.cajaCargada) {
      const camion = this.camion.object3D!;
      const caja = this.caja.object3D!;
      this.v1
        .copy(PLATAFORMA)
        .multiplyScalar(camion.scale.x)
        .applyAxisAngle(EJE_Y, camion.rotation.y);
      caja.position.copy(camion.position).add(this.v1);
      caja.scale.copy(camion.scale);
      caja.rotation.y = camion.rotation.y;
    }

    // El gato mira a la persona, respira y salta cuando algo sale bien.
    this.cabeza(this.v1, this.v2);
    const raiz = this.estacion.object3D!;
    raiz.updateWorldMatrix(true, false);
    const local = raiz.worldToLocal(this.v3.copy(this.v1));
    const gato = this.gato.object3D!;
    gato.rotation.y = Math.atan2(local.x - gato.position.x, local.z - gato.position.z);
    const t = this.tiempo;
    const { pivote, brazo, cola } = this.gatoArmado;
    const feliz = t < this.felizHasta;
    pivote.scale.y = 1 + Math.sin(t * 1.6) * 0.01;
    if (feliz) {
      const c = t % 0.8;
      pivote.position.y = c < 0.45 ? Math.sin((c / 0.45) * Math.PI) * 0.04 : 0;
    } else {
      pivote.position.y = 0;
    }
    pivote.rotation.z = Math.sin(t * 0.9) * 0.025;
    if (brazo) {
      const saludo = this.fase === 'bienvenida' || feliz;
      brazo.rotation.x = saludo
        ? -0.75 + Math.sin(t * 4.2) * 0.2
        : Math.sin(t * 1.3) * 0.07;
    }
    if (cola) {
      cola.rotation.y = Math.sin(t * 1.2) * 0.25;
    }

    // El globo va sobre el gato y mira a la persona.
    const panel = this.panel.object3D!;
    panel.position.set(gato.position.x - 0.04, gato.position.y + ALTO_GATO + 0.3, gato.position.z);
    // (solo giran sobre su eje vertical: no se inclinan)
    panel.getWorldPosition(this.v2);
    this.v2.set(this.v1.x, this.v2.y, this.v1.z);
    panel.lookAt(this.v2);
    const etiqueta = this.etiquetaEnt.object3D!;
    if (etiqueta.visible) {
      etiqueta.getWorldPosition(this.v2);
      this.v2.set(this.v1.x, this.v2.y, this.v1.z);
      etiqueta.lookAt(this.v2);
    }
  }
}
