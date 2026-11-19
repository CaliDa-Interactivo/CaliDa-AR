// ============================================================
// ui.ts — paneles dibujados en canvas y botones físicos 3D.
// Los botones se presionan EMPUJANDO con la punta del índice: se
// hunden 1,5 cm, cambian de color, suenan y (con controles) vibran.
// Todo el texto en Roboto (tipografía del proyecto).
// ============================================================
import {
  CanvasTexture,
  Color,
  ExtrudeGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  SRGBColorSpace,
  Shape,
} from '@iwsdk/core';
import { COLOR } from './datos.js';

export const FUENTE = 'Roboto, "Segoe UI", Arial, sans-serif';

/** Un plano con textura de canvas para dibujar texto y formas. */
export class Lienzo {
  readonly lienzo: HTMLCanvasElement;
  readonly ctx: CanvasRenderingContext2D;
  readonly textura: CanvasTexture;
  readonly malla: Mesh;

  constructor(anchoPx: number, altoPx: number, anchoM: number) {
    this.lienzo = document.createElement('canvas');
    this.lienzo.width = anchoPx;
    this.lienzo.height = altoPx;
    this.ctx = this.lienzo.getContext('2d') as CanvasRenderingContext2D;
    this.textura = new CanvasTexture(this.lienzo);
    this.textura.colorSpace = SRGBColorSpace;
    this.textura.anisotropy = 8;
    this.malla = new Mesh(
      new PlaneGeometry(anchoM, (anchoM * altoPx) / anchoPx),
      new MeshBasicMaterial({ map: this.textura, transparent: true, toneMapped: false, depthWrite: false }),
    );
    this.malla.renderOrder = 10;
    this.malla.userData.sinContorno = true;
  }

  get ancho(): number {
    return this.lienzo.width;
  }

  get alto(): number {
    return this.lienzo.height;
  }

  limpiar(): void {
    this.ctx.clearRect(0, 0, this.ancho, this.alto);
  }

  listo(): void {
    this.textura.needsUpdate = true;
  }
}

export function rect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

/** Parte un texto en líneas que quepan en `anchoMax`. */
export function lineas(ctx: CanvasRenderingContext2D, texto: string, anchoMax: number): string[] {
  const salida: string[] = [];
  for (const parrafo of texto.split('\n')) {
    let linea = '';
    for (const palabra of parrafo.split(' ')) {
      const prueba = linea ? `${linea} ${palabra}` : palabra;
      if (linea && ctx.measureText(prueba).width > anchoMax) {
        salida.push(linea);
        linea = palabra;
      } else {
        linea = prueba;
      }
    }
    salida.push(linea);
  }
  return salida;
}

/** Escribe un texto centrado que baja de tamaño hasta caber. */
export function textoAjustado(
  ctx: CanvasRenderingContext2D,
  texto: string,
  x: number,
  y: number,
  anchoMax: number,
  tam: number,
  peso = 700,
  min = 18,
): void {
  let t = tam;
  ctx.font = `${peso} ${t}px ${FUENTE}`;
  while (t > min && ctx.measureText(texto).width > anchoMax) {
    t -= 2;
    ctx.font = `${peso} ${t}px ${FUENTE}`;
  }
  ctx.fillText(texto, x, y);
}

/** Panel de fondo crema con esquinas redondeadas y relieve. */
export function fondoPanel(l: Lienzo, color: string = COLOR.crema): void {
  const { ctx } = l;
  l.limpiar();
  ctx.fillStyle = 'rgba(1, 30, 65, 0.25)';
  rect(ctx, 6, 14, l.ancho - 12, l.alto - 18, 36);
  ctx.fill();
  ctx.fillStyle = color;
  rect(ctx, 6, 4, l.ancho - 12, l.alto - 18, 36);
  ctx.fill();
}

// ---- Botón físico 3D -------------------------------------------------
//
// Igual a los botones de la página (css/tema.css): píldora "gordita" y
// mate, con un degradado vertical (más claro arriba, más oscuro abajo),
// un brillo fino arriba (--relieve-claro) y una sombra interior abajo.
// Paleta del administrador: principal azul #1F5490 con texto crema;
// secundario crema con texto azul #12406E; peligro rojo #CC0100.

export const BOTON = {
  principal: '#1F5490',
  secundario: '#FFF8EC',
  peligro: '#CC0100',
  exito: '#3E7A6C',
  textoClaro: '#FFF6E6',
  textoOscuro: '#12406E',
  /** Botón deshabilitado de la página (.boton:disabled). */
  apagado: '#E8E1D5',
  textoApagado: '#6E655D',
};

const GROSOR = 0.014;
export const HUNDIDO_MAX = 0.015;

function luz(hex: string): number {
  const c = new Color(hex);
  return 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
}

function tono(hex: string, cambio: number): string {
  const c = new Color(hex);
  c.offsetHSL(0, 0, cambio);
  return `#${c.getHexString()}`;
}

/** Radio de las esquinas: píldora, o redondeado si el botón es casi cuadrado. */
const radioDe = (w: number, h: number) => Math.min(h / 2, w / 2) * (w < h * 1.4 ? 0.7 : 1);

function pildora(w: number, h: number): Shape {
  const r = radioDe(w, h);
  const s = new Shape();
  s.moveTo(-w / 2 + r, -h / 2);
  s.lineTo(w / 2 - r, -h / 2);
  s.absarc(w / 2 - r, -h / 2 + r, r, -Math.PI / 2, 0, false);
  s.lineTo(w / 2, h / 2 - r);
  s.absarc(w / 2 - r, h / 2 - r, r, 0, Math.PI / 2, false);
  s.lineTo(-w / 2 + r, h / 2);
  s.absarc(-w / 2 + r, h / 2 - r, r, Math.PI / 2, Math.PI, false);
  s.lineTo(-w / 2, -h / 2 + r);
  s.absarc(-w / 2 + r, -h / 2 + r, r, Math.PI, Math.PI * 1.5, false);
  return s;
}

export class Boton3D {
  /** Se mueve y gira con su panel; su cara mira hacia +Z. */
  readonly grupo = new Group();
  readonly cuerpo: Mesh;
  private material: MeshStandardMaterial;
  private cara: Lienzo;
  private texto = '';
  private icono: HTMLCanvasElement | null = null;
  private _activo = true;
  /** Si es false, el botón ni se ve ni se presiona. */
  get activo(): boolean {
    return this._activo;
  }
  set activo(valor: boolean) {
    this._activo = valor;
    this.grupo.visible = valor;
  }
  /** Bloqueado: se ve como el botón apagado de la página; al empujarlo llama a alBloqueado. */
  bloqueado = false;
  hundido = 0;
  /** Momento del último toque (para el brillo al presionar). */
  tocadoEn = -10;
  alPresionar: () => void = () => undefined;
  alBloqueado: () => void = () => undefined;

  constructor(
    texto: string,
    readonly anchoM: number,
    readonly altoM: number,
    private color: string = BOTON.principal,
    private colorTexto: string = luz(color) > 0.6 ? BOTON.textoOscuro : BOTON.textoClaro,
  ) {
    // Cuerpo: la píldora extruida con bordes redondeados (el "relieve").
    const geometria = new ExtrudeGeometry(pildora(anchoM, altoM), {
      depth: GROSOR * 0.5,
      bevelEnabled: true,
      bevelThickness: GROSOR * 0.25,
      bevelSize: Math.min(anchoM, altoM) * 0.06,
      bevelSegments: 3,
    });
    geometria.translate(0, 0, -GROSOR * 0.25);
    this.material = new MeshStandardMaterial({ color: tono(color, -0.08), roughness: 0.85, metalness: 0 });
    this.cuerpo = new Mesh(geometria, this.material);
    // Cara: el dibujo del botón de la página (degradado, brillo y texto).
    const px = 512;
    this.cara = new Lienzo(px, Math.max(64, Math.round((px * altoM) / anchoM)), anchoM);
    this.cara.malla.position.z = GROSOR * 0.75 + 0.0006;
    this.cara.malla.renderOrder = 12;
    this.cuerpo.add(this.cara.malla);
    this.grupo.add(this.cuerpo);
    this.escribir(texto);
  }

  /** Ícono (canvas) a la izquierda del texto, p. ej. la foto de un producto. */
  ponerIcono(icono: HTMLCanvasElement | null): void {
    this.icono = icono;
    this.escribir(this.texto);
  }

  escribir(texto: string, color?: string): void {
    if (color) {
      this.color = color;
      this.colorTexto = luz(color) > 0.6 ? BOTON.textoOscuro : BOTON.textoClaro;
    }
    this.texto = texto;
    const fondo = this.bloqueado ? BOTON.apagado : this.color;
    const { ctx } = this.cara;
    const w = this.cara.ancho;
    const h = this.cara.alto;
    const r = radioDe(w, h);
    this.cara.limpiar();
    // Relleno de la página: degradado vertical claro → color → oscuro.
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, tono(fondo, 0.05));
    g.addColorStop(0.55, fondo);
    g.addColorStop(1, tono(fondo, -0.05));
    ctx.fillStyle = g;
    rect(ctx, 0, 0, w, h, r);
    ctx.fill();
    // --relieve-claro: brillo fino arriba y sombra interior abajo.
    ctx.save();
    rect(ctx, 0, 0, w, h, r);
    ctx.clip();
    ctx.fillStyle = 'rgba(255, 255, 255, 0.55)';
    ctx.fillRect(0, 0, w, Math.max(2, h * 0.04));
    const sombra = ctx.createLinearGradient(0, h * 0.82, 0, h);
    sombra.addColorStop(0, 'rgba(18, 64, 110, 0)');
    sombra.addColorStop(1, 'rgba(18, 64, 110, 0.16)');
    ctx.fillStyle = sombra;
    ctx.fillRect(0, h * 0.82, w, h * 0.18);
    ctx.restore();
    // Ícono y texto (Roboto 700).
    ctx.fillStyle = this.bloqueado ? BOTON.textoApagado : this.colorTexto;
    ctx.textBaseline = 'middle';
    const tam = Math.min(64, h * 0.5);
    if (this.icono) {
      const lado = h * 0.8;
      ctx.font = `700 ${tam}px ${FUENTE}`;
      const anchoTexto = texto ? Math.min(w - lado - 70, ctx.measureText(texto).width) : 0;
      const x0 = (w - lado - (texto ? 14 + anchoTexto : 0)) / 2;
      ctx.drawImage(this.icono, x0, (h - lado) / 2, lado, lado);
      if (texto) {
        ctx.textAlign = 'left';
        textoAjustadoIzq(ctx, texto, x0 + lado + 14, h / 2 + 2, anchoTexto, tam);
      }
    } else {
      ctx.textAlign = 'center';
      textoAjustado(ctx, texto, w / 2, h / 2 + 2, w - Math.max(30, r * 0.8), tam);
    }
    this.cara.listo();
    this.material.color.set(tono(fondo, -0.08));
  }

  bloquear(bloqueado: boolean): void {
    if (bloqueado !== this.bloqueado) {
      this.bloqueado = bloqueado;
      this.escribir(this.texto);
    }
  }

  /** Un brillo corto al presionarlo. */
  pintar(tiempo: number): void {
    const m = this.cara.malla.material as MeshBasicMaterial;
    m.color.setScalar(tiempo - this.tocadoEn < 0.2 ? 0.82 : 1);
  }

  /** Visible en la escena (él y todos sus padres). */
  visibleEnEscena(): boolean {
    if (!this.activo) {
      return false;
    }
    let o: { visible: boolean; parent: unknown } | null = this.grupo;
    while (o) {
      if (!o.visible) {
        return false;
      }
      o = o.parent as typeof o;
    }
    return true;
  }

  /** Hunde el botón hasta 1,5 cm (lo que entró la punta del índice). */
  hundir(cantidad: number): void {
    this.hundido = Math.max(0, Math.min(HUNDIDO_MAX, cantidad));
    this.cuerpo.position.z = -this.hundido;
  }

  /** Distancia de la cara del botón a su base (para el toque con el índice). */
  get grosor(): number {
    return GROSOR * 0.75;
  }
}

function textoAjustadoIzq(ctx: CanvasRenderingContext2D, texto: string, x: number, y: number, ancho: number, tam: number): void {
  let t = tam;
  ctx.font = `700 ${t}px ${FUENTE}`;
  while (t > 18 && ctx.measureText(texto).width > ancho) {
    t -= 2;
    ctx.font = `700 ${t}px ${FUENTE}`;
  }
  ctx.fillText(texto, x, y);
}
