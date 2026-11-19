// ============================================================
// multi-ui.ts — piezas del modo multijugador:
//   · Teclado virtual 3D del formulario del receptor.
//   · Mensajes entre receptor y despachador (solo botones, sin texto libre).
//   · Formulario de registro del receptor (nombre, cédula, donación).
//   · Panel de estado del centro (se necesita / no / urgente).
//   · Donante en la fila, con su tarjeta y su barra de paciencia.
// Todos los nombres y cédulas son inventados.
// ============================================================
import {
  BoxGeometry,
  CylinderGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  SphereGeometry,
} from '@iwsdk/core';
import { crearCaja, sombra } from '../modelos.js';
import { CATEGORIAS, COLOR, type IdCategoria } from './datos.js';
import type { Rol } from './red.js';
import { BOTON, Boton3D, FUENTE, Lienzo, fondoPanel, lineas, rect, textoAjustado } from './ui.js';

// ---- Teclado -------------------------------------------------------

const FILAS = ['1234567890', 'QWERTYUIOP', 'ASDFGHJKLÑ', 'ZXCVBNM'];
const TECLA = 0.03;
const PASO = 0.034;

export class Teclado {
  readonly grupo = new Group();
  readonly teclas: Boton3D[] = [];
  alTecla: (letra: string) => void = () => undefined;
  alBorrar: () => void = () => undefined;

  constructor() {
    const base = new Mesh(new BoxGeometry(PASO * 10 + 0.03, PASO * 5 + 0.03, 0.012), new MeshStandardMaterial({ color: COLOR.carbon, roughness: 0.9 }));
    base.position.z = -0.006;
    this.grupo.add(base);
    FILAS.forEach((fila, f) => {
      [...fila].forEach((letra, k) => {
        const t = new Boton3D(letra, TECLA, TECLA, BOTON.secundario);
        t.grupo.position.set((k - (fila.length - 1) / 2) * PASO, (2 - f) * PASO + PASO / 2, 0);
        t.alPresionar = () => this.alTecla(letra);
        this.grupo.add(t.grupo);
        this.teclas.push(t);
      });
    });
    const borrar = new Boton3D('⌫', TECLA * 2, TECLA, BOTON.secundario);
    borrar.grupo.position.set(4 * PASO, -PASO * 1.5, 0);
    borrar.alPresionar = () => this.alBorrar();
    const espacio = new Boton3D('espacio', PASO * 4.5, TECLA, BOTON.secundario);
    espacio.grupo.position.set(-0.4 * PASO, -PASO * 1.5, 0);
    espacio.alPresionar = () => this.alTecla(' ');
    this.grupo.add(borrar.grupo, espacio.grupo);
    this.teclas.push(borrar, espacio);
  }
}

// ---- Chat ----------------------------------------------------------
//
// Sin teclado ni texto libre: solo botones con mensajes ya escritos.
// Un botón por categoría con la "foto" de su producto (la misma de la
// fila de la estantería): el despachador pide ("Necesito …") y el
// receptor avisa ("Llegó …"). Más un mensaje general por rol.

export interface MensajeChat {
  id: number;
  de: Rol;
  texto: string;
  /** Si el mensaje es sobre una categoría (se dibuja su ícono). */
  cat?: IdCategoria;
}

/** Lo que dice cada rol con los botones de categoría. */
export const VERBO: Record<Rol, string> = { despachador: 'Necesito', receptor: 'Llegó' };

export const GENERAL: Record<Rol, string> = {
  receptor: '¿Qué necesitas?',
  despachador: '¡Gracias!',
};

/** Chat dibujado en un lienzo, con sus botones debajo. */
export class Chat {
  readonly grupo = new Group();
  readonly botones: Boton3D[] = [];
  alEnviar: (texto: string, cat?: IdCategoria) => void = () => undefined;
  private lienzo: Lienzo;
  private iconos: Partial<Record<IdCategoria, HTMLCanvasElement>> = {};

  constructor(
    private yo: Rol,
    ancho: number,
    icono: (cat: IdCategoria) => HTMLCanvasElement,
  ) {
    this.lienzo = new Lienzo(900, 560, ancho);
    this.grupo.add(this.lienzo.malla);
    const alto = (ancho * 560) / 900;
    const anchoB = ancho / 4 - 0.006;
    const fila = (i: number) => -alto / 2 - 0.026 - Math.floor(i / 4) * 0.044;
    const columna = (i: number) => ((i % 4) - 1.5) * (anchoB + 0.006);
    CATEGORIAS.forEach((cat, i) => {
      const b = new Boton3D(cat.corto, anchoB, 0.038, BOTON.secundario);
      this.iconos[cat.id] = icono(cat.id);
      b.ponerIcono(this.iconos[cat.id]!);
      b.grupo.position.set(columna(i), fila(i), 0);
      b.alPresionar = () => this.alEnviar(`${VERBO[yo]} ${cat.corto.toLowerCase()}`, cat.id);
      this.grupo.add(b.grupo);
      this.botones.push(b);
    });
    const general = new Boton3D(GENERAL[yo], anchoB * 2 + 0.006, 0.038, BOTON.principal);
    general.grupo.position.set((columna(6) + columna(7)) / 2, fila(6), 0);
    general.alPresionar = () => this.alEnviar(GENERAL[yo]);
    this.grupo.add(general.grupo);
    this.botones.push(general);
  }

  pintar(mensajes: MensajeChat[], conectado: boolean): void {
    const l = this.lienzo;
    const { ctx } = l;
    fondoPanel(l, '#FFF8EC');
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = COLOR.azul;
    ctx.font = `900 40px ${FUENTE}`;
    ctx.fillText(`Mensajes con el ${this.yo === 'receptor' ? 'despachador' : 'receptor'}`, 34, 58);
    ctx.fillStyle = conectado ? COLOR.verde : COLOR.rojo;
    ctx.beginPath();
    ctx.arc(l.ancho - 50, 44, 12, 0, Math.PI * 2);
    ctx.fill();
    // Últimos mensajes, de abajo hacia arriba.
    let y = 530;
    ctx.font = `700 34px ${FUENTE}`;
    for (let i = mensajes.length - 1; i >= 0 && y > 150; i--) {
      const m = mensajes[i];
      const mio = m.de === this.yo;
      const icono = m.cat ? (this.iconos[m.cat] ?? null) : null;
      // Con categoría: "Necesito" + ícono + nombre; si no, el texto.
      const texto = m.cat ? VERBO[m.de] : m.texto;
      const nombre = m.cat ? (CATEGORIAS.find((c) => c.id === m.cat)?.corto ?? '') : '';
      const alto = icono ? 92 : 64;
      ctx.font = `700 34px ${FUENTE}`;
      const anchoTexto = ctx.measureText(texto).width;
      ctx.font = `400 26px ${FUENTE}`;
      const anchoNombre = nombre ? ctx.measureText(nombre).width : 0;
      const ancho = Math.min(l.ancho - 120, 40 + anchoTexto + (icono ? 14 + 76 + 10 + anchoNombre : 0));
      const x = mio ? l.ancho - 34 - ancho : 34;
      ctx.fillStyle = mio ? BOTON.principal : '#F3E4CB';
      rect(ctx, x, y - alto, ancho, alto, alto / 2);
      ctx.fill();
      ctx.fillStyle = mio ? BOTON.textoClaro : BOTON.textoOscuro;
      ctx.font = `700 34px ${FUENTE}`;
      ctx.fillText(texto, x + 22, y - alto / 2 + 12);
      if (icono) {
        const xi = x + 22 + anchoTexto + 14;
        ctx.drawImage(icono, xi, y - alto + 8, 76, 76);
        ctx.font = `400 26px ${FUENTE}`;
        ctx.fillText(nombre, xi + 86, y - alto / 2 + 10);
      }
      y -= alto + 12;
    }
    if (mensajes.length === 0) {
      ctx.fillStyle = COLOR.gris;
      ctx.font = `400 30px ${FUENTE}`;
      ctx.textAlign = 'center';
      ctx.fillText('Usa los botones de abajo para escribirle.', l.ancho / 2, 320);
    }
    l.listo();
  }
}

// ---- Formulario del receptor ---------------------------------------

export type Campo = 'nombre' | 'cedula' | 'cantidad';

export class Formulario {
  readonly grupo = new Group();
  readonly botones: Boton3D[] = [];
  readonly campos: Record<Campo, Boton3D>;
  readonly categorias: Boton3D[] = [];
  readonly registrar: Boton3D;
  readonly rechazar: Boton3D;
  foco: Campo = 'nombre';
  valores: Record<Campo, string> = { nombre: '', cedula: '', cantidad: '' };
  categoria: IdCategoria | null = null;
  errores = new Set<string>();
  mensaje = '';
  colorMensaje: string = COLOR.carbon;
  private lienzo: Lienzo;

  constructor(readonly ancho: number) {
    this.lienzo = new Lienzo(1000, 760, ancho);
    this.grupo.add(this.lienzo.malla);
    const s = ancho / 1000;
    const pos = (px: number, py: number) => [(px - 500) * s, (380 - py) * s] as const;
    const campo = (c: Campo, py: number) => {
      const b = new Boton3D('', ancho * 0.6, 0.036, '#F3EEE6', COLOR.azul);
      const [x, y] = pos(610, py);
      b.grupo.position.set(x, y, 0.004);
      b.alPresionar = () => {
        this.foco = c;
      };
      this.grupo.add(b.grupo);
      this.botones.push(b);
      return b;
    };
    this.campos = { nombre: campo('nombre', 170), cedula: campo('cedula', 270), cantidad: campo('cantidad', 520) };
    CATEGORIAS.forEach((cat, i) => {
      const b = new Boton3D(cat.corto, ancho * 0.24, 0.032, BOTON.secundario);
      const [x, y] = pos(300 + (i % 3) * 270, 365 + Math.floor(i / 3) * 70);
      b.grupo.position.set(x, y, 0.004);
      b.alPresionar = () => {
        this.categoria = cat.id;
      };
      this.grupo.add(b.grupo);
      this.categorias.push(b);
      this.botones.push(b);
    });
    this.registrar = new Boton3D('Registrar', ancho * 0.36, 0.044, BOTON.principal);
    const [rx, ry] = pos(300, 660);
    this.registrar.grupo.position.set(rx, ry, 0.004);
    this.rechazar = new Boton3D('Rechazar', ancho * 0.36, 0.044, BOTON.peligro);
    const [jx, jy] = pos(720, 660);
    this.rechazar.grupo.position.set(jx, jy, 0.004);
    this.grupo.add(this.registrar.grupo, this.rechazar.grupo);
    this.botones.push(this.registrar, this.rechazar);
  }

  limpiar(): void {
    this.valores = { nombre: '', cedula: '', cantidad: '' };
    this.categoria = null;
    this.errores.clear();
    this.foco = 'nombre';
  }

  /** Recibe una tecla del teclado virtual. */
  tecla(letra: string): void {
    const c = this.foco;
    if ((c === 'cedula' || c === 'cantidad') && !/[0-9]/.test(letra)) {
      return;
    }
    if (this.valores[c].length < (c === 'nombre' ? 24 : c === 'cedula' ? 10 : 2)) {
      this.valores[c] += letra;
    }
    this.errores.delete(c);
  }

  borrar(): void {
    this.valores[this.foco] = this.valores[this.foco].slice(0, -1);
  }

  pintar(hayDonante: boolean, tiempo: number): void {
    const l = this.lienzo;
    const { ctx } = l;
    fondoPanel(l);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = COLOR.rojo;
    ctx.font = `900 46px ${FUENTE}`;
    ctx.fillText('Registro de donaciones', 40, 76);
    ctx.fillStyle = COLOR.azul;
    ctx.font = `700 36px ${FUENTE}`;
    ctx.fillText('Nombre', 40, 182);
    ctx.fillText('Cédula', 40, 282);
    ctx.fillText('Donación', 40, 352);
    ctx.fillText('Cantidad', 40, 532);
    // Campos en rojo si tienen error.
    for (const [c, py] of [
      ['nombre', 170],
      ['cedula', 270],
      ['categoria', 400],
      ['cantidad', 520],
    ] as const) {
      if (this.errores.has(c)) {
        ctx.strokeStyle = COLOR.rojo;
        ctx.lineWidth = 6;
        rect(ctx, c === 'categoria' ? 170 : 300, py - (c === 'categoria' ? 70 : 34), c === 'categoria' ? 820 : 620, c === 'categoria' ? 150 : 68, 18);
        ctx.stroke();
      }
    }
    if (this.mensaje) {
      ctx.fillStyle = this.colorMensaje;
      ctx.textAlign = 'center';
      textoAjustado(ctx, this.mensaje, l.ancho / 2, 600, l.ancho - 80, 32, 700);
    }
    l.listo();
    const cursor = Math.sin(tiempo * 6) > 0 ? '|' : '';
    (['nombre', 'cedula', 'cantidad'] as Campo[]).forEach((c) => {
      const b = this.campos[c];
      b.escribir(this.valores[c] + (this.foco === c && hayDonante ? cursor : ''), this.foco === c ? COLOR.amarillo : '#F3EEE6');
    });
    this.categorias.forEach((b, i) => {
      const elegida = this.categoria === CATEGORIAS[i].id;
      b.escribir(CATEGORIAS[i].corto, elegida ? COLOR.petroleo : COLOR.arena);
    });
  }
}

// ---- Panel de estado del centro ------------------------------------

export type EstadoCat = 'necesita' | 'no' | 'urgente';

export const ESTILO_ESTADO: Record<EstadoCat, { texto: string; color: string; letra: string }> = {
  necesita: { texto: 'Se necesita', color: '#F2C14E', letra: '#12406E' },
  no: { texto: 'No se necesita', color: '#FFF8EC', letra: '#12406E' },
  urgente: { texto: 'Urgente', color: '#CC0100', letra: '#FFF6E6' },
};

/** Punto de color de la placa (COLOR_ESTADO de la página). */
export const PUNTO_ESTADO: Record<EstadoCat, string> = { urgente: '#CC0100', necesita: '#F2C14E', no: '#B8AD9C' };

export class PanelEstado {
  readonly grupo = new Group();
  readonly botones: Boton3D[][] = [];
  alCambiar: (i: number, estado: EstadoCat) => void = () => undefined;
  private lienzo: Lienzo;

  constructor(ancho: number) {
    this.lienzo = new Lienzo(1000, 840, ancho);
    this.grupo.add(this.lienzo.malla);
    const s = ancho / 1000;
    CATEGORIAS.forEach((_, i) => {
      const fila: Boton3D[] = [];
      (['necesita', 'no', 'urgente'] as EstadoCat[]).forEach((estado, k) => {
        const e = ESTILO_ESTADO[estado];
        const b = new Boton3D(e.texto, ancho * 0.2, 0.03, e.color, e.letra);
        b.grupo.position.set((390 + k * 215 - 500) * s, (420 - (165 + i * 112)) * s, 0.004);
        b.alPresionar = () => this.alCambiar(i, estado);
        this.grupo.add(b.grupo);
        fila.push(b);
      });
      this.botones.push(fila);
    });
  }

  pintar(estados: EstadoCat[]): void {
    const l = this.lienzo;
    const { ctx } = l;
    fondoPanel(l);
    ctx.textAlign = 'left';
    ctx.fillStyle = COLOR.azul;
    ctx.font = `900 42px ${FUENTE}`;
    ctx.fillText('Estado del centro de acopio', 40, 70);
    CATEGORIAS.forEach((cat, i) => {
      const y = 165 + i * 112;
      ctx.fillStyle = COLOR.azul;
      ctx.font = `700 34px ${FUENTE}`;
      ctx.textBaseline = 'middle';
      ctx.fillText(cat.corto, 40, y);
      ctx.textBaseline = 'alphabetic';
      this.botones[i].forEach((b, k) => {
        const estado = (['necesita', 'no', 'urgente'] as EstadoCat[])[k];
        const e = ESTILO_ESTADO[estado];
        // El elegido va en su color; los demás, apagados.
        b.escribir(e.texto, estados[i] === estado ? e.color : '#EDE7DD');
      });
    });
    l.listo();
  }
}

// ---- Donante -------------------------------------------------------

export interface DatosDonante {
  nombre: string;
  cedula: string;
  cat: IdCategoria;
  cantidad: number;
}

const PIELES = ['#8D5A3C', '#C68B63', '#E2B48F', '#6B4430'];
const ROPAS = [COLOR.petroleo, COLOR.coral, '#86B5A9', '#B8432A', '#5E86BF'];

export class Donante {
  readonly grupo = new Group();
  /** Tarjeta de donante (se puede agarrar). */
  readonly tarjeta = new Group();
  paciencia: number;
  private barra = new Lienzo(300, 50, 0.24);

  constructor(
    readonly datos: DatosDonante,
    readonly total: number,
    n: number,
  ) {
    this.paciencia = total;
    const piel = new MeshStandardMaterial({ color: PIELES[n % PIELES.length], roughness: 0.9 });
    const ropa = new MeshStandardMaterial({ color: ROPAS[n % ROPAS.length], roughness: 0.9 });
    const pantalon = new MeshStandardMaterial({ color: COLOR.carbon, roughness: 0.9 });
    const piernas = new Mesh(new CylinderGeometry(0.12, 0.1, 0.75, 12), pantalon);
    piernas.position.y = 0.375;
    const torso = new Mesh(new CylinderGeometry(0.15, 0.13, 0.6, 14), ropa);
    torso.position.y = 1.05;
    const cabeza = new Mesh(new SphereGeometry(0.11, 16, 12), piel);
    cabeza.position.y = 1.48;
    // Brazos hacia adelante con la caja de su donación.
    const caja = crearCaja(true);
    caja.solapas.visible = false;
    caja.tapa.visible = true;
    caja.raiz.scale.setScalar(0.85);
    caja.raiz.position.set(0, 0.92, 0.22);
    for (const lado of [-1, 1]) {
      const brazo = new Mesh(new CylinderGeometry(0.035, 0.035, 0.32, 8), ropa);
      brazo.rotation.x = Math.PI / 2.4;
      brazo.position.set(lado * 0.15, 1.02, 0.12);
      this.grupo.add(brazo);
    }
    this.grupo.add(piernas, torso, cabeza, caja.raiz, sombra(0.5, 0.5, 0.35));
    this.barra.malla.position.set(0, 1.72, 0);
    this.grupo.add(this.barra.malla);

    // Tarjeta física: nombre, cédula y lo que dona.
    const placa = new Mesh(new BoxGeometry(0.15, 0.1, 0.004), new MeshStandardMaterial({ color: '#FFFFFF', roughness: 0.8 }));
    const texto = new Lienzo(600, 400, 0.145);
    texto.malla.position.z = 0.0025;
    const { ctx } = texto;
    ctx.fillStyle = COLOR.rojo;
    ctx.fillRect(0, 0, 600, 80);
    ctx.fillStyle = '#FFFFFF';
    ctx.font = `900 40px ${FUENTE}`;
    ctx.textAlign = 'center';
    ctx.fillText('TARJETA DE DONANTE', 300, 55);
    ctx.textAlign = 'left';
    ctx.fillStyle = COLOR.azul;
    ctx.font = `700 46px ${FUENTE}`;
    ctx.fillText(datos.nombre, 30, 160);
    ctx.font = `400 40px ${FUENTE}`;
    ctx.fillText(`Cédula: ${datos.cedula}`, 30, 240);
    ctx.fillText(`Dona: ${datos.cantidad} ${CATEGORIAS.find((c) => c.id === datos.cat)!.corto.toLowerCase()}`, 30, 320);
    texto.listo();
    this.tarjeta.add(placa, texto.malla);
    this.pintarBarra();
  }

  pintarBarra(): void {
    const l = this.barra;
    const k = Math.max(0, this.paciencia / this.total);
    l.limpiar();
    l.ctx.fillStyle = 'rgba(1,30,65,0.35)';
    rect(l.ctx, 0, 8, 300, 34, 17);
    l.ctx.fill();
    l.ctx.fillStyle = k > 0.5 ? COLOR.verde : k > 0.25 ? COLOR.naranja : COLOR.rojo;
    rect(l.ctx, 4, 12, Math.max(26, 292 * k), 26, 13);
    l.ctx.fill();
    l.listo();
  }
}

/** Nombres inventados (sin datos reales). */
export const NOMBRES = [
  'Ana Ruiz',
  'Luis Mora',
  'Sofia Diaz',
  'Juan Rojas',
  'Marta Gil',
  'Pedro Velez',
  'Laura Cano',
  'Diego Paz',
  'Rosa Leon',
  'Ivan Soto',
  'Nora Peña',
  'Hugo Lara',
  'Eva Rios',
  'Tomas Gil',
  'Clara Mejia',
  'Raul Ospina',
];

/** Compara sin tildes, mayúsculas ni espacios de más. */
export function normalizar(t: string): string {
  return t
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
}
