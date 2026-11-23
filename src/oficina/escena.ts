// ============================================================
// escena.ts — la oficina del centro de acopio, en forma de U
// alrededor del jugador (que está en el origen, mirando a -Z):
//
//   · Izquierda: el panel de avisos (en el monitor del computador).
//   · Frente: la góndola de 5 categorías con el gato encima y la caneca
//     de descarte a su izquierda; delante, la pila de cajas, la zona de
//     trabajo y la caja del pedido.
//   · Derecha: el camión de la Cruz Roja y el botón de despacho.
//
// Todo lo que va sobre las mesas cuelga de `sobre`, cuyo y = 0 es
// la superficie de las mesas. Las mesas flotan (no tienen patas ni
// dependen de una mesa real).
//
// Ergonomía (se calibra al colocar, de pie): estatura ≈ ojos / 0,93.
//   · Mesa: codo (0,63 × estatura) menos 7,5 cm.
//   · Góndola: sobre la mesa (sobre la cadera); la bandeja de arriba bajo
//     la línea de los ojos. Se achica como mucho al 80 % (productos grandes).
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
import { PLATAFORMA, crearCamion, crearMonitor, sombra } from './objetos.js';
import { COLOR } from './datos.js';
import { ALTO_PANEL, ANCHO_PANEL, Panel } from './panel.js';
import { ALTO_REPISA, ANCHO_REPISA, Repisa } from './repisa.js';
import { BOTON, Boton3D, Lienzo } from './ui.js';

const mate = (color: string) => new MeshStandardMaterial({ color, roughness: 0.88 });

/** Rectángulos de las mesas (x0, x1, z0, z1) sobre el plano. */
const MESAS: [number, number, number, number][] = [
  [-0.55, 0.55, -0.78, -0.25], // frente (lleva la estantería)
  [-0.9, -0.55, -0.75, -0.05], // izquierda
  [0.55, 0.9, -0.75, -0.05], // derecha
];

export const PILA = [new Vector3(-0.33, 0, -0.4), new Vector3(-0.14, 0, -0.4)];
export const TRABAJO = new Vector3(0.1, 0, -0.41);
export const PEDIDO = new Vector3(0.4, 0, -0.41);
/** Caneca de descarte: justo al lado izquierdo de la góndola. */
export const CANECA = new Vector3(-ANCHO_REPISA / 2 - 0.075, 0, -0.6);
export const ESCALA_CAJA = 0.7;
/** El gato encima de la estantería, un poco más pequeño. */
export const ESCALA_GATO = 0.7;
export const ALTO_CAJA = 0.14 * ESCALA_CAJA;
const CAMION = new Vector3(0.64, 0, -0.42);
const BOTON_DESPACHO = new Vector3(0.64, 0, -0.1);
/** Estantería: lo más cerca posible sin tapar la zona de trabajo. */
const Z_REPISA = -0.64;
/** Ángulos (grados, positivo a la izquierda) de los paneles alrededor de la persona. */
export const ANGULO = { panel: 58, derecha: -58, mensajes: 96, resumen: 0 };
const DISTANCIA_PANEL = 0.7;
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
  /** Paneles que se ubican según la ergonomía (ángulo y distancia). */
  private ubicados = new Map<Object3D, { angulo: number; distancia: number }>();

  constructor() {
    this.raiz.add(this.sobre);
    this.armarMesas();

    // Estantería de la página al fondo de la mesa del frente.
    this.repisa.grupo.position.set(0, 0, Z_REPISA);
    this.sobre.add(this.repisa.grupo);
    const sombraRepisa = sombra(ANCHO_REPISA * 1.1, 0.36, 0.25);
    sombraRepisa.position.set(0, 0.002, Z_REPISA);
    this.sobre.add(sombraRepisa);

    // Reloj del día, encima de la repisa.
    this.reloj.malla.position.set(0, ALTO_REPISA + 0.08, Z_REPISA - 0.03);
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
    this.panel.grupo.add(crearMonitor(ANCHO_PANEL * 1.03, ALTO_PANEL * 1.03));
    this.sobre.add(this.panel.grupo);
    this.ubicar(this.panel.grupo, ANGULO.panel);

    // Camión a la derecha (mira hacia el fondo) y su botón.
    this.camion = crearCamion();
    this.camion.scale.setScalar(ESCALA_CAMION);
    this.camion.position.copy(CAMION);
    this.camion.rotation.y = Math.PI / 2;
    this.sobre.add(this.camion);
    this.pedestal = new Mesh(new BoxGeometry(0.17, 0.05, 0.11), mate(COLOR.carbon));
    this.pedestal.position.set(BOTON_DESPACHO.x, 0.025, BOTON_DESPACHO.z);
    this.sobre.add(this.pedestal);
    this.botonDespacho.grupo.position.set(BOTON_DESPACHO.x, 0.055, BOTON_DESPACHO.z);
    mirarAlCentro(this.botonDespacho.grupo);
    this.botonDespacho.grupo.rotation.x = -1.05;
    this.sobre.add(this.botonDespacho.grupo);
    this.letreroDespacho.malla.position.set(BOTON_DESPACHO.x, 0.16, BOTON_DESPACHO.z - 0.02);
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

  /** Tableros flotantes con la madera de la estantería de la página. */
  private armarMesas(): void {
    const tablero = new MeshStandardMaterial({ color: '#C98F62', emissive: '#3A1F0E', roughness: 0.9 });
    const canto = new MeshStandardMaterial({ color: '#B87048', emissive: '#4E2A14', roughness: 0.9 });
    for (const [x0, x1, z0, z1] of MESAS) {
      const t = new Mesh(new BoxGeometry(x1 - x0, 0.03, z1 - z0), [canto, canto, tablero, canto, canto, canto]);
      t.position.set((x0 + x1) / 2, -0.015, (z0 + z1) / 2);
      this.sobre.add(t);
    }
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
    return salida.set(0, this.alto + this.techoRepisa, Z_REPISA - 0.03);
  }

  /**
   * Ajusta todo a la estatura (calibración de pie): `ojos` es la altura de
   * los ojos sobre el piso. Devuelve la altura de la mesa.
   */
  ajustarErgonomia(ojos: number): number {
    this.ojos = Math.min(2.05, Math.max(1.0, ojos));
    const estatura = this.ojos / 0.93;
    // Mesa: a la altura del codo menos 7,5 cm.
    this.alto = Math.min(1.15, Math.max(0.6, 0.63 * estatura - 0.075));
    this.sobre.position.y = this.alto;
    // Góndola: la bandeja de arriba queda bajo la línea de los ojos (sus
    // productos no tapan la vista). Se achica solo un poco si hace falta,
    // para que los productos sigan viéndose grandes.
    const techo = Math.min(this.ojos - 0.1, 0.9 * estatura);
    const k = Math.min(1, Math.max(0.8, (techo - this.alto) / this.repisa.alturaFilaArriba));
    this.repisa.grupo.scale.setScalar(k);
    // Reloj al frente del techo de la góndola, donde el gato pone los pies.
    this.reloj.malla.position.set(0, ALTO_REPISA * k + 0.022, Z_REPISA + (this.repisa.frente + 0.01) * k);
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

  /** Punto de la plataforma del camión, en coordenadas de `sobre`. */
  plataforma(salida: Vector3): Vector3 {
    this.camion.updateWorldMatrix(true, false);
    return this.sobre.worldToLocal(this.camion.localToWorld(salida.copy(PLATAFORMA)));
  }
}
