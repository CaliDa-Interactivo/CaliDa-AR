// ============================================================
// panel.ts — el panel de la izquierda (en la pantalla del monitor): campana con
// el número rojo de avisos pendientes, día y hora, y una lista de
// avisos con UN botón de acción cada uno:
//   · "Llegaron 3 cajas"                   → Recibidas
//   · "Pedido: Tuluá necesita…"            → Aceptar (y elegir el municipio)
//   · "URGENTE · Lluvias en Buenaventura"  → Aceptar (reloj corto)
// Al aceptar un pedido se abre la lista de municipios del Valle del
// Cauca; se elige presionando con el dedo.
// ============================================================
import { Group } from '@iwsdk/core';
import { CATEGORIAS, COLOR, MUNICIPIOS, nombreProducto, type IdCategoria } from './datos.js';
import type { Aviso, Pedido } from './modelo.js';
import { BOTON, Boton3D, FUENTE, Lienzo, fondoPanel, lineas, rect, textoAjustado } from './ui.js';

const PX_ANCHO = 1100;
const PX_ALTO = 850;
export const ANCHO_PANEL = 0.44;
export const ALTO_PANEL = (ANCHO_PANEL * PX_ALTO) / PX_ANCHO;
const S = ANCHO_PANEL / PX_ANCHO; // metros por píxel
const TARJETAS = 3;
const Y_TARJETA = 150;
const ALTO_TARJETA = 205;

const ESTILO: Record<string, { fondo: string; texto: string; titulo: string }> = {
  cajas: { fondo: COLOR.petroleo, texto: COLOR.crema, titulo: 'DONACIONES' },
  pedido: { fondo: COLOR.amarillo, texto: COLOR.azul, titulo: 'PEDIDO' },
  urgente: { fondo: '#FCE8E8', texto: COLOR.rojoProfundo, titulo: 'URGENTE' },
  alerta: { fondo: '#FCE8E8', texto: COLOR.rojoProfundo, titulo: 'ALERTA' },
  entrega: { fondo: COLOR.verde, texto: '#FFFFFF', titulo: 'ENTREGADO' },
  donante: { fondo: '#DCE8F0', texto: COLOR.azul, titulo: 'DONANTE' },
};


/** "Higiene bucal 1/2 · Agua 0/3" (por producto, no por categoría). */
export function textoPedido(p: Pedido, conLleva: boolean): string {
  return Object.entries(p.pide)
    .map(([id, n]) => (conLleva ? `${nombreProducto(id)} ${p.lleva[id] ?? 0}/${n}` : `${n} ${nombreProducto(id).toLowerCase()}`))
    .join(conLleva ? ' · ' : ' y ');
}

export function reloj(seg: number): string {
  const s = Math.max(0, Math.ceil(seg));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export class Panel {
  readonly grupo = new Group();
  readonly botonesAviso: Boton3D[] = [];
  /** Segundo botón de cada tarjeta ("Rechazar" para los donantes). */
  readonly botonesRechazo: Boton3D[] = [];
  /** Pestañas (multijugador): botones arriba de la pantalla, como un navegador. */
  readonly pestanas: Boton3D[] = [];
  pestana = 0;
  alPestana: (k: number) => void = () => undefined;
  alRechazo: (aviso: Aviso) => void = () => undefined;
  readonly botonesMunicipio: Boton3D[] = [];
  readonly volver: Boton3D;
  readonly mover: Boton3D;
  readonly recalibrar: Boton3D;
  readonly saltar: Boton3D;
  modo: 'avisos' | 'municipios' = 'avisos';
  /** El pedido al que se le está eligiendo el municipio. */
  eligiendo: Pedido | null = null;
  alAccion: (aviso: Aviso) => void = () => undefined;
  alMunicipio: (nombre: string) => void = () => undefined;
  private lienzo = new Lienzo(PX_ANCHO, PX_ALTO, ANCHO_PANEL);
  private visibles: Aviso[] = [];
  private mensaje = '';
  private mensajeHasta = 0;

  constructor() {
    this.grupo.add(this.lienzo.malla);
    // Botón de acción de cada tarjeta (a la derecha de la tarjeta).
    for (let i = 0; i < TARJETAS; i++) {
      const b = new Boton3D('Aceptar', 0.105, 0.042);
      b.activo = false; // se prende al pintar una tarjeta con acción
      this.colocar(b, 945, Y_TARJETA + i * (ALTO_TARJETA + 12) + ALTO_TARJETA / 2);
      b.alPresionar = () => {
        const aviso = this.visibles[i];
        if (aviso && aviso.estado === 'pendiente' && aviso.accion) {
          this.alAccion(aviso);
        }
      };
      this.botonesAviso.push(b);
    }
    // Segundo botón de cada tarjeta (Rechazar), debajo del de acción.
    for (let i = 0; i < TARJETAS; i++) {
      const b = new Boton3D('Rechazar', 0.105, 0.034, BOTON.peligro);
      b.activo = false;
      this.colocar(b, 945, Y_TARJETA + i * (ALTO_TARJETA + 12) + ALTO_TARJETA / 2 + 50);
      b.alPresionar = () => {
        const aviso = this.visibles[i];
        if (aviso && aviso.estado === 'pendiente' && aviso.rechazo) {
          this.alRechazo(aviso);
        }
      };
      this.botonesRechazo.push(b);
    }
    // Lista de municipios: 3 columnas × 6 filas.
    MUNICIPIOS.forEach((nombre, i) => {
      const b = new Boton3D(nombre, 0.128, 0.038, BOTON.secundario);
      const col = i % 3;
      const fila = Math.floor(i / 3);
      this.colocar(b, 200 + col * 350, 205 + fila * 100);
      b.alPresionar = () => this.alMunicipio(nombre);
      this.botonesMunicipio.push(b);
    });
    this.volver = new Boton3D('Volver', 0.1, 0.036, BOTON.secundario);
    this.colocar(this.volver, 960, 800);
    this.volver.alPresionar = () => this.verAvisos();
    // Debajo del monitor, delante de su pie (el menú): mover la oficina, recalibrar la altura y saltar el tutorial.
    const yMenu = -ALTO_PANEL / 2 - 0.05;
    this.mover = new Boton3D('Mover oficina', 0.135, 0.036, BOTON.secundario);
    this.mover.grupo.position.set(-0.145, yMenu, 0.09);
    this.recalibrar = new Boton3D('Recalibrar altura', 0.145, 0.036, BOTON.secundario);
    this.recalibrar.grupo.position.set(0, yMenu, 0.09);
    this.saltar = new Boton3D('Saltar tutorial', 0.135, 0.036, BOTON.secundario);
    this.saltar.grupo.position.set(0.145, yMenu, 0.09);
    // Estos tres botones ya no van debajo del monitor (se pidió quitarlos):
    // quedan ocultos (no se pueden presionar); el multijugador puede ponerlos
    // en su formulario.
    for (const b of [this.mover, this.recalibrar, this.saltar]) {
      b.grupo.visible = false;
    }
    this.verAvisos();
  }

  get todosLosBotones(): Boton3D[] {
    return [
      ...this.botonesAviso,
      ...this.botonesRechazo,
      ...this.botonesMunicipio,
      ...this.pestanas,
      this.volver,
      this.mover,
      this.recalibrar,
      this.saltar,
    ];
  }

  /**
   * Dos pestañas arriba de la pantalla, como en un navegador (multijugador):
   * la 0 es la de avisos (donantes o pedidos) y la 1 la del chat.
   */
  usarPestanas(nombres: [string, string]): void {
    nombres.forEach((nombre, k) => {
      const b = new Boton3D(nombre, 0.13, 0.034, k === 0 ? BOTON.principal : BOTON.secundario);
      this.colocar(b, 330 + k * 340, 62);
      b.alPresionar = () => this.cambiarPestana(k);
      this.pestanas.push(b);
    });
  }

  cambiarPestana(k: number): void {
    if (this.pestana === k) {
      return;
    }
    this.pestana = k;
    this.pestanas.forEach((b, i) => b.escribir(b.texto, i === k ? BOTON.principal : BOTON.secundario));
    this.alPestana(k);
  }

  /** ¿Se está viendo la pestaña del chat? */
  get enChat(): boolean {
    return this.pestanas.length > 0 && this.pestana === 1;
  }

  private colocar(b: Boton3D, px: number, py: number): void {
    b.grupo.position.set((px - PX_ANCHO / 2) * S, (PX_ALTO / 2 - py) * S, 0.004);
    this.grupo.add(b.grupo);
  }

  verAvisos(): void {
    this.modo = 'avisos';
    this.eligiendo = null;
    this.botonesMunicipio.forEach((b) => (b.activo = false));
    this.volver.activo = false;
  }

  elegirMunicipio(p: Pedido): void {
    this.modo = 'municipios';
    this.eligiendo = p;
    this.botonesAviso.forEach((b) => (b.activo = false));
    this.botonesMunicipio.forEach((b) => (b.activo = true));
    this.volver.activo = true;
  }

  avisar(texto: string, tiempo: number): void {
    this.mensaje = texto;
    this.mensajeHasta = tiempo + 4;
  }

  /** Vuelve a dibujar (unas 5 veces por segundo basta). */
  pintar(avisos: Aviso[], pendientes: number, dia: string, hora: string, tiempo: number): void {
    const l = this.lienzo;
    const { ctx } = l;
    fondoPanel(l);
    // Encabezado: campana con número rojo, día y hora.
    this.campana(ctx, 70, 72, pendientes > 0 && Math.sin(tiempo * 8) > 0.6);
    if (pendientes > 0) {
      ctx.fillStyle = COLOR.rojo;
      ctx.beginPath();
      ctx.arc(108, 42, 26, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#FFFFFF';
      ctx.font = `900 34px ${FUENTE}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(pendientes), 108, 44);
    }
    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'left';
    ctx.fillStyle = COLOR.azul;
    if (this.pestanas.length) {
      // Barra de pestañas (los botones van encima) y la hora.
      ctx.fillStyle = '#E8E1D5';
      rect(ctx, 150, 22, PX_ANCHO - 200, 82, 22);
      ctx.fill();
      ctx.fillStyle = COLOR.azul;
      ctx.textAlign = 'right';
      ctx.font = `700 30px ${FUENTE}`;
      ctx.fillText(hora, PX_ANCHO - 70, 76);
    } else {
      ctx.font = `900 46px ${FUENTE}`;
      ctx.fillText(this.modo === 'avisos' ? 'Avisos' : 'Destino del pedido', 150, 88);
      ctx.textAlign = 'right';
      ctx.font = `700 36px ${FUENTE}`;
      ctx.fillText(`${dia} · ${hora}`, PX_ANCHO - 50, 86);
    }
    // Pestaña del chat: el chat se dibuja encima; aquí no va nada más.
    const enChat = this.enChat;
    this.botonesMunicipio.forEach((b) => (b.activo = !enChat && this.modo === 'municipios'));
    this.volver.activo = !enChat && this.modo === 'municipios';
    if (enChat) {
      this.botonesAviso.forEach((b) => (b.activo = false));
      this.botonesRechazo.forEach((b) => (b.activo = false));
      l.listo();
      return;
    }

    if (this.modo === 'municipios') {
      const p = this.eligiendo;
      ctx.textAlign = 'left';
      ctx.font = `400 30px ${FUENTE}`;
      ctx.fillStyle = COLOR.carbon;
      ctx.fillText(p ? `Elige el municipio del pedido (${p.municipio} pidió ${textoPedido(p, false)}).` : '', 50, 140, PX_ANCHO - 100);
      this.pie(ctx, tiempo);
      l.listo();
      return;
    }

    this.visibles = avisos.slice(0, TARJETAS);
    this.botonesAviso.forEach((b, i) => {
      const a = this.visibles[i];
      b.activo = !!a && a.estado === 'pendiente' && !!a.accion;
      if (b.activo && a.accion) {
        if (b.texto !== a.accion) {
          b.escribir(a.accion);
        }
        // Con dos botones, el de acción sube un poco.
        const y = Y_TARJETA + i * (ALTO_TARJETA + 12) + ALTO_TARJETA / 2 + (a.rechazo ? -46 : 0);
        this.colocar(b, 945, y);
      }
    });
    this.botonesRechazo.forEach((b, i) => {
      const a = this.visibles[i];
      b.activo = !!a && a.estado === 'pendiente' && !!a.rechazo;
    });
    if (this.visibles.length === 0) {
      ctx.textAlign = 'center';
      ctx.fillStyle = COLOR.gris;
      ctx.font = `400 34px ${FUENTE}`;
      ctx.fillText('Sin avisos por ahora', PX_ANCHO / 2, 420);
    }
    this.visibles.forEach((a, i) => this.tarjeta(ctx, a, Y_TARJETA + i * (ALTO_TARJETA + 12), tiempo));
    this.pie(ctx, tiempo);
    l.listo();
  }

  private pie(ctx: CanvasRenderingContext2D, tiempo: number): void {
    if (this.mensaje && tiempo < this.mensajeHasta) {
      ctx.fillStyle = COLOR.rojo;
      rect(ctx, 40, PX_ALTO - 92, PX_ANCHO - (this.modo === 'municipios' ? 290 : 80), 62, 30);
      ctx.fill();
      ctx.fillStyle = '#FFFFFF';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      textoAjustado(ctx, this.mensaje, (PX_ANCHO - (this.modo === 'municipios' ? 210 : 0)) / 2, PX_ALTO - 60, PX_ANCHO - 340, 32, 700);
      ctx.textBaseline = 'alphabetic';
    }
  }

  private tarjeta(ctx: CanvasRenderingContext2D, a: Aviso, y: number, tiempo: number): void {
    const p = a.pedido;
    const tipo = p && (p.urgente || p.tarde) && a.tipo === 'pedido' ? 'urgente' : a.tipo;
    const estilo = ESTILO[tipo];
    const parpadea = tipo === 'urgente' && a.estado === 'pendiente' && Math.sin(tiempo * 7) > 0.3;
    ctx.fillStyle = parpadea ? COLOR.rojo : estilo.fondo;
    rect(ctx, 30, y, PX_ANCHO - 60, ALTO_TARJETA, 30);
    ctx.fill();
    const colorTexto = parpadea ? '#FFFFFF' : estilo.texto;
    ctx.fillStyle = colorTexto;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.font = `900 28px ${FUENTE}`;
    ctx.fillText(a.estado === 'hecho' ? `✓ HECHO` : estilo.titulo, 60, y + 46);
    ctx.font = `700 36px ${FUENTE}`;
    const ancho = a.estado === 'pendiente' && a.accion ? PX_ANCHO - 400 : PX_ANCHO - 130;
    const d = a.donante;
    if (d) {
      // Tarjeta del donante: toda la información y su paciencia.
      ctx.font = `900 34px ${FUENTE}`;
      ctx.fillText(d.nombre, 60, y + 88, ancho);
      ctx.font = `400 28px ${FUENTE}`;
      const cat = CATEGORIAS.find((c) => c.id === d.cat)?.nombre ?? d.cat;
      ctx.fillText(`Cédula ${d.cedula} · Dona ${d.cantidad} de ${cat}`, 60, y + 128, ancho);
      if (a.estado === 'pendiente') {
        const k = Math.max(0, Math.min(1, d.paciencia / Math.max(1, d.pacienciaMax)));
        ctx.fillStyle = 'rgba(1, 30, 65, 0.18)';
        rect(ctx, 60, y + ALTO_TARJETA - 44, ancho, 18, 9);
        ctx.fill();
        ctx.fillStyle = k < 0.3 ? COLOR.rojo : k < 0.6 ? COLOR.naranja : COLOR.verde;
        rect(ctx, 60, y + ALTO_TARJETA - 44, Math.max(18, ancho * k), 18, 9);
        ctx.fill();
        ctx.fillStyle = colorTexto;
        ctx.font = `700 22px ${FUENTE}`;
        ctx.fillText('Paciencia', 60, y + ALTO_TARJETA - 52);
      } else {
        ctx.font = `700 28px ${FUENTE}`;
        ctx.fillText(a.texto, 60, y + ALTO_TARJETA - 28, ancho);
      }
      return;
    }
    const texto = lineas(ctx, a.texto, ancho).slice(0, 2);
    texto.forEach((t, k) => ctx.fillText(t, 60, y + 96 + k * 44));
    // Reloj del pedido en curso.
    if (p && (p.estado === 'curso' || p.estado === 'elegir') && a.estado === 'pendiente') {
      const total = Math.max(1, p.plazo);
      const k = Math.max(0, Math.min(1, p.restante / total));
      ctx.fillStyle = 'rgba(1, 30, 65, 0.18)';
      rect(ctx, 60, y + ALTO_TARJETA - 38, ancho, 18, 9);
      ctx.fill();
      ctx.fillStyle = p.restante > 0 ? (k < 0.3 ? COLOR.naranja : COLOR.verde) : COLOR.rojo;
      rect(ctx, 60, y + ALTO_TARJETA - 38, Math.max(18, ancho * k), 18, 9);
      ctx.fill();
      ctx.fillStyle = colorTexto;
      ctx.font = `900 30px ${FUENTE}`;
      ctx.textAlign = 'right';
      ctx.fillText(p.restante > 0 ? reloj(p.restante) : 'TARDE', 60 + ancho, y + ALTO_TARJETA - 48);
    }
  }

  private campana(ctx: CanvasRenderingContext2D, x: number, y: number, sacude: boolean): void {
    ctx.save();
    ctx.translate(x, y);
    if (sacude) {
      ctx.rotate(0.25);
    }
    ctx.fillStyle = '#E8A93A';
    ctx.beginPath();
    ctx.moveTo(-30, 18);
    ctx.quadraticCurveTo(-28, -30, 0, -32);
    ctx.quadraticCurveTo(28, -30, 30, 18);
    ctx.closePath();
    ctx.fill();
    ctx.fillRect(-36, 14, 72, 10);
    ctx.beginPath();
    ctx.arc(0, 30, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}
