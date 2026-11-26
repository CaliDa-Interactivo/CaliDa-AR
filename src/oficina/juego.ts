// ============================================================
// juego.ts — CaliDa RA · Centro de acopio (modo un jugador).
//
// Flujo (diagrama del equipo):
//   bienvenida del gato → "Colocar aquí" (se arma la oficina)
//   → jornada (lunes a viernes, cada día más difícil):
//       llegan cajas a la pila → tomar una y abrirla →
//       sacar cada objeto → revisarlo a mano: si está bien, a su
//       fila (si hay menos de 30); si está dañado, a la caneca → ...
//       llega un pedido con reloj → elegir el municipio → armar la
//       caja desde la repisa → al camión → botón → ¿a tiempo?
//   → resumen del día → Continuar (siguiente jornada) o Finalizar
//   experiencia (resumen total y vuelta al inicio con el gato).
//
// Se agarra con el PUÑO y los botones se empujan con el ÍNDICE;
// sin pellizco ni rayos (los punteros de IWSDK se apagan).
// ============================================================
import {
  BoxGeometry,
  createSystem,
  Group,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  Quaternion,
  Vector3,
  VisibilityState,
  type Entity,
  type Object3D,
  DepthOccludable,
  OcclusionShadersMode,
} from '@iwsdk/core';
import { Animador } from '../guion/animador.js';
import { Gato } from '../guion/gato.js';
import { sonidos } from '../guion/sonidos.js';
import { crearCaja, crearTarima, type CajaArmada } from './objetos.js';
import { AnclaWebXR, SondaPiso, buscarSuperficie, type Superficie } from '../webxr.js';
import { RejillaPlana, buscarSuperficieEnMalla, type MallaReal } from '../superficie.js';
import {
  CATEGORIAS,
  COLOR,
  DIAS,
  INVENTARIO_INICIAL,
  JORNADAS,
  MAX_PILA,
  type Evento,
  MENSAJE_FINAL,
  PESO_CATEGORIA,
  subAlAzar,
  idProducto,
  MUNICIPIOS,
  indiceCategoria,
  nombreProducto,
  pedirPorProducto,
  type IdCategoria,
} from './datos.js';
import {
  ALTO_CAJA,
  CANECA,
  ESCALA_CAJA,
  ESCALA_GATO,
  Escena,
  HUELLA_REPISA,
  PEDIDO,
  PILA,
  TRABAJO,
  mirarAlCentro,
} from './escena.js';
import { Interaccion, type Agarrable, type Destino } from './interaccion.js';
import { Oclusion, OclusorManos } from './oclusion.js';
import { usarOclusionIWSDK } from './seguridad-oclusion.js';
import { Diagnostico } from './diagnostico.js';
import { DemoBoton, DemoPinza } from './demo.js';
import { Manos } from './manos.js';
import { completo, cuentaNueva, estrellasDe, faltantes, type Aviso, type Cuenta, type Pedido } from './modelo.js';
export { cuentaNueva, estrellasDe, type Cuenta } from './modelo.js';
import { Objeto } from './objetos.js';
import { reloj, textoPedido } from './panel.js';
import { BOTON, Boton3D, FUENTE, fondoPanel, lineas, rect, textoAjustado } from './ui.js';

export type Fase = 'inicio' | 'colocar' | 'espera' | 'jornada' | 'resumen' | 'semana';

export interface CajaD {
  armada: CajaArmada;
  grupo: Group;
  /** `sub`: qué producto de la categoría es (índice en `subs`). */
  objetos: { cat: IdCategoria; danado: boolean; sub?: number }[];
  estado: 'pila' | 'mano' | 'trabajo' | 'abierta' | 'fin';
  minis: Group[];
}

export interface ObjetoJuego {
  o: Objeto;
  origen: 'caja' | 'repisa';
  ag: Agarrable;
}

/** Rectángulo blanco (borde y relleno suave) con la huella de la estantería. */
function crearVistaPrevia(): Group {
  const g = new Group();
  const { ancho, fondo } = HUELLA_REPISA;
  const relleno = new Mesh(
    new PlaneGeometry(ancho, fondo),
    new MeshBasicMaterial({ color: '#FFFFFF', transparent: true, opacity: 0.18, depthWrite: false, toneMapped: false }),
  );
  relleno.rotation.x = -Math.PI / 2;
  g.add(relleno);
  const borde = new MeshBasicMaterial({ color: '#FFFFFF', toneMapped: false });
  const b = 0.008;
  for (const [w, d, x, z] of [
    [ancho, b, 0, -fondo / 2],
    [ancho, b, 0, fondo / 2],
    [b, fondo, -ancho / 2, 0],
    [b, fondo, ancho / 2, 0],
  ]) {
    const lado = new Mesh(new BoxGeometry(w, 0.003, d), borde);
    lado.position.set(x, 0.0015, z);
    g.add(lado);
  }
  return g;
}

/** Altura (coordenadas de la caja) justo encima del relleno de papel: ahí se apoyan los objetos de adentro. */
const ENCIMA_RELLENO = 0.05;

/** Escala de la caja del pedido adentro del furgón (para que quepa por la puerta). */
const ESCALA_CAJA_CAMION = 0.6;

const nombre = (id: IdCategoria) => CATEGORIAS.find((c) => c.id === id)!.corto;
const dxz = (a: Vector3, b: Vector3) => Math.hypot(a.x - b.x, a.z - b.z);

export class OficinaSystem extends createSystem({}) {
  protected modoPrueba = new URLSearchParams(window.location.search).has('prueba');
  protected escena = new Escena();
  protected raizEnt!: Entity;
  protected anim = new Animador();
  protected manos = new Manos();
  protected inter!: Interaccion;
  protected gato!: Gato;
  protected ancla = new AnclaWebXR();
  protected sonda = new SondaPiso();
  /** Superficie real (mesa) donde irá la estantería; null si no se reconoce ninguna. */
  protected superficie: Superficie | null = null;
  protected tSuperficie = 0;
  /** Zonas planas de la malla del cuarto (si ninguna mesa está marcada como plano). */
  protected rejilla = new RejillaPlana();
  protected firmaMallas = '';
  /** Altura de la mesa real sobre el piso al colocar (null: la mesa flota). */
  protected mesaReal: number | null = null;
  /** Rectángulo blanco sobre la mesa real: ahí irá la estantería. */
  protected vistaPrevia = crearVistaPrevia();
  /** El despachador no tiene caneca: no clasifica, solo despacha. */
  protected conCaneca = true;
  protected oclusion!: Oclusion;
  /** La mano real tapa lo virtual (articulaciones de WebXR). */
  protected oclusorManos = new OclusorManos();
  protected diagnostico: Diagnostico | null = null;
  /** Ejemplo animado de cómo se presiona un botón (junto a "Colocar aquí"). */
  protected demoBoton!: DemoBoton;
  /** Ejemplo animado de la pinza (sobre la mesa, justo después de colocar la oficina). */
  protected demoPinza = new DemoPinza();
  private girando = false;
  protected inicio = new Group();
  protected colocarBoton = new Boton3D('Colocar aquí', 0.17, 0.055, BOTON.principal);

  protected fase: Fase = 'inicio';
  protected tiempo = 0;
  protected reinicioEn = -1;
  protected cabeza = new Vector3();
  protected frente = new Vector3();

  // Jornada
  protected dia = 0;
  protected tDia = 0;
  protected siguienteEvento = 0;
  protected cuentas: Cuenta[] = [];
  protected avisos: Aviso[] = [];
  protected pedidos: Pedido[] = [];
  protected idAviso = 0;
  protected cola = 0;
  protected tCola = 0;
  protected pila: CajaD[] = [];
  protected trabajo: CajaD | null = null;
  protected sueltos: ObjetoJuego[] = [];
  protected actual: ObjetoJuego | null = null;
  protected zonaMarcada = -1;
  protected tPintar = 0;

  // Caja del pedido y camión
  protected cajaPedido!: CajaArmada;
  protected cajaEnCamion = false;
  /** La caja va entrando al furgón (las puertas siguen abiertas). */
  protected cargando = false;
  protected minisPedido: Group[] = [];
  protected camion: 'listo' | 'yendo' | 'fuera' | 'volviendo' = 'listo';
  /** Despachador (multijugador): al llevar la caja al camión aparece otra. */
  protected cajaInfinita = false;
  protected copiaCaja: Object3D | null = null;
  protected tCamion = 0;
  protected baseCamion = new Vector3();

  // Tutorial (lunes)
  protected tutorial = true;
  protected vistas = new Set<string>();
  protected flechaHasta = 0;
  protected flechaEn = new Vector3();

  protected v = new Vector3();
  protected w = new Vector3();
  protected giro = new Quaternion();

  init(): void {
    const mundo = this.world;
    this.raizEnt = mundo.createTransformEntity(this.escena.raiz);
    // Oclusión por profundidad de IWSDK: SOLO con ?oclusionsuave. Por defecto
    // dejaba toda la escena invisible en el Quest 3 (ver seguridad-oclusion.ts).
    if (usarOclusionIWSDK(new URLSearchParams(window.location.search))) {
      try {
        this.raizEnt.addComponent(DepthOccludable, { mode: OcclusionShadersMode.SoftOcclusion });
      } catch {
        // Sin el sistema de profundidad registrado: no hay oclusión.
      }
    }
    this.oclusion = new Oclusion(mundo, this.escena.raiz, this.raizEnt);
    // Las articulaciones vienen en el espacio de referencia (el del jugador).
    const params = new URLSearchParams(window.location.search);
    if (!params.has('sinoclusormano')) {
      this.player.add(this.oclusorManos.grupo);
    }
    this.vistaPrevia.visible = false;
    this.player.add(this.vistaPrevia);
    // ?diagnostico: datos de la profundidad y de las manos frente a la vista.
    if (params.has('diagnostico')) {
      this.diagnostico = new Diagnostico(mundo, this.manos);
      this.diagnostico.colgarDe(this.player.head);
    }
    // Sin rayos ni agarres de IWSDK: pinza propia (pulgar e índice) y botones con el índice.
    for (const lado of ['left', 'right'] as const) {
      const mp = this.input.xr.multiPointers[lado];
      mp.toggleSubPointer('ray', false);
      mp.toggleSubPointer('grab', false);
      mp.toggleSubPointer('touch', false);
    }
    this.inter = new Interaccion(
      this.escena.sobre,
      this.manos,
      () => mundo.camera,
      this.anim,
      this.modoPrueba ? mundo.renderer.domElement : null,
    );
    this.inter.apoyo = (x, z) => this.escena.apoyo(x, z);
    this.inter.sonar = (q) => sonidos[q]();
    this.inter.botones.push(...this.escena.botones, this.colocarBoton);

    // Inicio: el gato sobre su tarima a la izquierda, su mensaje a la derecha
    // y "Colocar aquí" DEBAJO del mensaje (centrado con él, sin taparlo).
    this.colocarBoton.grupo.position.set(-0.02, -0.33, 0);
    this.inicio.add(this.colocarBoton.grupo);
    const tarima = crearTarima();
    tarima.scale.setScalar(0.6);
    tarima.position.set(-0.36, -0.36, -0.02);
    this.inicio.add(tarima);
    // Ejemplo de cómo se presiona: una mano empuja (solo de forma visual) "Colocar aquí".
    this.demoBoton = new DemoBoton(this.colocarBoton);
    this.demoBoton.grupo.position.copy(this.colocarBoton.grupo.position);
    this.inicio.add(this.demoBoton.grupo);
    // Ejemplo de la pinza: aparece sobre la mesa al colocar la oficina.
    this.demoPinza.grupo.position.set(0.24, 0, -0.29);
    this.demoPinza.grupo.visible = false;
    this.escena.sobre.add(this.demoPinza.grupo);
    this.escena.raiz.add(this.inicio);
    this.colocarBoton.alPresionar = () => this.colocar();
    this.gato = new Gato(mundo, this.raizEnt);

    this.armarCajaPedido();
    this.registrarAgarrables();
    this.conectarBotones();

    let anterior = mundo.visibilityState.peek();
    this.cleanupFuncs.push(
      mundo.visibilityState.subscribe((estado) => {
        const antes = anterior === VisibilityState.NonImmersive;
        const ahora = estado === VisibilityState.NonImmersive;
        anterior = estado;
        if (antes !== ahora) {
          this.reinicioEn = this.tiempo + 0.5;
        }
      }),
    );
    void document.fonts?.load('700 40px Roboto').catch(() => undefined);
    this.reiniciar();
  }

  protected enXR(): boolean {
    return this.world.visibilityState.peek() !== VisibilityState.NonImmersive;
  }

  protected leerCabeza(): void {
    const origen = this.enXR() ? this.player.head : this.world.camera;
    origen.getWorldPosition(this.cabeza);
    // Hacia dónde mira: el eje -Z de la cabeza (o de la cámara).
    this.frente.set(0, 0, -1).applyQuaternion(origen.getWorldQuaternion(this.giro));
    this.frente.y = 0;
    if (this.frente.lengthSq() < 1e-4) {
      this.frente.set(0, 0, -1);
    }
    this.frente.normalize();
  }

  // ---- Reinicio y colocación --------------------------------------

  protected reiniciar(): void {
    this.anim.limpiar();
    this.inter.soltarTodo();
    this.ancla.soltar();
    this.fase = 'inicio';
    this.dia = 0;
    this.cuentas = [];
    this.tutorial = true;
    this.vistas.clear();
    this.limpiarJornada();
    this.escena.repisa.fijar(CATEGORIAS.map((c) => INVENTARIO_INICIAL[c.id]));
    this.escena.sobre.visible = false;
    this.escena.raiz.children.forEach((c) => {
      if (c !== this.escena.sobre && c !== this.inicio) {
        c.visible = false;
      }
    });
    this.mostrarInicio();
    this.gato.decir(
      'Esta semana gestionas un centro de acopio de la Cruz Roja en Cali. Mira al frente y empuja "Colocar aquí" con tu índice.',
      '¡Hola! Soy tu guía',
    );
  }

  /** y del piso real (planos o hit-test) o el del espacio de referencia. */
  protected pisoY(): number {
    return this.sonda.piso ?? 0;
  }

  /** Pone el botón y el gato frente a la persona. */
  protected mostrarInicio(): void {
    // "Colocar aquí" aparece donde pudo estar el dedo: pausa para no colocar sin querer.
    this.inter?.pausarBotones(1.2);
    this.leerCabeza();
    const raiz = this.escena.raiz;
    raiz.position.set(this.cabeza.x, this.pisoY(), this.cabeza.z);
    raiz.rotation.set(0, Math.atan2(-this.frente.x, -this.frente.z), 0);
    raiz.updateWorldMatrix(true, true);
    this.inicio.visible = true;
    this.colocarBoton.activo = true;
    this.demoBoton.reiniciar();
    const gato = this.gato.objeto;
    gato.visible = true;
    gato.scale.setScalar(1);
    this.alturaInicio();
    this.gato.animar('saludar');
  }

  private alturaInicio(): void {
    // El conjunto sube un poco: el botón queda a la altura del pecho.
    this.inicio.position.set(0.06, this.cabeza.y - this.escena.raiz.position.y - 0.2, -0.45);
    this.gato.objeto.position.set(this.inicio.position.x - 0.36, this.inicio.position.y - 0.33, -0.47);
  }

  /**
   * Mientras se escoge el lugar, el gato y "Colocar aquí" siguen la mirada:
   * siempre quedan enfrente. Giran solo cuando la mirada se aleja (así el
   * botón no se escapa del dedo) y nunca mientras se está empujando.
   */
  private seguirMirada(dt: number): void {
    if (this.colocarBoton.hundido > 0) {
      return;
    }
    const raiz = this.escena.raiz;
    const k = 1 - Math.exp(-dt * 4);
    raiz.position.x += (this.cabeza.x - raiz.position.x) * k;
    raiz.position.z += (this.cabeza.z - raiz.position.z) * k;
    raiz.position.y += (this.pisoY() - raiz.position.y) * k;
    let d = Math.atan2(-this.frente.x, -this.frente.z) - raiz.rotation.y;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    if (Math.abs(d) > 0.3) {
      this.girando = true;
    }
    if (this.girando) {
      raiz.rotation.y += d * Math.min(1, dt * 5);
      if (Math.abs(d) < 0.04) {
        this.girando = false;
      }
    }
    this.alturaInicio();
    if (this.sonda.fuente && !this.vistas.has('piso') && !this.superficie) {
      this.vistas.add('piso');
      this.gato.decir('Ya encontré el piso. Mira hacia una mesa (o donde quieras la oficina) y empuja "Colocar aquí".');
    }
  }

  /**
   * Mientras se escoge el lugar: busca una superficie real (mesa) donde quepa
   * toda la estantería, cerca de donde se está mirando, y la marca con un
   * rectángulo blanco.
   */
  protected buscarMesaReal(dt: number, cuadro: XRFrame | null, espacio: XRReferenceSpace | null): void {
    this.tSuperficie -= dt;
    if (this.tSuperficie > 0) {
      return;
    }
    this.tSuperficie = 0.3;
    if (!cuadro || !espacio) {
      this.superficie = null;
      this.vistaPrevia.visible = false;
      return;
    }
    const giro = Math.atan2(-this.frente.x, -this.frente.z);
    const z = HUELLA_REPISA.centroZ;
    const deseado = { x: this.cabeza.x + z * Math.sin(giro), z: this.cabeza.z + z * Math.cos(giro), giro };
    const antes = this.superficie;
    const piso = this.pisoY();
    this.superficie =
      buscarSuperficie(cuadro, espacio, piso, deseado, HUELLA_REPISA.ancho, HUELLA_REPISA.fondo) ??
      this.buscarEnMalla(cuadro, espacio, piso, deseado);
    const sup = this.superficie;
    this.vistaPrevia.visible = !!sup;
    if (sup) {
      this.vistaPrevia.position.set(sup.x, sup.y + 0.004, sup.z);
      this.vistaPrevia.rotation.set(0, sup.giro, 0);
      if (!antes && !this.vistas.has('mesa')) {
        this.vistas.add('mesa');
        this.vistas.add('piso');
        this.gato.decir('Encontré una superficie plana: la estantería irá en el rectángulo blanco. Empuja "Colocar aquí".');
      }
    }
  }

  /** Respaldo: zonas planas de la malla del cuarto (se rearma solo si la malla cambió). */
  protected buscarEnMalla(
    cuadro: XRFrame,
    espacio: XRReferenceSpace,
    piso: number,
    deseado: { x: number; z: number; giro: number },
  ): Superficie | null {
    let mallas: XRMesh[] = [];
    try {
      mallas = [...(cuadro.detectedMeshes ?? [])];
    } catch {
      return null;
    }
    if (mallas.length === 0) {
      return null;
    }
    const firma = `${mallas.length}:${mallas.reduce((a, m) => a + m.lastChangedTime, 0)}:${piso.toFixed(2)}`;
    if (firma !== this.firmaMallas) {
      this.firmaMallas = firma;
      const reales: MallaReal[] = [];
      for (const m of mallas) {
        const pose = cuadro.getPose(m.meshSpace, espacio);
        if (pose) {
          reales.push({ matriz: pose.transform.matrix, vertices: m.vertices, indices: m.indices });
        }
      }
      this.rejilla.armar(reales, piso);
    }
    return buscarSuperficieEnMalla(this.rejilla, deseado, HUELLA_REPISA.ancho, HUELLA_REPISA.fondo);
  }

  /** Arma la oficina donde está la persona, mirando hacia donde mira. */
  protected colocar(): void {
    this.leerCabeza();
    const raiz = this.escena.raiz;
    const piso = this.pisoY();
    const sup = this.superficie;
    if (sup) {
      // La estantería queda SOBRE la superficie real (mesa) y la mesa virtual a
      // su altura; las esquinas de la mesa virtual pueden salirse.
      const z = HUELLA_REPISA.centroZ;
      raiz.position.set(sup.x - z * Math.sin(sup.giro), piso, sup.z - z * Math.cos(sup.giro));
      raiz.rotation.set(0, sup.giro, 0);
      this.mesaReal = sup.y - piso;
    } else {
      raiz.position.set(this.cabeza.x, piso, this.cabeza.z);
      raiz.rotation.set(0, Math.atan2(-this.frente.x, -this.frente.z), 0);
      this.mesaReal = null;
    }
    this.vistaPrevia.visible = false;
    // Calibración de pie: todo se ajusta a la estatura (ver escena.ts).
    const alto = this.escena.ajustarErgonomia(this.cabeza.y - raiz.position.y, this.mesaReal);
    raiz.updateWorldMatrix(true, true);
    // Ancla de WebXR: la oficina queda fija al cuarto real.
    const cuadro = this.world.xrFrame;
    const espacio = this.world.xrReferenceSpace;
    if (cuadro && espacio) {
      this.ancla.crear(cuadro, espacio, raiz);
    }
    this.inicio.visible = false;
    this.colocarBoton.activo = false;
    raiz.children.forEach((c) => (c.visible = c !== this.inicio));
    const sobre = this.escena.sobre;
    sobre.visible = true;
    sobre.scale.setScalar(0.02);
    this.anim.mover(sobre, null, 0.6, { escala: 1 });
    sonidos.pop();
    // El gato sube a la estantería, con el reloj a sus pies.
    this.escena.puestoGato(this.v);
    this.anim.mover(this.gato.objeto, this.v, 0.8, { arco: 0.15, escala: ESCALA_GATO });
    this.gato.animar('quieto');
    if (!this.enXR()) {
      // Modo prueba: la cámara un poco atrás para ver toda la U.
      const cam = this.world.camera;
      cam.position.set(raiz.position.x, alto + 0.68, raiz.position.z + 0.62);
      cam.lookAt(raiz.position.x, alto - 0.05, raiz.position.z - 0.42);
    }
    const lejos = Math.hypot(this.cabeza.x - raiz.position.x, this.cabeza.z - raiz.position.z) > 0.25;
    if (this.fase === 'colocar') {
      this.fase = 'jornada';
      this.gato.decir(
        sup
          ? `Listo: la estantería quedó sobre tu mesa.${lejos ? ' Párate frente a ella.' : ''}`
          : 'Listo, oficina en su nuevo lugar.',
      );
    } else {
      // Primera vez: el ejemplo de la pinza sobre la mesa, recién cargada.
      this.demoPinza.reiniciar();
      this.demoPinza.grupo.visible = true;
      this.trasColocar();
    }
  }

  /** El ejemplo de la pinza se ve dos veces o hasta que la persona agarra algo. */
  protected ejemploPinza(dt: number): void {
    const demo = this.demoPinza;
    if (!demo.grupo.visible) {
      return;
    }
    const agarro = [...this.manos.lista, this.inter.raton].some((m) => !!this.inter.lleva(m));
    if (agarro || demo.vueltas >= 2 || (this.fase !== 'jornada' && (this.fase as string) !== 'espera')) {
      demo.grupo.visible = false;
      return;
    }
    demo.actualizar(dt);
  }

  /** Vuelve a medir la altura de los ojos (de pie) y reacomoda todo sin mover la oficina. */
  protected recalibrar(): void {
    this.leerCabeza();
    this.escena.ajustarErgonomia(this.cabeza.y - this.escena.raiz.position.y, this.mesaReal);
    this.anim.mover(this.gato.objeto, this.escena.puestoGato(this.v).clone(), 0.5, { arco: 0.08, escala: ESCALA_GATO });
    sonidos.pop();
    this.gato.decir('Listo: ajusté la mesa, la estantería y las pantallas a tu estatura. Si no estabas de pie, párate derecho y vuelve a empujarlo.', 'Altura');
  }

  /** Qué pasa la primera vez que se coloca la oficina. */
  protected trasColocar(): void {
    this.empezarJornada();
  }

  // ---- Jornada -------------------------------------------------------

  protected limpiarJornada(): void {
    this.tDia = 0;
    this.siguienteEvento = 0;
    this.avisos = [];
    this.pedidos = [];
    this.cola = 0;
    this.tCola = 0;
    for (const c of this.pila) {
      c.grupo.removeFromParent();
    }
    this.pila = [];
    if (this.trabajo) {
      this.trabajo.grupo.removeFromParent();
    }
    this.trabajo = null;
    for (const s of this.sueltos) {
      this.quitarObjeto(s);
    }
    this.sueltos = [];
    this.actual = null;
    this.vaciarCajaPedido();
    this.copiaCaja?.removeFromParent();
    this.copiaCaja = null;
    this.camion = 'listo';
    this.escena.camion.visible = true;
    this.escena.camion.position.copy(this.baseCamion);
    this.escena.camion.scale.setScalar(0.75);
    this.escena.panel.verAvisos();
    this.escena.mostrarResumen(false);
    this.escena.flecha.visible = false;
  }

  protected empezarJornada(): void {
    this.limpiarJornada();
    this.fase = 'jornada';
    this.cuentas[this.dia] = cuentaNueva();
    this.cuentas[this.dia].pedidos = JORNADAS[this.dia].eventos.filter((e) => e.tipo === 'pedido').length;
    if (this.dia > 0) {
      this.tutorial = false;
    }
    this.escena.panel.saltar.activo = false; // ya no hay botón de saltar el tutorial bajo el monitor
    const frases = [
      'Soy tu guía. Cuando suene la campana, revisa la pantalla de la izquierda: ahí llegan las donaciones y los pedidos.',
      '¡Arranca el martes! Hoy llegan más cajas y vienen más cosas dañadas.',
      'Miércoles: los pedidos llegan con menos tiempo. ¡Atenta a las urgencias!',
      'Jueves: llueve en varios municipios. Habrá más pedidos urgentes.',
      'Viernes, el día más duro. ¡Vamos a cerrar bien la semana!',
    ];
    this.gato.decir(frases[this.dia], DIAS[this.dia]);
    this.gato.animar('saludar', 2.5, this.tiempo);
  }

  protected hora(): string {
    const k = Math.min(1, this.tDia / JORNADAS[this.dia].duracion);
    const h = 8 + 9 * k;
    const hh = Math.floor(h);
    const mm = Math.floor((h - hh) * 60);
    const h12 = hh > 12 ? hh - 12 : hh;
    return `${h12}:${String(mm).padStart(2, '0')} ${hh >= 12 ? 'p. m.' : 'a. m.'}`;
  }

  protected avisar(aviso: Omit<Aviso, 'id' | 'estado' | 'hechoEn'>): Aviso {
    const nuevo: Aviso = { ...aviso, id: ++this.idAviso, estado: 'pendiente', hechoEn: 0 };
    this.avisos.push(nuevo);
    sonidos.campana();
    this.manos.lista.forEach((m) => m.vibrar(0.6, 120));
    return nuevo;
  }

  protected resolver(aviso: Aviso): void {
    aviso.estado = 'hecho';
    aviso.hechoEn = this.tiempo;
  }

  protected dispararEventos(): void {
    const eventos = JORNADAS[this.dia].eventos;
    while (this.siguienteEvento < eventos.length && this.tDia >= eventos[this.siguienteEvento].en) {
      this.evento(eventos[this.siguienteEvento++]);
    }
  }

  /** Un evento de la línea de tiempo (cajas o pedido). */
  protected evento(e: Evento): void {
    {
      if (e.tipo === 'cajas') {
        this.avisar({
          tipo: 'cajas',
          texto: `Llegaron ${e.cantidad} cajas al centro de acopio`,
          accion: 'Recibidas',
          cajas: e.cantidad,
        });
        this.pista('recibir', 'Llegaron donaciones. Empuja "Recibidas" en la pantalla con la punta del índice.', this.puntoPanel());
      } else {
        const p: Pedido = {
          id: this.idAviso + 1,
          municipio: e.municipio,
          pide: pedirPorProducto(e.pide, this.dia * 31 + this.siguienteEvento),
          lleva: {},
          plazo: e.plazo,
          restante: e.plazo,
          estado: 'espera',
          tarde: false,
          urgente: e.urgente,
          familias: e.familias,
        };
        this.pedidos.push(p);
        this.avisar({
          tipo: 'pedido',
          texto: e.urgente
            ? `URGENTE · ${e.urgente}: enviar ${textoPedido(p, false)}`
            : `Pedido: ${e.municipio} necesita ${textoPedido(p, false)}`,
          accion: 'Aceptar',
          pedido: p,
        });
        if (e.urgente) {
          this.gato.senalar(this.puntoMundo(this.puntoPanel()), 3, this.tiempo);
          this.gato.decir(`¡${e.urgente}! Mira la campana: es urgente.`);
        }
        this.pista('pedido', '¡Un pedido! Empuja "Aceptar" y elige el municipio. Desde ahí corre su reloj.', this.puntoPanel());
      }
    }
  }

  // ---- Cajas que llegan ---------------------------------------------

  protected nuevaCaja(dadas?: CajaD['objetos']): void {
    if (this.pila.length >= MAX_PILA) {
      this.cuenta.perdidas++;
      sonidos.error();
      this.escena.panel.avisar('Pila llena: se perdió una caja', this.tiempo);
      this.gato.decir('¡La pila está llena! Esa caja no cupo y se perdió. Desocupa la mesa más rápido.');
      return;
    }
    const jornada = JORNADAS[this.dia];
    if (dadas) {
      this.ponerCaja(dadas);
      return;
    }
    const [min, max] = jornada.porCaja;
    const n = min + Math.floor(Math.random() * (max - min + 1));
    const objetos: CajaD['objetos'] = [];
    const total = CATEGORIAS.reduce((s, c) => s + PESO_CATEGORIA[c.id], 0);
    for (let i = 0; i < n; i++) {
      let r = Math.random() * total;
      let cat = CATEGORIAS[0].id;
      for (const c of CATEGORIAS) {
        r -= PESO_CATEGORIA[c.id];
        if (r <= 0) {
          cat = c.id;
          break;
        }
      }
      objetos.push({ cat, danado: Math.random() < jornada.danados, sub: subAlAzar(cat) });
    }
    // Siempre al menos un objeto dañado por caja desde el martes.
    if (this.dia > 0 && !objetos.some((o) => o.danado)) {
      objetos[0].danado = true;
    }
    this.ponerCaja(objetos);
  }

  protected ponerCaja(objetos: CajaD['objetos']): void {
    const armada = crearCaja(true);
    armada.solapas.visible = false;
    armada.tapa.visible = true;
    sinContorno(armada.raiz);
    armada.raiz.scale.setScalar(ESCALA_CAJA);
    const caja: CajaD = { armada, grupo: armada.raiz, objetos, estado: 'pila', minis: [] };
    this.escena.sobre.add(caja.grupo);
    this.pila.push(caja);
    const destino = this.puestoPila(this.pila.length - 1, this.v);
    caja.grupo.position.copy(destino).setY(destino.y + 0.3);
    this.anim.mover(caja.grupo, destino, 0.45);
    sonidos.soltar();
    this.registrarCaja(caja);
    if (!this.trabajo) {
      this.pista('tomar', 'Acerca la pinza (pulgar e índice) a una caja de la pila: cuando se ilumine, ciérrala y lleva la caja al centro de la mesa.', PILA[0]);
    }
  }

  protected puestoPila(i: number, salida: Vector3): Vector3 {
    const base = PILA[i % 2];
    return salida.set(base.x, Math.floor(i / 2) * ALTO_CAJA * 1.03, base.z);
  }

  protected reacomodarPila(): void {
    this.pila.forEach((c, i) => {
      const p = this.puestoPila(i, this.v);
      if (c.grupo.position.distanceTo(p) > 0.005) {
        this.anim.mover(c.grupo, p.clone(), 0.3);
      }
    });
  }

  protected registrarCaja(caja: CajaD): void {
    const ag: Agarrable = {
      obj: caja.grupo,
      activo: () =>
        this.fase === 'jornada' &&
        caja.estado === 'pila' &&
        !this.trabajo &&
        this.pila.indexOf(caja) + 2 >= this.pila.length,
      tomar: () => {
        this.pila.splice(this.pila.indexOf(caja), 1);
        caja.estado = 'mano';
        this.reacomodarPila();
        return caja.grupo;
      },
      destino: (obj) => (dxz(obj.position, TRABAJO) < 0.2 ? 'valido' : null),
      soltar: (obj) => {
        this.quitarAgarrable(ag);
        if (dxz(obj.position, TRABAJO) < 0.2 && !this.trabajo) {
          caja.estado = 'trabajo';
          this.trabajo = caja;
          this.anim.mover(caja.grupo, TRABAJO.clone(), 0.25);
          this.pista('abrir', 'Agarra la tapa con la pinza y jálala hacia arriba para abrir la caja.', TRABAJO);
        } else {
          caja.estado = 'pila';
          this.pila.push(caja);
          this.inter.agarrables.push(ag);
          this.reacomodarPila();
        }
      },
    };
    this.inter.agarrables.push(ag);
  }

  protected abrirCaja(caja: CajaD): void {
    caja.estado = 'abierta';
    caja.armada.tapa.visible = false;
    caja.armada.solapas.visible = true;
    sonidos.pop();
    this.pintarMinis(caja);
    this.pista('sacar', 'Mete la mano en la caja, ciérrala y saca un objeto para revisarlo.', TRABAJO);
  }

  /** Los objetos que se asoman dentro de la caja abierta. */
  protected pintarMinis(caja: CajaD): void {
    caja.minis.forEach((m) => m.removeFromParent());
    caja.minis = caja.objetos.slice(0, 4).map((o, i) => {
      const mini = new Objeto(o.cat, false, o.sub).grupo;
      // Encima del relleno de papel de la caja (arriba a 4,8 cm), sin atravesar nada.
      mini.position.set(-0.07 + (i % 2) * 0.12, ENCIMA_RELLENO, -0.04 + Math.floor(i / 2) * 0.08);
      mini.scale.setScalar(1.25);
      caja.grupo.add(mini);
      return mini;
    });
  }

  // ---- Objetos sueltos -----------------------------------------------

  protected nuevoObjeto(cat: IdCategoria, danado: boolean, origen: 'caja' | 'repisa', sub?: number): ObjetoJuego {
    const o = new Objeto(cat, danado, sub);
    this.escena.sobre.add(o.grupo);
    const oj: ObjetoJuego = { o, origen, ag: null as unknown as Agarrable };
    oj.ag = {
      obj: o.grupo,
      activo: () => this.fase === 'jornada' && !o.clasificado,
      tomar: () => o.grupo,
      destino: () => this.destinoObjeto(oj),
      soltar: () => this.soltarObjeto(oj),
      contornoDe: () => o.contorno,
      reposo: () => o.reposo(),
    };
    this.inter.agarrables.push(oj.ag);
    this.sueltos.push(oj);
    return oj;
  }

  protected quitarObjeto(oj: ObjetoJuego): void {
    this.quitarAgarrable(oj.ag);
    this.sueltos = this.sueltos.filter((s) => s !== oj);
    if (this.actual === oj) {
      this.actual = null;
    }
    this.anim.cancelar(oj.o.grupo);
    oj.o.grupo.removeFromParent();
  }

  protected quitarAgarrable(ag: Agarrable): void {
    const i = this.inter.agarrables.indexOf(ag);
    if (i >= 0) {
      this.inter.agarrables.splice(i, 1);
    }
  }

  protected registrarAgarrables(): void {
    const e = this.escena;
    // La tapa de la caja de trabajo: se jala para abrirla.
    let tapaInicio = new Vector3();
    const tapa: Agarrable = {
      obj: new Group(),
      activo: () => this.fase === 'jornada' && this.trabajo?.estado === 'trabajo',
      tomar: () => {
        const t = this.trabajo!.armada.tapa;
        e.sobre.attach(t);
        tapaInicio = t.position.clone();
        return t;
      },
      destino: (obj) => (obj.position.distanceTo(tapaInicio) > 0.05 ? 'valido' : null),
      soltar: (obj) => {
        const caja = this.trabajo;
        if (!caja) {
          return;
        }
        const abrir = obj.position.distanceTo(tapaInicio) > 0.05;
        caja.grupo.attach(obj);
        obj.position.set(0, 0, 0);
        obj.rotation.set(0, 0, 0);
        obj.scale.setScalar(1);
        if (abrir) {
          this.abrirCaja(caja);
        }
      },
    };
    Object.defineProperty(tapa, 'obj', { get: () => this.trabajo?.armada.tapa ?? e.sobre });
    this.inter.agarrables.push(tapa);

    // La caja abierta: cada vez que se cierra la pinza adentro sale un objeto.
    const abierta: Agarrable = {
      obj: new Group(),
      palmaLibre: true,
      // La pinza entra por arriba de la caja abierta: un poco más de alcance, y
      // le gana a la estantería que está detrás.
      alcance: 0.07,
      prioridad: 2,
      activo: () => this.fase === 'jornada' && this.trabajo?.estado === 'abierta' && this.trabajo.objetos.length > 0,
      tomar: (mano) => {
        const caja = this.trabajo!;
        const dato = caja.objetos.shift()!;
        this.pintarMinis(caja);
        const oj = this.nuevoObjeto(dato.cat, dato.danado, 'caja', dato.sub);
        oj.o.grupo.position.copy(e.sobre.worldToLocal(this.v.copy(mano.agarre)));
        this.actual = oj;
        this.explicarManual();
        if (dato.danado) {
          this.pista('danado', 'Ese tiene contorno rojo: está dañado. No se entrega: va a la caneca de descarte.', CANECA);
        }
        return oj.o.grupo;
      },
      destino: (obj) => this.destinoObjeto(this.deGrupo(obj)),
      soltar: (obj) => this.soltarObjeto(this.deGrupo(obj)),
      contornoDe: (obj) => this.deGrupo(obj)?.o.contorno ?? null,
      reposo: (obj) => {
        const oj = this.deGrupo(obj);
        if (oj) {
          oj.o.reposo();
        } else {
          this.inter.contornoDe({ ag: abierta, obj }).poner(null);
        }
      },
    };
    Object.defineProperty(abierta, 'obj', { get: () => this.trabajo?.grupo ?? e.sobre });
    this.inter.agarrables.push(abierta);

    // Cada fila de la repisa: se saca el último objeto (−1).
    CATEGORIAS.forEach((cat, i) => {
      const zona = e.repisa.zonas[i];
      const resalte = { poner: (c: string | null) => e.repisa.marcar(i, c) };
      const fila: Agarrable = {
        obj: zona,
        // Hay que meter la pinza bien adentro del compartimiento (no basta con
        // acercarla) y lo demás le gana (la caja, los objetos sueltos).
        alcance: 0.008,
        prioridad: 0,
        contiene: (p) => e.repisa.dentroDeZona(i, p, 0.015),
        activo: () => this.fase === 'jornada' && e.repisa.cantidades[i] > 0,
        tomar: (mano) => {
          // Del producto (columna) donde está la mano.
          const sub = e.repisa.productoEn(i, e.repisa.grupo.worldToLocal(this.w.copy(mano.agarre)));
          const r = this.repisaQuitar(i, sub);
          if (!r) {
            return null;
          }
          const oj = this.nuevoObjeto(cat.id, r.danado, 'repisa', r.sub);
          oj.o.grupo.position.copy(e.sobre.worldToLocal(this.v.copy(mano.agarre)));
          return oj.o.grupo;
        },
        destino: (obj) => this.destinoObjeto(this.deGrupo(obj)),
        soltar: (obj) => this.soltarObjeto(this.deGrupo(obj)),
        contornoDe: (obj) => (obj === zona ? resalte : (this.deGrupo(obj)?.o.contorno ?? null)),
        reposo: (obj) => (obj === zona ? e.repisa.marcar(i, null) : this.deGrupo(obj)?.o.reposo()),
      };
      this.inter.agarrables.push(fila);
    });

    // La caja del pedido: se lleva al camión.
    const pedido: Agarrable = {
      obj: this.cajaPedido.raiz,
      activo: () => this.fase === 'jornada' && !this.cajaEnCamion && this.camion === 'listo' && !!this.enCurso(),
      tomar: () => this.cajaPedido.raiz,
      // Verde si está completa; roja si le falta algo (no entra al camión).
      destino: (obj) => (this.cercaDelCamion(obj) ? (this.pedidoCompleto() ? 'valido' : 'invalido') : null),
      soltar: (obj) => {
        if (this.cercaDelCamion(obj) && !this.pedidoCompleto()) {
          // Incompleta: rebota y vuelve a su lugar en la mesa.
          sonidos.error();
          const p = this.enCurso();
          const falta = p ? faltantes(p, nombreProducto) : [];
          this.gato.decir(falta.length ? `Todavía falta: ${falta.join(', ')}. La caja vuelve a la mesa.` : 'Primero acepta un pedido.');
          this.v.copy(obj.position).setY(obj.position.y + 0.12);
          this.anim.mover(obj, this.v.clone(), 0.18, {
            fin: () => this.anim.mover(obj, PEDIDO.clone(), 0.45, { arco: 0.1 }),
          });
          return;
        }
        if (this.cercaDelCamion(obj)) {
          this.cajaEnCamion = true;
          this.cargando = true;
          // Entra por las puertas traseras ya cerrada (con su tapa): primero a la
          // entrada (alineada con el camión y más pequeña para caber) y después
          // adentro, sin atravesar el furgón.
          obj.quaternion.copy(e.camion.quaternion);
          this.cajaPedido.solapas.visible = false;
          this.cajaPedido.tapa.visible = true;
          this.anim.mover(obj, e.entradaCamion(this.w).clone().setY(this.w.y + 0.01), 0.25, {
            escala: ESCALA_CAJA_CAMION,
            fin: () =>
              this.anim.mover(obj, e.plataforma(this.w).clone().setY(this.w.y + 0.004), 0.35, {
                fin: () => {
                  e.camion.attach(obj);
                  this.cargando = false;
                },
              }),
          });
          this.pista('despachar', '¡Caja en el camión! Ahora empuja el botón rojo "Despachar".', e.botonDespacho.grupo.position);
        } else {
          this.anim.mover(obj, PEDIDO.clone(), 0.3, { arco: 0.05 });
        }
      },
    };
    this.inter.agarrables.push(pedido);
  }

  /** ¿El pedido en curso ya tiene todo? */
  protected pedidoCompleto(): boolean {
    const p = this.enCurso();
    return !!p && completo(p);
  }

  /** ¿La caja del pedido está en la puerta trasera del camión? */
  protected cercaDelCamion(obj: Object3D): boolean {
    const e = this.escena;
    return dxz(obj.position, e.entradaCamion(this.w)) < 0.18 || dxz(obj.position, e.plataforma(this.w)) < 0.12;
  }

  protected deGrupo(obj: Object3D): ObjetoJuego {
    return this.sueltos.find((s) => s.o.grupo === obj)!;
  }

  /** Mientras se lleva un objeto: ¿dónde se soltaría? */
  protected destinoObjeto(oj: ObjetoJuego | undefined): Destino {
    if (!oj) {
      return null;
    }
    const e = this.escena;
    const p = oj.o.grupo.position;
    let marca = -1;
    let resultado: Destino = null;
    if (this.conCaneca && dxz(p, CANECA) < 0.1 && p.y < 0.28) {
      resultado = 'valido';
    } else if (this.sobreCajaPedido(p)) {
      const ped = this.enCurso();
      const id = idProducto(oj.o.cat, oj.o.sub);
      resultado = ped && (ped.pide[id] ?? 0) > (ped.lleva[id] ?? 0) ? 'valido' : 'invalido';
    } else {
      const k = e.repisa.categoriaEn(e.repisa.grupo.worldToLocal(e.sobre.localToWorld(this.v.copy(p))));
      if (k >= 0) {
        marca = k;
        // Rojo si no es su fila, si la fila está llena o si está dañado (no entra).
        resultado = k === indiceCategoria(oj.o.cat) && !e.repisa.lleno(k) && !oj.o.danado ? 'valido' : 'invalido';
      }
    }
    if (marca !== this.zonaMarcada) {
      if (this.zonaMarcada >= 0) {
        e.repisa.marcar(this.zonaMarcada, null);
      }
      this.zonaMarcada = marca;
    }
    if (marca >= 0) {
      e.repisa.marcar(marca, resultado === 'valido' ? COLOR.verde : COLOR.rojo);
    }
    return resultado;
  }

  protected sobreCajaPedido(p: Vector3): boolean {
    return !this.cajaEnCamion && dxz(p, PEDIDO) < 0.13 && p.y < 0.3;
  }

  /** Al soltar un objeto: caneca, fila de la repisa, caja del pedido o cae. */
  protected soltarObjeto(oj: ObjetoJuego | undefined): void {
    if (!oj) {
      return;
    }
    const e = this.escena;
    if (this.zonaMarcada >= 0) {
      e.repisa.marcar(this.zonaMarcada, null);
      this.zonaMarcada = -1;
    }
    const p = oj.o.grupo.position;
    if (this.conCaneca && dxz(p, CANECA) < 0.1 && p.y < 0.28) {
      this.aCaneca(oj);
      return;
    }
    if (this.sobreCajaPedido(p)) {
      this.aPedido(oj);
      return;
    }
    const k = e.repisa.categoriaEn(e.repisa.grupo.worldToLocal(e.sobre.localToWorld(this.v.copy(p))));
    if (k >= 0) {
      if (k !== indiceCategoria(oj.o.cat)) {
        sonidos.error();
        this.gato.decir(`${nombre(oj.o.cat)} no va en ${CATEGORIAS[k].corto}: va en su propia fila.`);
        this.devolver(oj);
      } else if (oj.o.danado) {
        // Lo dañado no entra a la estantería: rebota a la mesa.
        if (oj.origen === 'caja') {
          this.cuenta.errores++;
          this.cuenta.puntos -= 5;
        }
        this.gato.animar('triste', 2, this.tiempo);
        this.gato.decir('Eso está dañado (contorno rojo): no entra a la estantería. Llévalo a la caneca de descarte.');
        this.rebotar(oj);
      } else {
        this.aRepisa(oj);
      }
      return;
    }
    // Ningún puesto: cae a la mesa (o al piso, y vuelve a su sitio).
    this.inter.caer(oj.o.grupo, () => {
      if (oj.o.grupo.position.y < -0.05) {
        this.devolver(oj);
      }
    });
  }

  /** Rebota a la mesa, junto a la caja de trabajo (sigue en juego: se puede volver a agarrar). */
  protected rebotar(oj: ObjetoJuego): void {
    sonidos.error();
    oj.o.contorno.poner(COLOR.rojo);
    const casa = new Vector3(TRABAJO.x + 0.17, 0, TRABAJO.z + 0.03);
    this.anim.mover(oj.o.grupo, casa, 0.5, { arco: 0.14, fin: () => oj.o.reposo() });
  }

  /** Rebota: lo que salió de la repisa vuelve a ella; lo de la caja, junto a la caja. */
  protected devolver(oj: ObjetoJuego): void {
    if (oj.origen === 'repisa') {
      const i = indiceCategoria(oj.o.cat);
      this.alPuesto(oj, i, () => this.repisaAgregar(i, oj.o.danado, oj.o.sub));
    } else {
      const casa = new Vector3(TRABAJO.x + 0.16, 0, TRABAJO.z + 0.06);
      this.anim.mover(oj.o.grupo, casa, 0.4, { arco: 0.08 });
    }
  }

  /** Anima el objeto hasta el siguiente puesto libre de su fila y lo quita. */
  protected alPuesto(oj: ObjetoJuego, i: number, alFinal: () => void): void {
    const e = this.escena;
    oj.o.clasificado = true;
    this.quitarAgarrable(oj.ag);
    e.repisa.siguientePuesto(i, oj.o.sub, this.w);
    const destino = e.sobre.worldToLocal(e.repisa.grupo.localToWorld(this.w)).clone();
    oj.o.grupo.rotation.set(0, 0, 0);
    this.anim.mover(oj.o.grupo, destino, 0.3, {
      escala: e.repisa.escalaDe(i, oj.o.sub) * e.repisa.grupo.scale.x,
      fin: () => {
        alFinal();
        this.quitarObjeto(oj);
      },
    });
  }

  /** Pone un objeto en su fila (en multijugador, también en la del compañero). */
  protected repisaAgregar(i: number, danado: boolean, sub = -1): boolean {
    return this.escena.repisa.agregar(i, danado, sub);
  }

  protected repisaQuitar(i: number, sub = -1): { danado: boolean; sub: number } | null {
    return this.escena.repisa.quitar(i, sub);
  }

  /** ¿La fila está llena? */
  protected filaLlena(i: number): boolean {
    return this.escena.repisa.lleno(i);
  }

  protected aRepisa(oj: ObjetoJuego): void {
    const e = this.escena;
    const i = indiceCategoria(oj.o.cat);
    if (this.filaLlena(i)) {
      this.rechazar(oj);
      return;
    }
    if (oj.origen === 'caja') {
      if (oj.o.danado) {
        this.cuenta.errores++;
        this.cuenta.puntos -= 15;
        this.gato.animar('triste', 2, this.tiempo);
        this.gato.decir('¡Ojo! Eso estaba dañado y quedó en la repisa. Si sale en un pedido, habrá una queja.');
      } else {
        this.cuenta.puntos += 5;
      }
    }
    sonidos.acierto();
    this.alPuesto(oj, i, () => this.repisaAgregar(i, oj.o.danado, oj.o.sub));
  }

  protected aCaneca(oj: ObjetoJuego): void {
    oj.o.clasificado = true;
    this.quitarAgarrable(oj.ag);
    if (oj.o.danado) {
      this.cuenta.puntos += 5;
      sonidos.acierto();
    } else {
      this.cuenta.errores++;
      this.cuenta.puntos -= 10;
      sonidos.error();
      this.gato.decir(`Eso (${nombre(oj.o.cat).toLowerCase()}) estaba en buen estado. Lo útil no se bota.`);
    }
    this.v.set(CANECA.x, 0.03, CANECA.z);
    this.anim.mover(oj.o.grupo, this.v.clone(), 0.3, { arco: 0.06, escala: 0.4, fin: () => this.quitarObjeto(oj) });
  }

  /** La fila está llena: la donación no se puede recibir. */
  protected rechazar(oj: ObjetoJuego): void {
    oj.o.clasificado = true;
    this.quitarAgarrable(oj.ag);
    oj.o.contorno.poner(COLOR.rojo);
    sonidos.error();
    if (oj.origen === 'caja') {
      this.cuenta.rechazadas++;
    }
    this.escena.panel.avisar(`Categoría llena: no se puede recibir (${nombre(oj.o.cat)})`, this.tiempo);
    this.gato.decir(`La fila de ${nombre(oj.o.cat).toLowerCase()} ya tiene 30: no entra más. La donación se rechaza.`);
    this.vistas.add('lleno');
    // Rebota fuera de la estantería (no entra) y después se va.
    const g = oj.o.grupo;
    const fuera = new Vector3(TRABAJO.x + 0.17, 0, TRABAJO.z + 0.03);
    this.anim.mover(g, fuera, 0.5, {
      arco: 0.14,
      fin: () => {
        this.v.copy(g.position).setY(g.position.y + 0.2);
        this.anim.mover(g, this.v.clone(), 0.7, { escala: 0.02, fin: () => this.quitarObjeto(oj) });
      },
    });
  }

  // ---- Pedido: caja, camión y despacho ------------------------------

  protected enCurso(): Pedido | undefined {
    return this.pedidos.find((p) => p.estado === 'curso');
  }

  protected armarCajaPedido(): void {
    this.cajaPedido = crearCaja(true);
    this.cajaPedido.solapas.visible = true;
    this.cajaPedido.tapa.visible = false;
    sinContorno(this.cajaPedido.raiz);
    this.cajaPedido.raiz.scale.setScalar(ESCALA_CAJA);
    this.cajaPedido.raiz.position.copy(PEDIDO);
    this.escena.sobre.add(this.cajaPedido.raiz);
    this.baseCamion.copy(this.escena.camion.position);
  }

  protected vaciarCajaPedido(): void {
    const caja = this.cajaPedido.raiz;
    this.minisPedido.forEach((m) => m.removeFromParent());
    this.minisPedido = [];
    this.escena.sobre.attach(caja);
    this.anim.cancelar(caja);
    caja.position.copy(PEDIDO);
    caja.rotation.set(0, 0, 0);
    caja.scale.setScalar(ESCALA_CAJA);
    caja.visible = true;
    this.cajaPedido.solapas.visible = true;
    this.cajaPedido.tapa.visible = false;
    this.cajaEnCamion = false;
    this.cargando = false;
  }

  protected aPedido(oj: ObjetoJuego): void {
    const p = this.enCurso();
    const cat = oj.o.cat;
    const id = idProducto(cat, oj.o.sub);
    if (!p || (p.pide[id] ?? 0) <= (p.lleva[id] ?? 0)) {
      sonidos.error();
      this.gato.decir(
        p
          ? `El pedido de ${p.municipio} no necesita ${nombreProducto(id).toLowerCase()}. Pide: ${textoPedido(p, false)}.`
          : 'Primero acepta un pedido en la pantalla.',
      );
      this.devolver(oj);
      return;
    }
    oj.o.clasificado = true;
    this.quitarAgarrable(oj.ag);
    p.lleva[id] = (p.lleva[id] ?? 0) + 1;
    if (oj.o.danado) {
      (p as Pedido & { quejas?: number }).quejas = ((p as Pedido & { quejas?: number }).quejas ?? 0) + 1;
    }
    sonidos.acierto();
    const n = this.minisPedido.length;
    this.v.set(PEDIDO.x, 0.03, PEDIDO.z);
    this.anim.mover(oj.o.grupo, this.v.clone(), 0.25, {
      escala: 0.6,
      fin: () => {
        this.quitarObjeto(oj);
        const mini = new Objeto(cat, oj.o.danado, oj.o.sub).grupo;
        mini.children.forEach((c) => {
          if (c.userData.mirar) {
            c.visible = false;
          }
        });
        mini.position.set(-0.08 + (n % 4) * 0.055, ENCIMA_RELLENO + Math.floor(n / 8) * 0.04, -0.045 + (Math.floor(n / 4) % 2) * 0.08);
        mini.scale.setScalar(1.1);
        this.cajaPedido.raiz.add(mini);
        this.minisPedido.push(mini);
      },
    });
    if (completo(p)) {
      this.gato.decir(`¡Pedido de ${p.municipio} completo! Lleva la caja al camión y empuja "Despachar".`);
      this.pista('camion', 'Agarra la caja del pedido con la pinza y ponla en la parte de atrás del camión.', this.escena.camion.position);
    }
  }

  /** Por qué no se puede despachar todavía (null: sí se puede). */
  protected bloqueoDespacho(): string | null {
    const p = this.enCurso();
    if (this.camion !== 'listo') {
      return 'El camión está en ruta';
    }
    if (!p) {
      return this.pedidos.some((x) => x.estado === 'elegir') ? 'Elige el municipio en la pantalla' : 'No hay pedido en curso';
    }
    const falta = faltantes(p, nombreProducto);
    if (falta.length) {
      return `Falta: ${falta.join(', ')}`;
    }
    if (!this.cajaEnCamion) {
      return 'Pon la caja en el camión';
    }
    return null;
  }

  protected despachar(): void {
    const p = this.enCurso();
    if (!p || this.bloqueoDespacho()) {
      return;
    }
    const c = this.cuenta;
    const quejas = (p as Pedido & { quejas?: number }).quejas ?? 0;
    p.estado = 'entregado';
    c.familias += p.familias;
    c.quejas += quejas;
    c.puntos -= quejas * 20;
    if (p.tarde) {
      c.tarde++;
      c.puntos += 40;
    } else {
      c.aTiempo++;
      c.puntos += 100;
    }
    const aviso = this.avisos.find((a) => a.pedido === p);
    if (aviso) {
      this.resolver(aviso);
    }
    const nuevo = this.avisar({
      tipo: 'entrega',
      texto: `Entregado ✓ en ${p.municipio}: ${p.familias} familias ayudadas${p.tarde ? ' (tarde)' : ''}`,
      accion: null,
    });
    this.resolver(nuevo);
    nuevo.hechoEn = this.tiempo + 3;
    sonidos.camion();
    if (this.cajaInfinita) {
      // Al sacar la caja aparece otra vacía en su lugar; el camión lleva una copia.
      const caja = this.cajaPedido.raiz;
      this.copiaCaja = caja.clone(true);
      this.escena.camion.add(this.copiaCaja);
      this.vaciarCajaPedido();
      caja.scale.setScalar(0.02);
      this.anim.mover(caja, null, 0.4, { escala: ESCALA_CAJA });
    }
    this.camion = 'yendo';
    this.tCamion = 0;
    this.gato.animar(quejas ? 'triste' : 'feliz', 2.5, this.tiempo);
    this.gato.decir(
      quejas
        ? `El camión salió, pero llevaba ${quejas} cosa${quejas > 1 ? 's' : ''} dañada${quejas > 1 ? 's' : ''}: habrá una queja.`
        : p.tarde
          ? `Llegó tarde a ${p.municipio}, pero llegó. ¡A seguir!`
          : `¡A tiempo! ${p.municipio} recibe su donación.`,
    );
  }

  protected moverCamion(dt: number): void {
    const camion = this.escena.camion;
    this.tCamion += dt;
    if (this.camion === 'yendo') {
      const k = Math.min(1, this.tCamion / 2.4);
      camion.position.set(this.baseCamion.x, this.baseCamion.y, this.baseCamion.z - 1.1 * k * k);
      camion.scale.setScalar(0.75 * (1 - 0.85 * k));
      if (k >= 1) {
        this.camion = 'fuera';
        this.tCamion = 0;
        camion.visible = false;
      }
    } else if (this.camion === 'fuera' && this.tCamion > 4) {
      camion.position.copy(this.baseCamion);
      if (this.copiaCaja) {
        this.copiaCaja.removeFromParent();
        this.copiaCaja = null;
      } else {
        this.vaciarCajaPedido();
        const caja = this.cajaPedido.raiz;
        caja.scale.setScalar(0.02);
        this.anim.mover(caja, null, 0.4, { escala: ESCALA_CAJA });
      }
      camion.visible = true;
      camion.scale.setScalar(0.02);
      this.camion = 'volviendo';
      this.tCamion = 0;
      this.anim.mover(camion, null, 0.6, { escala: 0.75 });
    } else if (this.camion === 'volviendo' && this.tCamion > 0.7) {
      this.camion = 'listo';
    }
  }

  protected avanzarPedidos(dt: number): void {
    for (const p of this.pedidos) {
      if (p.estado !== 'curso' && p.estado !== 'elegir') {
        continue;
      }
      const antes = p.restante;
      p.restante -= dt;
      if (antes > 0 && p.restante <= 0) {
        // Se acabó el reloj: pasa a URGENTE y el municipio empeora.
        p.tarde = true;
        sonidos.error();
        this.avisar({
          tipo: 'alerta',
          texto: `URGENTE · ${p.municipio} sigue esperando: la situación empeora`,
          accion: 'Entendido',
        });
        this.gato.senalar(this.puntoMundo(this.puntoPanel()), 3, this.tiempo);
        this.gato.decir(`¡Se acabó el tiempo de ${p.municipio}! Ya llega tarde: despáchalo cuanto antes.`);
      }
    }
  }

  // ---- Botones -------------------------------------------------------

  protected conectarBotones(): void {
    const e = this.escena;
    const panel = e.panel;
    panel.alAccion = (aviso) => this.accionAviso(aviso);
    panel.alMunicipio = (municipio) => {
      const p = panel.eligiendo;
      if (!p) {
        return;
      }
      if (municipio !== p.municipio) {
        sonidos.error();
        panel.avisar(`Ese pedido es para ${p.municipio}`, this.tiempo);
        return;
      }
      p.estado = 'curso';
      const aviso = this.avisos.find((x) => x.pedido === p);
      if (aviso) {
        aviso.accion = null; // ya tiene destino: solo muestra su reloj
      }
      panel.verAvisos();
      sonidos.logro();
      this.gato.decir(`Destino: ${p.municipio}. Saca de la repisa ${textoPedido(p, false)} y ponlo en la caja del pedido.`);
      this.pista('armar', 'Haz la pinza sobre un producto de la estantería para sacarlo y suéltalo en la caja del pedido.', PEDIDO);
    };
    panel.mover.alPresionar = () => {
      if (this.fase !== 'jornada') {
        return;
      }
      this.fase = 'colocar';
      this.inter.soltarTodo();
      this.ancla.soltar();
      e.sobre.visible = false;
      this.mostrarInicio();
      this.gato.decir('Párate donde quieras la oficina, mira al frente y empuja "Colocar aquí".');
    };
    panel.recalibrar.alPresionar = () => this.recalibrar();
    panel.saltar.alPresionar = () => {
      this.tutorial = false;
      panel.saltar.activo = false;
      e.flecha.visible = false;
      this.gato.decir('Listo, sin tutorial. ¡Tú puedes!');
    };
    e.botonDespacho.alPresionar = () => this.despachar();
    e.botonDespacho.alBloqueado = () => {
      const motivo = this.bloqueoDespacho();
      if (motivo) {
        this.gato.decir(`Todavía no se puede despachar. ${motivo}.`);
      }
    };
    e.siguiente.alPresionar = () => {
      this.inter.pausarBotones();
      if (this.fase === 'resumen' && this.dia < JORNADAS.length - 1) {
        this.dia++;
        this.empezarJornada();
      } else if (this.fase === 'semana') {
        this.volverAlInicio();
      }
    };
    e.finalizar.alPresionar = () => {
      this.inter.pausarBotones();
      if (this.fase === 'resumen') {
        this.verSemana();
      }
    };
  }

  protected accionAviso(aviso: Aviso): void {
    const panel = this.escena.panel;
    if (aviso.tipo === 'cajas') {
      this.resolver(aviso);
      this.cola += aviso.cajas ?? 0;
      this.tCola = 1;
      return;
    }
    if (aviso.tipo === 'alerta') {
      this.resolver(aviso);
      return;
    }
    const p = aviso.pedido;
    if (!p) {
      return;
    }
    if (p.estado === 'elegir') {
      panel.elegirMunicipio(p);
      return;
    }
    const otro = this.pedidos.find((x) => x !== p && (x.estado === 'curso' || x.estado === 'elegir'));
    if (otro) {
      sonidos.error();
      panel.avisar(`Termina primero el pedido de ${otro.municipio}`, this.tiempo);
      return;
    }
    p.estado = 'elegir';
    p.restante = p.plazo;
    aviso.accion = 'Elegir destino';
    panel.elegirMunicipio(p);
    this.pista('municipio', 'Busca el municipio del pedido en la lista y empújalo con el índice.', this.puntoPanel());
  }

  // ---- Tutorial ------------------------------------------------------

  protected pista(clave: string, texto: string, objetivo: Vector3 | null): void {
    if (!this.tutorial || this.vistas.has(clave)) {
      return;
    }
    this.vistas.add(clave);
    this.gato.decir(texto, 'Tutorial');
    if (objetivo) {
      this.flechaEn.copy(objetivo);
      this.flechaHasta = this.tiempo + 14;
      this.escena.flecha.visible = true;
    }
  }

  /** La clasificación es a mano: el gato lo explica la primera vez (con o sin tutorial). */
  protected explicarManual(): void {
    if (!this.conCaneca || this.vistas.has('manual')) {
      return;
    }
    this.vistas.add('manual');
    this.gato.decir(
      'Revísalo tú. Si está en buen estado, llévalo con la mano a su fila de la estantería. Si está dañado (contorno rojo), llévalo a la caneca de descarte.',
      'Clasifica a mano',
    );
    this.flechaEn.set(CANECA.x, 0.05, CANECA.z);
    this.flechaHasta = this.tiempo + 8;
    this.escena.flecha.visible = this.tutorial;
  }

  protected puntoPanel(): Vector3 {
    return this.escena.panel.grupo.position.clone().setY(this.escena.panel.grupo.position.y + 0.04);
  }

  protected puntoMundo(local: Vector3): Vector3 {
    return this.escena.sobre.localToWorld(local.clone());
  }

  // ---- Resúmenes -----------------------------------------------------

  protected get cuenta(): Cuenta {
    return (this.cuentas[this.dia] ??= cuentaNueva());
  }

  /** De vuelta al inicio, donde está el gato con "Colocar aquí" (sin repetir el tutorial). */
  protected volverAlInicio(): void {
    this.reiniciar();
    this.tutorial = false;
  }

  protected modoResumen(): 'dia' | 'viernes' {
    return this.dia < JORNADAS.length - 1 ? 'dia' : 'viernes';
  }

  protected terminarJornada(): void {
    const c = this.cuenta;
    for (const p of this.pedidos) {
      if (p.estado !== 'entregado') {
        c.sinEntregar++;
      }
    }
    c.estrellas = estrellasDe(c);
    this.inter.soltarTodo();
    this.fase = 'resumen';
    sonidos.fin();
    this.escena.flecha.visible = false;
    this.pintarResumenDia();
    this.escena.mostrarResumen(true);
    this.escena.botonesResumen(this.modoResumen());
    this.gato.animar('aplaudir', 2.5, this.tiempo);
    this.gato.decir(`¡Terminó el ${DIAS[this.dia].toLowerCase()}! Mira cómo te fue.`);
  }

  protected estrellas(ctx: CanvasRenderingContext2D, n: number, x: number, y: number, r: number): void {
    for (let i = 0; i < 3; i++) {
      ctx.fillStyle = i < n ? '#F2B84B' : '#D8D2C8';
      ctx.beginPath();
      for (let k = 0; k < 10; k++) {
        const a = -Math.PI / 2 + (k * Math.PI) / 5;
        const rr = k % 2 ? r * 0.45 : r;
        ctx.lineTo(x + i * r * 2.3 + Math.cos(a) * rr, y + Math.sin(a) * rr);
      }
      ctx.fill();
    }
  }

  protected filasResumen(c: Cuenta): [string, string][] {
    return [
      ['Pedidos entregados a tiempo', `${c.aTiempo} / ${c.pedidos}`],
      ['Entregados tarde', String(c.tarde)],
      ['Sin entregar', String(c.sinEntregar)],
      ['Donaciones rechazadas (categoría llena)', String(c.rechazadas)],
      ['Cajas perdidas (pila llena)', String(c.perdidas)],
      ['Errores de clasificación', String(c.errores)],
      ['Quejas por objetos dañados', String(c.quejas)],
      ['Familias ayudadas', String(c.familias)],
      ['Puntos', String(c.puntos)],
    ];
  }

  protected pintarResumenDia(c: Cuenta = this.cuenta, titulo?: string): void {
    const l = this.escena.lienzoResumen;
    const { ctx } = l;
    fondoPanel(l);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = COLOR.rojo;
    ctx.font = `900 64px ${FUENTE}`;
    ctx.fillText(titulo ?? `${DIAS[this.dia]} · Resumen de la jornada`, l.ancho / 2, 92);
    this.estrellas(ctx, c.estrellas, l.ancho / 2 - 92, 160, 40);
    const filas = this.filasResumen(c);
    filas.forEach(([rotulo, valor], i) => {
      const y = 262 + i * 56;
      ctx.textAlign = 'left';
      ctx.fillStyle = COLOR.carbon;
      ctx.font = `400 38px ${FUENTE}`;
      ctx.fillText(rotulo, 90, y);
      ctx.textAlign = 'right';
      ctx.fillStyle = COLOR.azul;
      ctx.font = `700 40px ${FUENTE}`;
      ctx.fillText(valor, l.ancho - 90, y);
    });
    l.listo();
  }

  protected verSemana(): void {
    this.fase = 'semana';
    const l = this.escena.lienzoResumen;
    const { ctx } = l;
    fondoPanel(l);
    ctx.textAlign = 'center';
    ctx.fillStyle = COLOR.rojo;
    ctx.font = `900 66px ${FUENTE}`;
    ctx.fillText('Resumen total', l.ancho / 2, 90);
    // Una columna por día: L M M J V.
    const ancho = (l.ancho - 160) / 5;
    let familias = 0;
    let puntos = 0;
    this.cuentas.forEach((c, i) => {
      familias += c.familias;
      puntos += c.puntos;
      const x = 80 + ancho * i;
      ctx.fillStyle = i % 2 ? '#F3E9D8' : '#FBF2E2';
      rect(ctx, x + 6, 125, ancho - 12, 300, 24);
      ctx.fill();
      ctx.fillStyle = COLOR.azul;
      ctx.textAlign = 'center';
      ctx.font = `900 48px ${FUENTE}`;
      ctx.fillText(DIAS[i].charAt(0), x + ancho / 2, 185);
      this.estrellas(ctx, c.estrellas, x + ancho / 2 - 37, 235, 16);
      ctx.font = `400 28px ${FUENTE}`;
      ctx.fillStyle = COLOR.carbon;
      ctx.fillText(`${c.aTiempo}/${c.pedidos} a tiempo`, x + ancho / 2, 300);
      ctx.fillText(`${c.familias} familias`, x + ancho / 2, 345);
      ctx.fillText(`${c.puntos} pts`, x + ancho / 2, 390);
    });
    ctx.fillStyle = COLOR.verde;
    ctx.font = `900 50px ${FUENTE}`;
    ctx.fillText(`${familias} familias ayudadas · ${puntos} puntos`, l.ancho / 2, 500);
    ctx.fillStyle = COLOR.azul;
    ctx.font = `400 33px ${FUENTE}`;
    lineas(ctx, MENSAJE_FINAL, l.ancho - 180).forEach((t, i) => ctx.fillText(t, l.ancho / 2, 570 + i * 44));
    l.listo();
    this.escena.botonesResumen('total');
    this.escena.mostrarResumen(true);
    sonidos.logro();
    // El gato se queda en su puesto, a un lado del tablero.
    this.anim.mover(this.gato.objeto, this.escena.puestoGato(this.v).clone(), 0.7, { arco: 0.12, escala: ESCALA_GATO });
    this.gato.animar('saludar', 4, this.tiempo);
    this.gato.decir(
      'Así se gestiona una donación: se recibe, se revisa, se ordena y se despacha a quien la necesita. ¡Gracias por tu semana!',
      this.cuentas.length >= JORNADAS.length ? '¡Semana cumplida!' : '¡Buen trabajo!',
    );
  }

  // ---- Cada cuadro ---------------------------------------------------

  /**
   * Cada cuadro, protegido: si algo falla, la escena sigue dibujándose (no
   * se congela la sesión de RA) y el gato muestra el error para poder
   * reportarlo desde las gafas.
   */
  update(delta: number): void {
    try {
      this.cuadro(delta);
    } catch (e) {
      this.reportarError(e);
    }
  }

  private erroresVistos = new Set<string>();

  protected reportarError(e: unknown): void {
    const texto = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
    if (this.erroresVistos.has(texto)) {
      return;
    }
    this.erroresVistos.add(texto);
    console.error('[CaliDa RA]', e);
    try {
      this.gato.decir(texto.slice(0, 160), 'Error (toma una foto)');
    } catch {
      // Si ni el gato puede hablar, queda en la consola.
    }
  }

  protected cuadro(delta: number): void {
    const dt = Math.min(delta, 0.05);
    this.tiempo += dt;
    if (this.reinicioEn >= 0 && this.tiempo >= this.reinicioEn) {
      this.reinicioEn = -1;
      this.reiniciar();
    }
    this.leerCabeza();
    this.manos.actualizar(this.world.xrSession, this.world.xrFrame, this.world.xrReferenceSpace);
    this.oclusorManos.actualizar(this.manos.lista, this.cabeza, this.frente);
    this.ejemploPinza(dt);
    this.diagnostico?.actualizar(dt);
    const cuadro = this.world.xrFrame;
    const espacio = this.world.xrReferenceSpace;
    if (this.ancla.activa && cuadro && espacio) {
      this.ancla.seguir(cuadro, espacio, this.escena.raiz);
    }
    if ((this.fase === 'inicio' || this.fase === 'colocar') && this.inicio.visible) {
      this.sonda.actualizar(this.world.xrSession, cuadro, espacio, this.cabeza.y);
      this.buscarMesaReal(dt, cuadro, espacio);
      this.seguirMirada(dt);
    }

    if (this.fase === 'jornada') {
      this.jornada(dt);
    }
    const manosIWSDK = this.input.xr.visualAdapters.hand;
    this.oclusion.actualizar(dt, [manosIWSDK.left.visual?.model, manosIWSDK.right.visual?.model]);
    this.inter.actualizar(dt);
    if ((this.fase === 'inicio' || this.fase === 'colocar') && this.inicio.visible) {
      this.demoBoton.actualizar(dt);
    }
    this.anim.actualizar(dt);
    this.gato.actualizar(this.tiempo, this.cabeza);
    this.carteles(dt);
  }

  /** Segundos que la persona lleva sin nada que hacer. */
  protected tSinTareas = 0;
  protected extras = 0;
  /** Un jugador: sí. El multijugador maneja sus propias llegadas (donantes, pedidos). */
  protected generarExtras = true;

  /**
   * Nunca sin tareas: si no hay cajas, objetos, pedidos ni avisos pendientes
   * durante 6 s (y al día le quedan más de 35 s), llega una tarea nueva:
   * se alternan una caja y un encargo pequeño con productos que sí hay en la
   * estantería.
   */
  protected siempreConTareas(dt: number): void {
    const ocioso =
      this.cola === 0 &&
      this.pila.length === 0 &&
      !this.trabajo &&
      this.sueltos.every((x) => x.o.clasificado) &&
      this.pedidos.every((x) => x.estado === 'entregado' || x.estado === 'perdido') &&
      this.avisos.every((a) => a.estado === 'hecho');
    const quedan = JORNADAS[this.dia].duracion - this.tDia;
    if (!this.generarExtras || !ocioso || quedan < 35) {
      this.tSinTareas = 0;
      return;
    }
    this.tSinTareas += dt;
    if (this.tSinTareas < 6) {
      return;
    }
    this.tSinTareas = 0;
    this.extras++;
    // Encargo con algo que haya en la estantería; si no hay nada, una caja.
    const conStock = CATEGORIAS.map((c, i) => ({ id: c.id, n: this.escena.repisa.cantidades[i] })).filter((c) => c.n >= 2);
    if (this.extras % 2 === 0 && conStock.length > 0) {
      const c = conStock[this.extras % conStock.length];
      this.cuentas[this.dia].pedidos++;
      this.evento({
        tipo: 'pedido',
        en: this.tDia,
        municipio: MUNICIPIOS[(this.dia * 5 + this.extras * 7) % MUNICIPIOS.length],
        pide: { [c.id]: this.extras % 4 === 0 ? 2 : 1 },
        plazo: 70,
        familias: 2,
      });
    } else {
      this.evento({ tipo: 'cajas', en: this.tDia, cantidad: 1 });
    }
  }

  protected jornada(dt: number): void {
    this.avanzarReloj(dt);
    // Las cajas recibidas llegan de a una.
    if (this.cola > 0) {
      this.tCola += dt;
      if (this.tCola >= 1.6) {
        this.tCola = 0;
        this.cola--;
        this.nuevaCaja();
      }
    }
    // La caja abierta y vacía se va.
    const t = this.trabajo;
    if (t && t.estado === 'abierta' && t.objetos.length === 0) {
      t.estado = 'fin';
      this.trabajo = null;
      this.anim.mover(t.grupo, null, 0.35, { escala: 0.02, fin: () => t.grupo.removeFromParent() });
      if (this.pila.length) {
        this.pista('tomar', 'Caja vacía. Toma la siguiente de la pila.', PILA[0]);
      }
    }
    this.avanzarPedidos(dt);
    this.siempreConTareas(dt);
    this.moverCamion(dt);
    // Puertas traseras: se abren mientras se lleva la caja COMPLETA o mientras entra.
    const conCaja = [...this.manos.lista, this.inter.raton].some((m) => this.inter.lleva(m) === this.cajaPedido.raiz);
    this.escena.puertasCamion(this.camion === 'listo' && ((conCaja && this.pedidoCompleto()) || this.cargando), dt);
    // ¿Terminó la jornada?
    const eventos = JORNADAS[this.dia].eventos;
    const sinNada =
      this.siguienteEvento >= eventos.length &&
      this.cola === 0 &&
      this.pila.length === 0 &&
      !this.trabajo &&
      this.camion === 'listo' &&
      this.sueltos.every((s) => s.o.clasificado) &&
      this.pedidos.every((p) => p.estado === 'entregado') &&
      this.avisos.every((a) => a.estado === 'hecho');
    if (this.debeTerminar(sinNada)) {
      this.terminarJornada();
    }
  }

  protected avanzarReloj(dt: number): void {
    this.tDia += dt;
    this.dispararEventos();
  }

  protected debeTerminar(sinNada: boolean): boolean {
    return this.tDia >= JORNADAS[this.dia].duracion || (sinNada && this.tDia > 20);
  }

  /** Paneles y letreros (unas 5 veces por segundo) y lo que mira al jugador. */
  protected carteles(dt: number): void {
    const e = this.escena;
    if (e.flecha.visible) {
      e.flecha.position.copy(this.flechaEn).setY(this.flechaEn.y + 0.2 + Math.sin(this.tiempo * 5) * 0.025);
      if (this.tiempo > this.flechaHasta || !this.tutorial) {
        e.flecha.visible = false;
      }
    }
    // Etiquetas de los objetos dañados: miran al jugador.
    for (const s of this.sueltos) {
      for (const hijo of s.o.grupo.children) {
        if (hijo.userData.mirar) {
          hijo.getWorldPosition(this.v);
          this.v.set(this.cabeza.x, this.v.y, this.cabeza.z);
          hijo.lookAt(this.v);
        }
      }
    }
    if (this.fase !== 'jornada' && this.fase !== 'colocar') {
      return;
    }
    const bloqueo = this.bloqueoDespacho();
    e.botonDespacho.bloquear(!!bloqueo);
    this.tPintar -= dt;
    if (this.tPintar > 0) {
      return;
    }
    this.tPintar = 0.2;
    const visibles = this.avisos
      .filter((a) => a.estado === 'pendiente' || this.tiempo - a.hechoEn < 1.6)
      .sort((a, b) => peso(b) - peso(a) || a.id - b.id);
    const pendientes = this.avisos.filter((a) => a.estado === 'pendiente').length;
    e.panel.pintar(visibles, pendientes, DIAS[this.dia], this.hora(), this.tiempo);
    // Reloj del día.
    const r = e.reloj;
    fondoPanel(r, COLOR.azulMarino);
    r.ctx.fillStyle = COLOR.crema;
    r.ctx.textAlign = 'center';
    r.ctx.textBaseline = 'middle';
    textoAjustado(r.ctx, `${DIAS[this.dia]} · ${this.hora()}`, r.ancho / 2, 64, r.ancho - 60, 66, 900);
    const k = Math.min(1, this.tDia / JORNADAS[this.dia].duracion);
    r.ctx.fillStyle = 'rgba(255,248,237,0.25)';
    rect(r.ctx, 60, 112, r.ancho - 120, 14, 7);
    r.ctx.fill();
    r.ctx.fillStyle = COLOR.coral;
    rect(r.ctx, 60, 112, Math.max(14, (r.ancho - 120) * k), 14, 7);
    r.ctx.fill();
    r.listo();
    // Letrero de la caja del pedido.
    const p = this.enCurso() ?? this.pedidos.find((x) => x.estado === 'elegir');
    const lp = e.letreroPedido;
    fondoPanel(lp, p ? (p.tarde ? '#FCE8E8' : COLOR.amarillo) : COLOR.arena);
    lp.ctx.fillStyle = p?.tarde ? COLOR.rojoProfundo : COLOR.azul;
    lp.ctx.textAlign = 'center';
    lp.ctx.textBaseline = 'middle';
    if (!p) {
      textoAjustado(lp.ctx, 'Caja para pedidos', lp.ancho / 2, 78, lp.ancho - 60, 54);
    } else if (p.estado === 'elegir') {
      textoAjustado(lp.ctx, `${p.municipio}: elige el destino`, lp.ancho / 2, 56, lp.ancho - 60, 50);
      textoAjustado(lp.ctx, p.restante > 0 ? reloj(p.restante) : 'TARDE', lp.ancho / 2, 112, lp.ancho - 60, 42);
    } else {
      textoAjustado(lp.ctx, `${p.municipio} · ${p.restante > 0 ? reloj(p.restante) : 'TARDE'}`, lp.ancho / 2, 52, lp.ancho - 60, 50);
      textoAjustado(lp.ctx, textoPedido(p, true), lp.ancho / 2, 112, lp.ancho - 50, 42, 700);
    }
    lp.listo();
    e.letreroPedido.malla.visible = !this.cajaEnCamion;
    // Letrero del botón de despacho.
    const ld = e.letreroDespacho;
    fondoPanel(ld, bloqueo ? COLOR.arena : COLOR.verde);
    ld.ctx.fillStyle = bloqueo ? COLOR.carbon : '#FFFFFF';
    ld.ctx.textAlign = 'center';
    ld.ctx.textBaseline = 'middle';
    textoAjustado(ld.ctx, bloqueo ?? '¡Listo para despachar!', ld.ancho / 2, 64, ld.ancho - 50, 44);
    ld.listo();
  }
}

/** Orden de los avisos en el panel: el pedido en curso y lo urgente primero. */
function peso(a: Aviso): number {
  if (a.estado === 'hecho') {
    return -1;
  }
  const p = a.pedido;
  if (p && (p.estado === 'curso' || p.estado === 'elegir')) {
    return 4;
  }
  if (a.tipo === 'alerta' || p?.urgente || p?.tarde) {
    return 3;
  }
  return a.tipo === 'cajas' ? 2 : 1;
}

/** Marca sombras y zonas invisibles para que el contorno no las dibuje. */
function sinContorno(obj: Object3D): void {
  obj.traverse((o) => {
    const m = o as unknown as { isMesh?: boolean; material?: { transparent?: boolean } };
    if (m.isMesh && m.material?.transparent) {
      o.userData.sinContorno = true;
    }
  });
}
