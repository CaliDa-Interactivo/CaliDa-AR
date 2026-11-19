// ============================================================
// escena.ts — la oficina del centro de acopio, en forma de U
// alrededor del jugador (que está en el origen, mirando a -Z):
//
//   · Izquierda: el panel de avisos (tipo tablet) y el gato.
//   · Frente: la repisa de 6 categorías sobre la mesa; delante, la
//     pila de cajas, la zona de trabajo, la caja del pedido y la
//     caneca de descarte.
//   · Derecha: el camión de la Cruz Roja y el botón de despacho.
//
// Todo lo que va sobre las mesas cuelga de `sobre`, cuyo y = 0 es
// la superficie de las mesas; la altura real (cintura) se ajusta
// al colocar la oficina. Todo queda al alcance del brazo.
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
import { PLATAFORMA, crearCamion, sombra } from '../modelos.js';
import { COLOR } from './datos.js';
import { Panel } from './panel.js';
import { ALTO_REPISA, Repisa } from './repisa.js';
import { Boton3D, Lienzo } from './ui.js';

const mate = (color: string) => new MeshStandardMaterial({ color, roughness: 0.88 });

/** Rectángulos de las mesas (x0, x1, z0, z1) sobre el plano. */
const MESAS: [number, number, number, number][] = [
  [-0.55, 0.55, -0.75, -0.25], // frente
  [-0.9, -0.55, -0.75, -0.05], // izquierda
  [0.55, 0.9, -0.75, -0.05], // derecha
];

export const PILA = [new Vector3(-0.33, 0, -0.4), new Vector3(-0.14, 0, -0.4)];
export const TRABAJO = new Vector3(0.1, 0, -0.41);
export const PEDIDO = new Vector3(0.4, 0, -0.41);
export const CANECA = new Vector3(-0.48, 0, -0.32);
export const ESCALA_CAJA = 0.7;
export const ALTO_CAJA = 0.14 * ESCALA_CAJA;
const CAMION = new Vector3(0.74, 0, -0.44);
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
  private patas = new Group();
  readonly repisa = new Repisa();
  readonly panel = new Panel();
  readonly camion: Group;
  readonly pedestal: Mesh;
  readonly botonDespacho = new Boton3D('Despachar', 0.13, 0.07, COLOR.rojo);
  readonly letreroDespacho = new Lienzo(640, 140, 0.2);
  readonly reloj = new Lienzo(900, 150, 0.42);
  readonly letreroPedido = new Lienzo(900, 170, 0.32);
  readonly caneca = new Group();
  /** Pregunta "¿Está en buen estado?" con Sí / No. */
  readonly pregunta = new Group();
  readonly si = new Boton3D('Sí ✓', 0.09, 0.045, COLOR.verde, '#FFFFFF');
  readonly no = new Boton3D('No ✕', 0.09, 0.045, COLOR.rojo, '#FFFFFF');
  /** Resumen del día / de la semana. */
  readonly resumen = new Group();
  readonly lienzoResumen = new Lienzo(1200, 860, 0.62);
  readonly siguiente = new Boton3D('Siguiente jornada', 0.2, 0.05, COLOR.rojo);
  /** Flecha del tutorial. */
  readonly flecha: Mesh;
  alto = 0.9;

  constructor() {
    this.raiz.add(this.sobre, this.patas);
    this.armarMesas();

    // Repisa al fondo de la mesa del frente.
    this.repisa.grupo.position.set(0, 0, -0.68);
    this.sobre.add(this.repisa.grupo);
    const sombraRepisa = sombra(1.1, 0.25, 0.25);
    sombraRepisa.position.set(0, 0.002, -0.68);
    this.sobre.add(sombraRepisa);

    // Reloj del día, encima de la repisa.
    this.reloj.malla.position.set(0, ALTO_REPISA + 0.08, -0.69);
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

    // Panel de avisos a la izquierda, inclinado hacia atrás.
    this.panel.grupo.position.set(-0.72, 0.21, -0.36);
    mirarAlCentro(this.panel.grupo);
    this.panel.grupo.rotation.x = -0.28;
    this.sobre.add(this.panel.grupo);

    // Camión a la derecha (mira hacia el fondo) y su botón.
    this.camion = crearCamion();
    this.camion.scale.setScalar(ESCALA_CAMION);
    this.camion.position.copy(CAMION);
    this.camion.rotation.y = Math.PI / 2;
    this.sobre.add(this.camion);
    this.pedestal = new Mesh(new BoxGeometry(0.17, 0.05, 0.11), mate(COLOR.carbon));
    this.pedestal.position.set(0.68, 0.025, -0.12);
    this.sobre.add(this.pedestal);
    this.botonDespacho.grupo.position.set(0.68, 0.055, -0.12);
    mirarAlCentro(this.botonDespacho.grupo);
    this.botonDespacho.grupo.rotation.x = -1.05;
    this.sobre.add(this.botonDespacho.grupo);
    this.letreroDespacho.malla.position.set(0.68, 0.16, -0.14);
    mirarAlCentro(this.letreroDespacho.malla);
    this.sobre.add(this.letreroDespacho.malla);

    // Pregunta sobre la zona de trabajo.
    const lienzoPregunta = new Lienzo(700, 150, 0.24);
    lienzoPregunta.ctx.fillStyle = COLOR.crema;
    lienzoPregunta.ctx.beginPath();
    lienzoPregunta.ctx.roundRect(4, 4, 692, 142, 50);
    lienzoPregunta.ctx.fill();
    lienzoPregunta.ctx.fillStyle = COLOR.azul;
    lienzoPregunta.ctx.font = '900 60px Roboto, Arial, sans-serif';
    lienzoPregunta.ctx.textAlign = 'center';
    lienzoPregunta.ctx.textBaseline = 'middle';
    lienzoPregunta.ctx.fillText('¿Está en buen estado?', 350, 78);
    lienzoPregunta.listo();
    this.pregunta.add(lienzoPregunta.malla);
    this.si.grupo.position.set(-0.06, -0.06, 0);
    this.no.grupo.position.set(0.06, -0.06, 0);
    this.pregunta.add(this.si.grupo, this.no.grupo);
    this.pregunta.position.set(TRABAJO.x, 0.36, TRABAJO.z + 0.06);
    mirarAlCentro(this.pregunta);
    this.pregunta.rotation.x = -0.25;
    this.pregunta.visible = false;
    this.sobre.add(this.pregunta);

    // Resumen (día o semana), al frente.
    this.resumen.add(this.lienzoResumen.malla);
    this.siguiente.grupo.position.set(0, -0.19, 0.004);
    this.resumen.add(this.siguiente.grupo);
    this.resumen.position.set(0.04, 0.42, -0.42);
    this.resumen.rotation.x = -0.12;
    this.resumen.visible = false;
    this.sobre.add(this.resumen);

    // Flecha del tutorial.
    this.flecha = new Mesh(new ConeGeometry(0.02, 0.05, 16), mate(COLOR.coral));
    this.flecha.rotation.x = Math.PI;
    this.flecha.visible = false;
    this.sobre.add(this.flecha);
  }

  get botones(): Boton3D[] {
    return [...this.panel.todosLosBotones, this.botonDespacho, this.si, this.no, this.siguiente];
  }

  private armarMesas(): void {
    const tablero = mate(COLOR.maderaClara);
    const pata = mate(COLOR.madera);
    for (const [x0, x1, z0, z1] of MESAS) {
      const t = new Mesh(new BoxGeometry(x1 - x0, 0.03, z1 - z0), tablero);
      t.position.set((x0 + x1) / 2, -0.015, (z0 + z1) / 2);
      this.sobre.add(t);
      for (const [x, z] of [
        [x0 + 0.04, z0 + 0.04],
        [x1 - 0.04, z0 + 0.04],
        [x0 + 0.04, z1 - 0.04],
        [x1 - 0.04, z1 - 0.04],
      ]) {
        const p = new Mesh(new BoxGeometry(0.035, 1, 0.035), pata);
        p.position.set(x, 0.5, z);
        this.patas.add(p);
      }
    }
  }

  /** Ajusta la altura de las mesas (a la cintura del jugador). */
  ajustarAltura(alto: number): void {
    this.alto = alto;
    this.sobre.position.y = alto;
    this.patas.scale.y = alto - 0.03;
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
