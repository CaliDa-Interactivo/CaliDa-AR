// ============================================================
// notificaciones.ts — la campana de avisos (dura toda la
// experiencia), su panel y el gestor de eventos.
//
//  · La campana va en la muñeca izquierda y solo se ve con la
//    palma hacia arriba. Se toca con el índice de la otra mano.
//    (Sin manos —controles o computador— queda flotando junto al
//    centro de acopio y se toca con el rayo o el mouse.)
//  · Un número rojo cuenta los pendientes. Cada aviso suena y, con
//    controles, vibra. Si es urgente, la campana se pone roja y el
//    gato señala la muñeca.
//  · Cada aviso tiene UN botón de acción; resuelto, pasa a "hecho"
//    con un check y sale de la lista.
// ============================================================
import {
  ConeGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  SphereGeometry,
  Vector3,
  type Entity,
} from '@iwsdk/core';
import { COLOR } from '../datos.js';
import { Etiqueta, Letrero, PastillaBoton } from '../texto.js';
import { OCULTO, type Contexto } from './contexto.js';
import { DIAS, EVENTOS, type ClaveEvento } from './eventos.js';
import type { Aviso, TipoAviso } from './estado.js';
import { sonidos } from './sonidos.js';

const MAX_TARJETAS = 3;
const FUENTE = 'Roboto, "Segoe UI", Arial, sans-serif';

const ESTILO: Record<TipoAviso, { fondo: string; texto: string; titulo: string }> = {
  donaciones: { fondo: '#426D8C', texto: '#FFF6E6', titulo: 'DONACIONES RECIBIDAS' },
  urgencia: { fondo: '#FCE8E8', texto: '#A5121A', titulo: 'URGENCIA' },
  necesidad: { fondo: '#FDD794', texto: '#011E41', titulo: 'NECESIDAD NUEVA' },
  entrega: { fondo: '#3E7A6C', texto: '#FFFFFF', titulo: 'ENTREGA CONFIRMADA' },
  prueba: { fondo: '#86B5A9', texto: '#011E41', titulo: 'AVISO DE PRUEBA' },
};

/** Tarjeta de un aviso, dibujada en un canvas. */
class Tarjeta extends Letrero {
  constructor() {
    super(720, 250, 0.34);
  }

  escribir(aviso: Aviso, dia: string): void {
    const { ctx, lienzo } = this;
    const w = lienzo.width;
    const h = lienzo.height;
    const estilo = ESTILO[aviso.tipo];
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(1, 30, 65, 0.22)';
    ctx.beginPath();
    ctx.roundRect(8, 16, w - 16, h - 22, 40);
    ctx.fill();
    ctx.fillStyle = estilo.fondo;
    ctx.beginPath();
    ctx.roundRect(8, 6, w - 16, h - 22, 40);
    ctx.fill();
    ctx.fillStyle = estilo.texto;
    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'left';
    ctx.font = `900 30px ${FUENTE}`;
    ctx.fillText(`${estilo.titulo} · ${dia}`, 44, 62);
    // Mensaje en una o dos líneas.
    ctx.font = `700 40px ${FUENTE}`;
    const palabras = (aviso.estado === 'hecho' ? `✓ Hecho: ${aviso.texto}` : aviso.texto).split(' ');
    let linea = '';
    let y = 116;
    for (const palabra of palabras) {
      const prueba = linea ? `${linea} ${palabra}` : palabra;
      if (linea && ctx.measureText(prueba).width > w - 88) {
        ctx.fillText(linea, 44, y);
        y += 48;
        linea = palabra;
      } else {
        linea = prueba;
      }
    }
    ctx.fillText(linea, 44, y);
    this.listo();
  }
}

interface Fila {
  tarjeta: Tarjeta;
  grupo: Entity;
  boton: Entity;
  textoBoton: PastillaBoton;
  aviso: Aviso | null;
}

export class Notificaciones {
  /** Lo que pasa al pulsar el botón de un aviso (lo decide la escena). */
  alAccion: (aviso: Aviso) => void = () => undefined;
  abierta = false;
  private campana: Entity;
  private cuerpo: MeshStandardMaterial;
  private numero = new Etiqueta(0.07);
  private panel: Entity;
  private filas: Fila[] = [];
  private sacude = 0;
  private toqueEn = -1;
  private v = new Vector3();
  private w = new Vector3();

  constructor(private c: Contexto) {
    // Campana hecha con primitivas, mate, amarilla (roja si hay urgencia).
    this.cuerpo = new MeshStandardMaterial({ color: '#F2B84B', roughness: 0.8 });
    const grupo = new Group();
    const copa = new Mesh(new SphereGeometry(0.03, 24, 14, 0, Math.PI * 2, 0, Math.PI / 2), this.cuerpo);
    const falda = new Mesh(new ConeGeometry(0.038, 0.022, 24, 1, true), this.cuerpo);
    falda.position.y = -0.008;
    const badajo = new Mesh(new SphereGeometry(0.009, 12, 8), new MeshStandardMaterial({ color: COLOR.cafe, roughness: 0.8 }));
    badajo.position.y = -0.022;
    const asa = new Mesh(new SphereGeometry(0.008, 12, 8), this.cuerpo);
    asa.position.y = 0.033;
    // Zona generosa para acertarle con el índice, el rayo o el mouse.
    const zona = new Mesh(
      new SphereGeometry(0.05, 12, 8),
      new MeshStandardMaterial({ transparent: true, opacity: 0, depthWrite: false }),
    );
    this.numero.malla.position.set(0.034, 0.03, 0.02);
    this.numero.malla.visible = false;
    grupo.add(copa, falda, badajo, asa, zona, this.numero.malla);
    this.campana = c.crearSuelto(grupo);
    c.tocable(this.campana, 'campana');

    // Panel flotante con hasta tres avisos, cada uno con su botón.
    this.panel = c.crearSuelto(new Group());
    for (let i = 0; i < MAX_TARJETAS; i++) {
      const tarjeta = new Tarjeta();
      const grupoFila = c.mundo.createTransformEntity(new Group(), { parent: this.panel });
      grupoFila.object3D!.add(tarjeta.malla);
      grupoFila.object3D!.position.y = -i * 0.155;
      const textoBoton = new PastillaBoton();
      textoBoton.malla.scale.setScalar(0.36);
      textoBoton.malla.renderOrder = 12; // siempre encima de su tarjeta
      const boton = c.mundo.createTransformEntity(textoBoton.malla, { parent: grupoFila });
      boton.object3D!.position.set(0.1, -0.058, 0.012);
      c.tocable(boton, `aviso:${i}`);
      this.filas.push({ tarjeta, grupo: grupoFila, boton, textoBoton, aviso: null });
    }
    this.reiniciar();
  }

  reiniciar(): void {
    this.abierta = false;
    this.cuerpo.color.set('#F2B84B');
    this.panel.object3D!.visible = false;
    this.panel.object3D!.scale.setScalar(OCULTO);
    this.campana.object3D!.visible = false;
    this.numero.malla.visible = false;
  }

  /** Avisos sin resolver. */
  pendientes(): Aviso[] {
    return this.c.estado.avisos.filter((a) => a.estado === 'pendiente');
  }

  /** El gestor de eventos: dispara el aviso de ese día de la línea de tiempo. */
  disparar(clave: ClaveEvento): void {
    const evento = EVENTOS[clave];
    this.c.estado.dia = evento.dia;
    this.avisar({ ...evento.aviso } as Omit<Aviso, 'estado'>);
  }

  avisar(aviso: Omit<Aviso, 'estado'>): void {
    const c = this.c;
    if (c.estado.avisos.some((a) => a.id === aviso.id)) {
      return;
    }
    c.estado.avisos.push({ ...aviso, estado: 'pendiente' });
    sonidos.campana();
    this.sacude = 1.2;
    // Vibración: solo existe en los controles (las manos no vibran).
    for (const fuente of c.mundo.xrSession?.inputSources ?? []) {
      const motor = fuente.gamepad?.hapticActuators?.[0] as
        | { pulse?: (fuerza: number, ms: number) => Promise<boolean> }
        | undefined;
      void motor?.pulse?.(0.7, 120);
    }
    if (aviso.tipo === 'urgencia') {
      this.cuerpo.color.set(COLOR.rojo);
      if (c.gato.visible) {
        c.gato.senalar(this.campana.object3D!.getWorldPosition(this.v), 4, c.tiempo);
      }
    }
    this.pintar();
  }

  /** Marca un aviso como hecho: muestra el check y luego sale de la lista. */
  resolver(id: string): void {
    const aviso = this.c.estado.avisos.find((a) => a.id === id);
    if (!aviso || aviso.estado === 'hecho') {
      return;
    }
    aviso.estado = 'hecho';
    sonidos.logro();
    if (!this.pendientes().some((a) => a.tipo === 'urgencia')) {
      this.cuerpo.color.set('#F2B84B');
    }
    const fila = this.filas.find((f) => f.aviso === aviso);
    if (fila) {
      fila.tarjeta.escribir(aviso, DIAS[this.c.estado.dia]);
      fila.boton.object3D!.scale.setScalar(OCULTO);
      this.c.anim.mover(fila.grupo.object3D!, null, 0.3, { espera: 1.1, fin: () => this.pintar() });
    } else {
      this.pintar();
    }
  }

  alternar(): void {
    this.abierta = !this.abierta;
    sonidos.clic();
    const panel = this.panel.object3D!;
    if (this.abierta) {
      // El panel se queda donde estaba la campana al abrirlo.
      this.campana.object3D!.getWorldPosition(panel.position);
      panel.position.y += 0.24 + 0.155 * (MAX_TARJETAS - 1) * 0.5;
      panel.visible = true;
      panel.scale.setScalar(0.02);
      this.c.anim.mover(panel, null, 0.25, { escala: 1 });
      this.pintar();
    } else {
      this.c.anim.mover(panel, null, 0.2, {
        escala: 0.02,
        fin: () => {
          panel.visible = false;
          panel.scale.setScalar(OCULTO);
        },
      });
    }
  }

  /** Responde a un toque. Devuelve true si era de la campana o de un aviso. */
  tocar(id: string): boolean {
    if (id === 'campana') {
      this.alternar();
      return true;
    }
    if (id.startsWith('aviso:')) {
      const fila = this.filas[Number(id.slice(6))];
      if (fila?.aviso && fila.aviso.estado === 'pendiente' && this.abierta) {
        sonidos.clic();
        this.alAccion(fila.aviso);
      }
      return true;
    }
    return false;
  }

  private pintar(): void {
    const pendientes = this.pendientes();
    this.numero.malla.visible = pendientes.length > 0;
    if (pendientes.length > 0) {
      this.numero.escribir(String(pendientes.length), COLOR.rojo);
    }
    this.filas.forEach((fila, i) => {
      const aviso = pendientes[i] ?? null;
      fila.aviso = aviso;
      const obj = fila.grupo.object3D!;
      this.c.anim.cancelar(obj);
      obj.visible = aviso !== null;
      obj.scale.setScalar(aviso ? 1 : OCULTO);
      if (aviso) {
        fila.tarjeta.escribir(aviso, DIAS[this.c.estado.dia]);
        fila.textoBoton.escribir(aviso.accion);
        fila.boton.object3D!.scale.setScalar(1);
      }
    });
  }

  actualizar(dt: number): void {
    const c = this.c;
    const campana = this.campana.object3D!;
    const activa = c.maquetaEnt.object3D!.visible;
    const mano = c.manos.izquierda;
    if (!activa) {
      campana.visible = false;
    } else if (mano.presente) {
      // En la muñeca izquierda, del lado de la palma; solo con la palma arriba.
      campana.visible = c.manos.palmaArriba(mano, c.cabeza);
      campana.position.copy(mano.muneca).addScaledVector(mano.palma(this.v), 0.06);
    } else {
      // Sin manos: flota junto al centro de acopio.
      campana.visible = true;
      c.raiz.object3D!.localToWorld(campana.position.set(-0.6, 0.42, 0.34));
    }
    campana.scale.setScalar(campana.visible ? 1 : OCULTO);
    // Se sacude cuando llega un aviso.
    this.sacude = Math.max(0, this.sacude - dt);
    c.mirar(campana);
    campana.rotateZ(Math.sin(c.tiempo * 30) * 0.35 * Math.min(1, this.sacude));

    // Tocarla con la punta del índice de la otra mano.
    const indice = c.manos.derecha;
    if (campana.visible && indice.presente && c.tiempo - this.toqueEn > 0.9) {
      if (indice.indice.distanceTo(campana.position) < 0.045) {
        this.toqueEn = c.tiempo;
        this.alternar();
      }
    }
    if (this.abierta) {
      const panel = this.panel.object3D!;
      c.mirar(panel);
      // Los botones de los avisos también se pulsan con el índice.
      for (const fila of this.filas) {
        if (!fila.aviso || fila.aviso.estado !== 'pendiente' || c.tiempo - this.toqueEn < 0.9) {
          continue;
        }
        fila.boton.object3D!.getWorldPosition(this.w);
        for (const m of [c.manos.derecha, c.manos.izquierda]) {
          if (m.presente && m.indice.distanceTo(this.w) < 0.035) {
            this.toqueEn = c.tiempo;
            sonidos.clic();
            this.alAccion(fila.aviso);
            break;
          }
        }
      }
    }
  }
}
