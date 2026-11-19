// ============================================================
// ui.ts — paneles dibujados en canvas y botones físicos 3D.
// Los botones se presionan EMPUJANDO con la punta del índice: se
// hunden 1,5 cm, cambian de color, suenan y (con controles) vibran.
// Todo el texto en Roboto (tipografía del proyecto).
// ============================================================
import {
  BoxGeometry,
  CanvasTexture,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  SRGBColorSpace,
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

const GROSOR = 0.02;
export const HUNDIDO_MAX = 0.015;

export class Boton3D {
  /** Se mueve y gira con su panel; su cara mira hacia +Z. */
  readonly grupo = new Group();
  readonly cuerpo: Mesh;
  private material: MeshStandardMaterial;
  private cara: Lienzo;
  private texto = '';
  private _activo = true;
  /** Si es false, el botón ni se ve ni se presiona. */
  get activo(): boolean {
    return this._activo;
  }
  set activo(valor: boolean) {
    this._activo = valor;
    this.grupo.visible = valor;
  }
  /** Bloqueado: se ve gris; al empujarlo llama a alBloqueado. */
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
    private color: string = COLOR.rojo,
    private colorTexto: string = COLOR.crema,
  ) {
    this.material = new MeshStandardMaterial({ color, roughness: 0.75 });
    this.cuerpo = new Mesh(new BoxGeometry(anchoM, altoM, GROSOR), this.material);
    this.cuerpo.position.z = GROSOR / 2;
    const px = 512;
    this.cara = new Lienzo(px, Math.max(64, Math.round((px * altoM) / anchoM)), anchoM * 0.96);
    this.cara.malla.position.z = GROSOR / 2 + 0.0008;
    this.cara.malla.renderOrder = 12;
    this.cuerpo.add(this.cara.malla);
    this.grupo.add(this.cuerpo);
    this.escribir(texto);
  }

  escribir(texto: string, color?: string): void {
    if (color) {
      this.color = color;
    }
    this.texto = texto;
    const { ctx } = this.cara;
    this.cara.limpiar();
    ctx.fillStyle = this.bloqueado ? '#5E5953' : this.colorTexto;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    textoAjustado(ctx, texto, this.cara.ancho / 2, this.cara.alto / 2 + 2, this.cara.ancho - 30, Math.min(64, this.cara.alto * 0.55));
    this.cara.listo();
    this.pintar(0);
  }

  bloquear(bloqueado: boolean): void {
    if (bloqueado !== this.bloqueado) {
      this.bloqueado = bloqueado;
      this.escribir(this.texto);
    }
  }

  /** Color según el estado (y un brillo corto al presionarlo). */
  pintar(tiempo: number): void {
    const base = this.bloqueado ? COLOR.gris : this.color;
    this.material.color.set(base);
    if (tiempo - this.tocadoEn < 0.25) {
      this.material.color.offsetHSL(0, 0, 0.18);
    }
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

  /** Hunde el cuerpo (z local del dedo respecto a la cara del botón). */
  hundir(cantidad: number): void {
    this.hundido = Math.max(0, Math.min(HUNDIDO_MAX, cantidad));
    this.cuerpo.position.z = GROSOR / 2 - this.hundido;
  }

  get grosor(): number {
    return GROSOR;
  }
}
