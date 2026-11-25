// ============================================================
// escena.ts — la oficina del centro de acopio, en forma de U
// alrededor del jugador (que está en el origen, mirando a -Z):
//
//   · Izquierda: el panel de avisos (en el monitor del computador).
//   · Frente: la estantería de la página (5 categorías) con el gato encima
//     y la caneca de descarte a su izquierda, hacia el frente; delante, la
//     pila de cajas, la zona de trabajo y la caja del pedido.
//   · Derecha: el camión de la Cruz Roja y el botón de despacho.
//
// Todo lo que va sobre las mesas cuelga de `sobre`, cuyo y = 0 es
// la superficie de las mesas. Las mesas flotan (no tienen patas ni
// dependen de una mesa real).
//
// Ergonomía (se calibra al colocar, de pie): estatura ≈ ojos / 0,93.
//   · Mesa: codo (0,63 × estatura) menos 7,5 cm.
//   · Estantería: sobre la mesa (sobre la cadera); la fila de arriba bajo
//     la línea de los ojos. Se achica como mucho al 75 % (productos grandes).
//   · Paneles: a 70 cm, el centro 12,5° por debajo de los ojos y
//     mirando a la persona.
//   · Lo que se agarra, a 35–60 cm del pecho (la persona está en el
//     origen).
// ============================================================
import {
  BoxGeometry,
  ConeGeometry,
  CylinderGeometry,
  DoubleSide,
  Group,
  Mesh,
  MeshStandardMaterial,
  Vector3,
  type Object3D,
} from '@iwsdk/core';
import { ENTRADA, PLATAFORMA, bajoPantalla, crearCamion, crearMonitor, sombra } from './objetos.js';
import { COLOR } from './datos.js';
import { ALTO_PANEL, ANCHO_PANEL, Panel } from './panel.js';
import { ALTO_REPISA, ANCHO_REPISA, Repisa } from './repisa.js';
import { BOTON, Boton3D, Lienzo } from './ui.js';
import { crearLimpiador } from './interaccion.js';
import { ponerEncima } from './oclusion.js';

const mate = (color: string) => new MeshStandardMaterial({ color, roughness: 0.88 });

/** Rectángulos de las mesas (x0, x1, z0, z1) sobre el plano. */
const MESAS: [number, number, number, number][] = [
  [-0.55, 0.55, -0.78, -0.25], // frente (lleva la estantería)
  [-0.9, -0.55, -0.75, -0.05], // izquierda
  [0.55, 0.9, -0.75, -0.05], // derecha
];

export const PILA = [new Vector3(-0.34, 0, -0.34), new Vector3(-0.17, 0, -0.34)];
/** La caja que se está desocupando: al centro, frente a la persona y cerca del borde de la mesa. */
export const TRABAJO = new Vector3(0, 0, -0.33);
export const PEDIDO = new Vector3(0.4, 0, -0.41);
/**
 * Caneca de descarte: en la esquina delantera izquierda, por FUERA de la
 * estantería (su frente está en z ≈ −0,50 y su lado en x ≈ −0,43) y sin
 * tocar la pila de cajas: así no atraviesa el mueble.
 */
export const CANECA = new Vector3(-0.485, 0, -0.42);
/** Monitor del computador: parado sobre la mesa de la izquierda. */
const MONITOR = new Vector3(-0.72, 0, -0.4);
export const ESCALA_CAJA = 0.7;
/** El gato encima de la estantería, un poco más pequeño. */
export const ESCALA_GATO = 0.7;
export const ALTO_CAJA = 0.14 * ESCALA_CAJA;
const CAMION = new Vector3(0.66, 0, -0.53);
const BOTON_DESPACHO = new Vector3(0.67, 0, -0.13);
/** Estantería: lo más cerca posible sin tapar la zona de trabajo. */
const Z_REPISA = -0.62;
/**
 * El gato (y su reloj) van hacia la izquierda de la estantería: su globo, a
 * la derecha, queda encima de la estantería y alineado con ella.
 */
const X_GATO = -0.17;
/**
 * Huella de la estantería sobre la mesa (coordenadas de la oficina, sin
 * achicar): es lo que debe quedar sobre una superficie real al colocarla.
 */
export const HUELLA_REPISA = { centroZ: Z_REPISA + 0.016, ancho: ANCHO_REPISA + 0.02, fondo: 0.2 };
/** Ángulos (grados, positivo a la izquierda) de los paneles alrededor de la persona. */
export const ANGULO = { panel: 68, derecha: -58, mensajes: 104, resumen: 0 };
const DISTANCIA_PANEL = 0.7;
/** Grosor del tablero de la mesa virtual. */
const GROSOR_MESA = 0.03;
const BAJO_OJOS = (12.5 * Math.PI) / 180;
const ESCALA_CAMION = 0.75;

/** Gira un objeto en (x, z) para que su cara (+Z) mire al jugador. */
export function mirarAlCentro(obj: Object3D): void {
  obj.rotation.order = 'YXZ';
  obj.rotation.y = Math.atan2(-obj.position.x, -obj.position.z);
}

export class Escena {
  readonly raiz = new Group();
  /** y = 0: superficie de las mesas. */
  readonly sobre = new Group();
  readonly repisa = new Repisa();
  readonly panel = new Panel();
  readonly camion: Group;
  /** Bisagras de las puertas traseras del camión. */
  private puertas: Object3D[];
  private aperturaPuertas = 0;
  readonly pedestal: Mesh;
  readonly botonDespacho = new Boton3D('Despachar', 0.14, 0.06, BOTON.principal);
  readonly letreroDespacho = new Lienzo(640, 140, 0.2);
  /** Reloj digital, a los pies del gato encima de la estantería. */
  readonly reloj = new Lienzo(900, 150, 0.3);
  readonly letreroPedido = new Lienzo(900, 170, 0.32);
  readonly caneca = new Group();
  /** Resumen del día / de la semana. */
  readonly resumen = new Group();
  readonly lienzoResumen = new Lienzo(1200, 860, 0.62);
  readonly siguiente = new Boton3D('Continuar', 0.2, 0.05, BOTON.principal);
  readonly finalizar = new Boton3D('Finalizar experiencia', 0.24, 0.05, BOTON.secundario);
  /** Flecha del tutorial. */
  readonly flecha: Mesh;
  alto = 0.9;
  /** Altura de los ojos sobre el piso medida al calibrar. */
  ojos = 1.55;
  /** Patas de la mesa virtual (solo cuando no está sobre una mesa real). */
  private readonly patas = new Group();
  /** Paneles que se ubican según la ergonomía (ángulo y distancia). */
  private ubicados = new Map<Object3D, { angulo: number; distancia: number }>();

  constructor() {
    this.raiz.add(this.sobre);
    this.armarMesas();

    // Estantería de la página al fondo de la mesa del frente.
    this.repisa.grupo.position.set(0, 0, Z_REPISA);
    this.sobre.add(this.repisa.grupo);
    const sombraRepisa = sombra(1.1, 0.25, 0.25);
    sombraRepisa.position.set(0, 0.002, Z_REPISA);
    this.sobre.add(sombraRepisa);

    // Reloj del día, encima de la repisa.
    this.reloj.malla.position.set(X_GATO, ALTO_REPISA + 0.08, Z_REPISA - 0.03);
    this.sobre.add(this.reloj.malla);

    // Caneca de descarte (abierta) sobre la mesa.
    const lata = new Mesh(new CylinderGeometry(0.058, 0.048, 0.1, 20, 1, true), mate('#6E7F86'));
    lata.position.y = 0.05;
    (lata.material as MeshStandardMaterial).side = DoubleSide;
    const fondo = new Mesh(new CylinderGeometry(0.048, 0.048, 0.004, 20), mate('#4D5A60'));
    fondo.position.y = 0.002;
    const letrero = new Lienzo(384, 80, 0.1);
    letrero.ctx.fillStyle = COLOR.rojoProfundo;
    letrero.ctx.beginPath();
    letrero.ctx.roundRect(4, 4, 376, 72, 34);
    letrero.ctx.fill();
    letrero.ctx.fillStyle = '#FFFFFF';
    letrero.ctx.font = '700 44px Roboto, Arial, sans-serif';
    letrero.ctx.textAlign = 'center';
    letrero.ctx.textBaseline = 'middle';
    letrero.ctx.fillText('Descarte', 192, 42);
    letrero.listo();
    letrero.malla.position.set(0, 0.06, 0.059);
    this.caneca.add(lata, fondo, letrero.malla, sombra(0.16, 0.16, 0.3));
    this.caneca.position.copy(CANECA);
    mirarAlCentro(this.caneca);
    this.sobre.add(this.caneca);

    // Letrero de la caja del pedido.
    this.letreroPedido.malla.position.set(PEDIDO.x, 0.2, PEDIDO.z);
    this.sobre.add(this.letreroPedido.malla);

    // Panel de avisos a la izquierda, en la pantalla del monitor del computador
    // (la interfaz es la misma: solo cambia el contenedor).
    // El monitor está parado sobre la mesa de la izquierda (la base del pie toca
    // la mesa) y mira a la persona.
    this.panel.grupo.add(crearMonitor(ANCHO_PANEL * 1.03, ALTO_PANEL * 1.03));
    this.sobre.add(this.panel.grupo);
    this.panel.grupo.position.set(MONITOR.x, bajoPantalla(ALTO_PANEL * 1.03) + 0.002, MONITOR.z);
    mirarAlCentro(this.panel.grupo);

    // Camión a la derecha (mira hacia el fondo) y su botón.
    const camion = crearCamion();
    this.camion = camion.raiz;
    this.puertas = camion.puertas;
    this.camion.scale.setScalar(ESCALA_CAMION);
    this.camion.position.copy(CAMION);
    this.camion.rotation.y = Math.PI / 2;
    this.sobre.add(this.camion);
    // Base del botón: una placa baja y horizontal, girada hacia la persona
    // (como el botón) y completa sobre la mesa.
    this.pedestal = new Mesh(new BoxGeometry(0.16, 0.026, 0.09), mate(COLOR.carbon));
    this.pedestal.position.set(BOTON_DESPACHO.x, 0.013, BOTON_DESPACHO.z);
    mirarAlCentro(this.pedestal);
    this.sobre.add(this.pedestal);
    this.botonDespacho.grupo.position.set(BOTON_DESPACHO.x, 0.034, BOTON_DESPACHO.z);
    mirarAlCentro(this.botonDespacho.grupo);
    this.botonDespacho.grupo.rotation.x = -1.2;
    this.sobre.add(this.botonDespacho.grupo);
    this.letreroDespacho.malla.position.set(BOTON_DESPACHO.x, 0.13, BOTON_DESPACHO.z - 0.04);
    mirarAlCentro(this.letreroDespacho.malla);
    this.sobre.add(this.letreroDespacho.malla);

    // Resumen (día o semana), al frente.
    this.resumen.add(this.lienzoResumen.malla);
    this.siguiente.grupo.position.set(0, -0.19, 0.004);
    this.finalizar.grupo.position.set(0, -0.19, 0.004);
    this.resumen.add(this.siguiente.grupo, this.finalizar.grupo);
    this.ubicar(this.resumen, ANGULO.resumen, 0.52);
    this.resumen.visible = false;
    this.sobre.add(this.resumen);

    // Flecha del tutorial.
    this.flecha = new Mesh(new ConeGeometry(0.02, 0.05, 16), mate(COLOR.coral));
    this.flecha.rotation.x = Math.PI;
    this.flecha.visible = false;
    this.sobre.add(this.flecha);
  }

  private quitarEncima: (() => void) | null = null;

  /**
   * Muestra u oculta el resumen (día o semana). Se dibuja por encima de todo
   * (se borra la profundidad justo antes), así la estantería nunca lo atraviesa
   * aunque la oficina haya quedado cerca de la persona.
   */
  mostrarResumen(visible: boolean): void {
    this.resumen.visible = visible;
    if (visible && !this.quitarEncima) {
      this.quitarEncima = ponerEncima(this.resumen, crearLimpiador());
    } else if (!visible && this.quitarEncima) {
      this.quitarEncima();
      this.quitarEncima = null;
    }
  }

  get botones(): Boton3D[] {
    return [...this.panel.todosLosBotones, this.botonDespacho, this.siguiente, this.finalizar];
  }

  /**
   * Botones del resumen. Día: "Continuar" y "Finalizar experiencia" (el
   * viernes solo "Finalizar experiencia"). Resumen total: "Volver al inicio".
   */
  botonesResumen(modo: 'dia' | 'viernes' | 'total'): void {
    const s = this.siguiente;
    const f = this.finalizar;
    s.activo = modo !== 'viernes';
    f.activo = modo !== 'total';
    s.escribir(modo === 'total' ? 'Volver al inicio' : 'Continuar');
    const ambos = modo === 'dia';
    s.grupo.position.x = ambos ? -0.125 : 0;
    f.grupo.position.x = ambos ? 0.125 : 0;
  }

  /**
   * Tableros con la madera de la estantería de la página. Sobre una mesa real
   * se apoyan en ella; si no hay, se apoyan en el piso con patas.
   */
  private armarMesas(): void {
    const tablero = new MeshStandardMaterial({ color: '#C98F62', emissive: '#3A1F0E', roughness: 0.9 });
    const canto = new MeshStandardMaterial({ color: '#B87048', emissive: '#4E2A14', roughness: 0.9 });
    // Patas: cilindros de 1 m que se estiran hasta el piso (ver ajustarErgonomia).
    const geoPata = new CylinderGeometry(0.018, 0.018, 1, 12);
    for (const [x0, x1, z0, z1] of MESAS) {
      const t = new Mesh(new BoxGeometry(x1 - x0, GROSOR_MESA, z1 - z0), [canto, canto, tablero, canto, canto, canto]);
      t.position.set((x0 + x1) / 2, -GROSOR_MESA / 2, (z0 + z1) / 2);
      this.sobre.add(t);
      for (const [px, pz] of [
        [x0 + 0.04, z0 + 0.04],
        [x1 - 0.04, z0 + 0.04],
        [x0 + 0.04, z1 - 0.04],
        [x1 - 0.04, z1 - 0.04],
      ]) {
        const pata = new Mesh(geoPata, canto);
        pata.position.set(px, -0.5, pz);
        this.patas.add(pata);
      }
    }
    this.sobre.add(this.patas);
  }

  /** Pone un panel a `angulo` grados (positivo a la izquierda), a la altura de la vista. */
  ubicar(obj: Object3D, angulo: number, distancia = DISTANCIA_PANEL): void {
    this.ubicados.set(obj, { angulo, distancia });
    this.ponerPanel(obj, angulo, distancia);
  }

  private ponerPanel(obj: Object3D, angulo: number, distancia: number): void {
    const a = (angulo * Math.PI) / 180;
    // El centro, 12,5° por debajo de la línea de los ojos.
    const y = this.ojos - distancia * Math.tan(BAJO_OJOS) - this.alto;
    obj.position.set(-Math.sin(a) * distancia, y, -Math.cos(a) * distancia);
    mirarAlCentro(obj);
    obj.rotation.x = -BAJO_OJOS;
  }

  /** Arriba de la estantería (coordenadas de `sobre`). */
  get techoRepisa(): number {
    return ALTO_REPISA * this.repisa.grupo.scale.x;
  }

  /** Puesto del gato: encima de la estantería, con el reloj digital a sus pies (coordenadas de la raíz). */
  puestoGato(salida: Vector3): Vector3 {
    return salida.set(X_GATO * this.repisa.grupo.scale.x, this.alto + this.techoRepisa, Z_REPISA - 0.03);
  }

  /**
   * Ajusta todo a la estatura (calibración de pie): `ojos` es la altura de
   * los ojos sobre el piso; `mesaReal`, la altura de la superficie real donde
   * va la estantería (null: la mesa flota a la altura del codo). Devuelve la
   * altura de la mesa.
   */
  ajustarErgonomia(ojos: number, mesaReal: number | null = null): number {
    this.ojos = Math.min(2.05, Math.max(1.0, ojos));
    const estatura = this.ojos / 0.93;
    // Mesa: sobre la superficie real si la hay; si no, a la altura del codo menos 7,5 cm.
    // Sobre una mesa real, el tablero virtual queda APOYADO encima (su cara de
    // abajo toca la mesa real), no hundido en ella.
    this.alto =
      mesaReal !== null
        ? Math.min(1.3, Math.max(0.35, mesaReal)) + GROSOR_MESA
        : Math.min(1.15, Math.max(0.6, 0.63 * estatura - 0.075));
    this.sobre.position.y = this.alto;
    // Sin mesa real, la mesa virtual se apoya en el piso con sus patas.
    const largoPata = Math.max(0.05, this.alto - GROSOR_MESA);
    this.patas.visible = mesaReal === null;
    for (const pata of this.patas.children) {
      pata.scale.y = largoPata;
      pata.position.y = -GROSOR_MESA - largoPata / 2;
    }
    // Estantería: la fila de arriba queda bajo la línea de los ojos. Se achica
    // solo un poco si hace falta, para que los productos se vean grandes.
    const techo = Math.min(this.ojos - 0.1, 0.9 * estatura);
    const k = Math.min(1, Math.max(0.75, (techo - this.alto) / this.repisa.alturaFilaArriba));
    this.repisa.grupo.scale.setScalar(k);
    // Reloj al frente del techo de la estantería, donde el gato pone los pies.
    this.reloj.malla.position.set(X_GATO * k, ALTO_REPISA * k + 0.022, Z_REPISA + 0.105 * k);
    // Paneles a la altura de la vista.
    this.ubicados.forEach((u, obj) => this.ponerPanel(obj, u.angulo, u.distancia));
    return this.alto;
  }

  /** Altura de apoyo en (x, z) de `sobre`: la mesa (0) o el piso. */
  apoyo(x: number, z: number): number {
    for (const [x0, x1, z0, z1] of MESAS) {
      if (x > x0 && x < x1 && z > z0 && z < z1) {
        return 0;
      }
    }
    return -this.alto;
  }

  /** Abre o cierra (animado) las puertas traseras del camión. */
  puertasCamion(abiertas: boolean, dt: number): void {
    const objetivo = abiertas ? 1 : 0;
    this.aperturaPuertas += Math.sign(objetivo - this.aperturaPuertas) * Math.min(Math.abs(objetivo - this.aperturaPuertas), dt * 2.5);
    const angulo = this.aperturaPuertas * 1.9;
    this.puertas[0].rotation.y = angulo;
    this.puertas[1].rotation.y = -angulo;
  }

  /** Entrada del furgón (detrás de las puertas), en coordenadas de `sobre`. */
  entradaCamion(salida: Vector3): Vector3 {
    this.camion.updateWorldMatrix(true, false);
    return this.sobre.worldToLocal(this.camion.localToWorld(salida.copy(ENTRADA)));
  }

  /** Dónde queda la caja adentro del furgón, en coordenadas de `sobre`. */
  plataforma(salida: Vector3): Vector3 {
    this.camion.updateWorldMatrix(true, false);
    return this.sobre.worldToLocal(this.camion.localToWorld(salida.copy(PLATAFORMA)));
  }
}
