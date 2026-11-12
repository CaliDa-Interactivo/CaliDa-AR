// ============================================================
// texto.ts — letreros dibujados en un canvas (globo del gato,
// botón y etiqueta). Todo en Roboto, como la página de CaliDa.
// ============================================================
import {
  CanvasTexture,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  SRGBColorSpace,
} from '@iwsdk/core';
import { COLOR } from './datos.js';

const FUENTE = 'Roboto, "Segoe UI", Arial, sans-serif';

function rectRedondo(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function partirEnLineas(
  ctx: CanvasRenderingContext2D,
  texto: string,
  anchoMax: number,
): string[] {
  const lineas: string[] = [];
  for (const parrafo of texto.split('\n')) {
    let linea = '';
    for (const palabra of parrafo.split(' ')) {
      const prueba = linea ? `${linea} ${palabra}` : palabra;
      if (linea && ctx.measureText(prueba).width > anchoMax) {
        lineas.push(linea);
        linea = palabra;
      } else {
        linea = prueba;
      }
    }
    lineas.push(linea);
  }
  return lineas;
}

/** Un plano con una textura de canvas que se puede volver a escribir. */
export class Letrero {
  readonly malla: Mesh;
  protected readonly lienzo: HTMLCanvasElement;
  protected readonly ctx: CanvasRenderingContext2D;
  protected readonly textura: CanvasTexture;

  constructor(
    anchoPx: number,
    altoPx: number,
    /** Ancho del plano en metros (el alto sale de la proporción). */
    anchoM: number,
  ) {
    this.lienzo = document.createElement('canvas');
    this.lienzo.width = anchoPx;
    this.lienzo.height = altoPx;
    this.ctx = this.lienzo.getContext('2d') as CanvasRenderingContext2D;
    this.textura = new CanvasTexture(this.lienzo);
    this.textura.colorSpace = SRGBColorSpace;
    this.textura.anisotropy = 8;
    this.malla = new Mesh(
      new PlaneGeometry(anchoM, (anchoM * altoPx) / anchoPx),
      new MeshBasicMaterial({
        map: this.textura,
        transparent: true,
        toneMapped: false,
        depthWrite: false,
      }),
    );
    this.malla.renderOrder = 10;
  }

  protected listo(): void {
    this.textura.needsUpdate = true;
  }
}

/** Globo de diálogo del gato: título rojo y mensaje en azul. */
export class Globo extends Letrero {
  private titulo = '';
  private texto = '';

  constructor() {
    super(1024, 500, 0.56);
  }

  escribir(titulo: string, texto: string): void {
    this.titulo = titulo;
    this.texto = texto;
    this.dibujar();
  }

  /** Vuelve a dibujar (p. ej. cuando termina de cargar Roboto). */
  dibujar(): void {
    const { ctx, lienzo } = this;
    const w = lienzo.width;
    const h = lienzo.height;
    ctx.clearRect(0, 0, w, h);
    // Relieve mate: sombra abajo y panel crema.
    ctx.fillStyle = 'rgba(1, 30, 65, 0.22)';
    rectRedondo(ctx, 14, 22, w - 28, h - 30, 56);
    ctx.fill();
    ctx.fillStyle = COLOR.crema;
    rectRedondo(ctx, 14, 8, w - 28, h - 30, 56);
    ctx.fill();

    // Título y mensaje centrados (a lo ancho y a lo alto del globo).
    const margen = 62;
    const arriba = 8;
    const alto = h - 30;
    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'center';
    const altoTitulo = this.titulo ? 72 : 0;
    let tam = 50;
    let lineas: string[] = [];
    // Si el mensaje es largo, la letra baja un poco para que quepa.
    for (; tam >= 32; tam -= 3) {
      ctx.font = `400 ${tam}px ${FUENTE}`;
      lineas = partirEnLineas(ctx, this.texto, w - margen * 2);
      if (altoTitulo + lineas.length * tam * 1.3 < alto - 70) {
        break;
      }
    }
    const altoBloque = altoTitulo + lineas.length * tam * 1.3;
    let y = arriba + (alto - altoBloque) / 2;
    if (this.titulo) {
      ctx.fillStyle = COLOR.rojo;
      ctx.font = `900 58px ${FUENTE}`;
      ctx.fillText(this.titulo, w / 2, y + 50, w - margen * 2);
      y += altoTitulo;
    }
    ctx.fillStyle = COLOR.azul;
    ctx.font = `400 ${tam}px ${FUENTE}`;
    for (const linea of lineas) {
      ctx.fillText(linea, w / 2, y + tam * 0.95);
      y += tam * 1.3;
    }
    this.listo();
  }
}

/** Botón en pastilla (rojo con texto crema), del mismo material mate. */
export class PastillaBoton extends Letrero {
  private texto = '';

  constructor() {
    super(640, 176, 0.3);
  }

  escribir(texto: string): void {
    this.texto = texto;
    this.dibujar();
  }

  dibujar(): void {
    const { ctx, lienzo } = this;
    const w = lienzo.width;
    const h = lienzo.height;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = COLOR.rojoProfundo;
    rectRedondo(ctx, 8, 20, w - 16, h - 28, (h - 28) / 2);
    ctx.fill();
    ctx.fillStyle = COLOR.rojo;
    rectRedondo(ctx, 8, 6, w - 16, h - 28, (h - 28) / 2);
    ctx.fill();
    ctx.fillStyle = COLOR.crema;
    ctx.font = `700 58px ${FUENTE}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(this.texto, w / 2, (h - 28) / 2 + 10);
    this.listo();
  }
}

/** Etiqueta pequeña con el nombre de un producto o de un refugio. */
export class Etiqueta extends Letrero {
  private texto = '';
  private fondo: string = COLOR.azul;

  constructor(anchoM = 0.2) {
    super(512, 120, anchoM);
  }

  escribir(texto: string, fondo: string = COLOR.azul): void {
    this.texto = texto;
    this.fondo = fondo;
    this.dibujar();
  }

  dibujar(): void {
    const { ctx, lienzo } = this;
    const w = lienzo.width;
    const h = lienzo.height;
    ctx.clearRect(0, 0, w, h);
    // Si el texto es largo, la letra baja hasta que quepa (sin apretarla).
    let tam = 46;
    ctx.font = `700 ${tam}px ${FUENTE}`;
    while (tam > 22 && ctx.measureText(this.texto).width > w - 80) {
      tam -= 2;
      ctx.font = `700 ${tam}px ${FUENTE}`;
    }
    const ancho = Math.min(w - 8, ctx.measureText(this.texto).width + 72);
    ctx.fillStyle = this.fondo;
    rectRedondo(ctx, (w - ancho) / 2, 12, ancho, h - 24, (h - 24) / 2);
    ctx.fill();
    ctx.fillStyle = COLOR.crema;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(this.texto, w / 2, h / 2 + 3, w - 60);
    this.listo();
  }
}
