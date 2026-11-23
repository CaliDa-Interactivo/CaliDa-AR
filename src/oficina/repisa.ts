// ============================================================
// repisa.ts — la estantería del centro de acopio, como una GÓNDOLA
// de supermercado (imagen de referencia): postes y bandejas de metal
// claro, fondo de rejilla y cinco bandejas, una por categoría (de
// arriba a abajo: Alimento, Aseo, Ropa, Medicamentos, Construcción).
//
// En cada bandeja los productos van de frente, en fila y pegados uno
// al lado del otro, agrupados por producto (como en el súper); se
// llena primero la fila de adelante y después hacia atrás (3 filas).
// Cada producto tiene su etiqueta en el riel del borde de la bandeja
// (como las etiquetas de precio) y la placa de la categoría (nombre,
// n/30 y punto de estado, con el diseño de la página) va en la
// columna de letreros de la izquierda, a la altura de su bandeja.
// Los objetos se ven al doble (o más) del tamaño anterior y se
// dibujan en bloque (InstancedMesh, una por parte de cada producto).
// ============================================================
import {
  BoxGeometry,
  CanvasTexture,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  RepeatWrapping,
  SRGBColorSpace,
  Vector3,
} from '@iwsdk/core';
import { ALERTA, CATEGORIAS, TOPE, type IdCategoria } from './datos.js';
import { partesDe, tamDe } from './objetos.js';

/** Medidas de la góndola en metros (sin el achicado de la ergonomía). */
const G = {
  /** Ancho útil de las bandejas (donde van los productos). */
  ancho: 0.86,
  /** Fondo de cada bandeja. */
  fondo: 0.26,
  /** Distancia entre bandejas. */
  paso: 0.118,
  /** Altura de la primera bandeja sobre la mesa. */
  base: 0.035,
  /** Columna de letreros (placas de las categorías), a la izquierda. */
  columna: 0.17,
  poste: 0.022,
  /** Alto del riel de etiquetas al borde de cada bandeja. */
  riel: 0.03,
  grosor: 0.012,
};
/** Filas hacia atrás en cada bandeja. */
const FILAS = 3;
/** Orden de las bandejas, de arriba a abajo. */
const ORDEN: IdCategoria[] = ['alimento', 'aseo', 'ropa', 'medicamentos', 'construccion'];
const NIVELES = ORDEN.length;

/** Ancho total de la góndola (postes + columna de letreros + bandejas). */
export const ANCHO_REPISA = 3 * G.poste + G.columna + G.ancho;
const X_IZQ = -ANCHO_REPISA / 2;
/** Borde izquierdo y derecho de la zona de productos. */
const X_A = X_IZQ + 2 * G.poste + G.columna;
const X_B = X_A + G.ancho;
export const ALTO_REPISA = G.base + NIVELES * G.paso + G.grosor;
/** Altura de la bandeja de arriba sobre la mesa (para la ergonomía). */
const ALTURA_FILA_ARRIBA = G.base + (NIVELES - 1) * G.paso;
/** Profundidad de cada fila y frente de la bandeja. */
const FONDO_FILA = (G.fondo - 0.02) / FILAS;
const Z_FRENTE = G.fondo / 2;
/** Alto máximo de un producto en su bandeja. */
const ALTO_PRODUCTO = G.paso - G.grosor - 0.022;

/** Nivel (0 = abajo) de la bandeja de una categoría. */
const nivelDe = (id: IdCategoria) => NIVELES - 1 - ORDEN.indexOf(id);
/** Altura de la superficie de una bandeja. */
const ySuperficie = (nivel: number) => G.base + nivel * G.paso;

/** Metal claro de la góndola y bandejas, mates. */
const metal = new MeshStandardMaterial({ color: '#EEE9E1', roughness: 0.55, metalness: 0.15 });
const metalOscuro = new MeshStandardMaterial({ color: '#D9D2C6', roughness: 0.6, metalness: 0.15 });
const riel = new MeshStandardMaterial({ color: '#FFFFFF', roughness: 0.7, metalness: 0 });

/** Colores del punto de estado de la placa (los de la página). */
export const COLOR_ESTADO = { urgente: '#CC0100', desabastecido: '#F2C14E', medio: '#86B5A9', abastecido: '#B8AD9C' };

// ---- Placa de la página (texturaPlaca de js/estanteria3d.js) ----------

const FAMILIA = '"Roboto", "Segoe UI", Arial, sans-serif';

function redondeado(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Dibuja la placa: borde de madera, fondo crema, clavitos, punto de estado y texto. */
export function dibujarPlaca(
  ctx: CanvasRenderingContext2D,
  ancho: number,
  alto: number,
  texto: string,
  extra = '',
  colorExtra = '#426D8C',
  estado: string | null = null,
): void {
  ctx.clearRect(0, 0, ancho, alto);
  const radio = alto * 0.42;
  ctx.fillStyle = '#B9814F';
  redondeado(ctx, 0, 0, ancho, alto, radio);
  ctx.fill();
  const g = ctx.createLinearGradient(0, 0, 0, alto);
  g.addColorStop(0, '#FFFBF3');
  g.addColorStop(1, '#F6E7CF');
  ctx.fillStyle = g;
  redondeado(ctx, alto * 0.09, alto * 0.09, ancho - alto * 0.18, alto - alto * 0.18, radio * 0.8);
  ctx.fill();
  ctx.fillStyle = '#9A6A40';
  for (const x of [alto * 0.42, ancho - alto * 0.42]) {
    ctx.beginPath();
    ctx.arc(x, alto / 2, alto * 0.07, 0, Math.PI * 2);
    ctx.fill();
  }
  // Mayor letra con la que cabe (como fraccionMaxima de la página).
  const completo = extra ? `${texto}  ${extra}` : texto;
  let tam = alto * 0.5;
  const disponible = () => ancho - alto * 1.1 - (estado ? tam * 0.9 : 0);
  ctx.font = `700 ${tam}px ${FAMILIA}`;
  while (tam > alto * 0.2 && ctx.measureText(completo).width > disponible()) {
    tam -= alto * 0.01;
    ctx.font = `700 ${tam}px ${FAMILIA}`;
  }
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  const anchoBloque = ctx.measureText(completo).width + (estado ? tam * 0.9 : 0);
  const x0 = (ancho - anchoBloque) / 2;
  if (estado) {
    ctx.fillStyle = estado;
    ctx.beginPath();
    ctx.arc(x0 + tam * 0.3, alto / 2, tam * 0.28, 0, Math.PI * 2);
    ctx.fill();
  }
  const xTexto = x0 + (estado ? tam * 0.9 : 0);
  const y = alto / 2 + tam * 0.04;
  const nombre = extra ? `${texto}  ` : texto;
  ctx.fillStyle = '#011E41';
  ctx.fillText(nombre, xTexto, y);
  if (extra) {
    ctx.fillStyle = colorExtra;
    ctx.fillText(extra, xTexto + ctx.measureText(nombre).width, y);
  }
}

/** Placa de categoría en dos líneas (nombre arriba; punto de estado y n/30 abajo), para leerla de lejos. */
export function dibujarPlacaDoble(
  ctx: CanvasRenderingContext2D,
  ancho: number,
  alto: number,
  texto: string,
  extra: string,
  colorExtra: string,
  estado: string | null,
): void {
  ctx.clearRect(0, 0, ancho, alto);
  const radio = Math.min(alto, ancho) * 0.22;
  ctx.fillStyle = '#B9814F';
  redondeado(ctx, 0, 0, ancho, alto, radio);
  ctx.fill();
  const g = ctx.createLinearGradient(0, 0, 0, alto);
  g.addColorStop(0, '#FFFBF3');
  g.addColorStop(1, '#F6E7CF');
  ctx.fillStyle = g;
  const borde = Math.min(alto, ancho) * 0.06;
  redondeado(ctx, borde, borde, ancho - borde * 2, alto - borde * 2, radio * 0.8);
  ctx.fill();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  // Nombre: la mayor letra que quepa.
  let tam = alto * 0.36;
  ctx.font = `900 ${tam}px ${FAMILIA}`;
  while (tam > alto * 0.15 && ctx.measureText(texto).width > ancho * 0.86) {
    tam -= alto * 0.01;
    ctx.font = `900 ${tam}px ${FAMILIA}`;
  }
  ctx.fillStyle = '#011E41';
  ctx.fillText(texto, ancho / 2, alto * 0.33);
  // Contador (con el punto de estado a la izquierda).
  const tamN = alto * 0.34;
  ctx.font = `900 ${tamN}px ${FAMILIA}`;
  const anchoN = ctx.measureText(extra).width;
  const punto = estado ? tamN * 0.9 : 0;
  const x0 = (ancho - anchoN - punto) / 2;
  if (estado) {
    ctx.fillStyle = estado;
    ctx.beginPath();
    ctx.arc(x0 + tamN * 0.3, alto * 0.7, tamN * 0.28, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.textAlign = 'left';
  ctx.fillStyle = colorExtra;
  ctx.fillText(extra, x0 + punto, alto * 0.7);
}

/** Etiqueta de producto (como las de la página): mismo diseño, en una o dos líneas. */
export function dibujarEtiqueta(ctx: CanvasRenderingContext2D, ancho: number, alto: number, texto: string, tam: number): void {
  ctx.clearRect(0, 0, ancho, alto);
  const radio = Math.min(alto * 0.42, ancho * 0.2);
  ctx.fillStyle = '#B9814F';
  redondeado(ctx, 0, 0, ancho, alto, radio);
  ctx.fill();
  const g = ctx.createLinearGradient(0, 0, 0, alto);
  g.addColorStop(0, '#FFFBF3');
  g.addColorStop(1, '#F6E7CF');
  ctx.fillStyle = g;
  const borde = Math.min(alto, ancho) * 0.07;
  redondeado(ctx, borde, borde, ancho - borde * 2, alto - borde * 2, radio * 0.8);
  ctx.fill();
  ctx.font = `700 ${tam}px ${FAMILIA}`;
  ctx.fillStyle = '#011E41';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const filas = partirEnDos(ctx, texto, ancho * 0.88);
  const paso = tam * 1.05;
  filas.forEach((f, i) => ctx.fillText(f, ancho / 2, alto / 2 + (i - (filas.length - 1) / 2) * paso + tam * 0.04));
}

/** Parte el texto en una o dos líneas para que quepa en `ancho`. */
function partirEnDos(ctx: CanvasRenderingContext2D, texto: string, ancho: number): string[] {
  if (ctx.measureText(texto).width <= ancho) {
    return [texto];
  }
  const palabras = texto.split(' ');
  let mejor: string[] = [texto];
  let peor = Infinity;
  for (let i = 1; i < palabras.length; i++) {
    const a = palabras.slice(0, i).join(' ');
    const b = palabras.slice(i).join(' ');
    const m = Math.max(ctx.measureText(a).width, ctx.measureText(b).width);
    if (m < peor) {
      peor = m;
      mejor = [a, b];
    }
  }
  return mejor;
}

/** Mayor letra con la que cabe el texto (en una o dos líneas) en la etiqueta. */
function letraMaxima(texto: string, ancho: number, alto: number): number {
  const ctx = document.createElement('canvas').getContext('2d') as CanvasRenderingContext2D;
  for (let tam = alto * 0.62; tam > alto * 0.15; tam -= alto * 0.01) {
    ctx.font = `700 ${tam}px ${FAMILIA}`;
    const filas = partirEnDos(ctx, texto, ancho * 0.88);
    const cabe = filas.every((f) => ctx.measureText(f).width <= ancho * 0.88) && filas.length * tam * 1.05 <= alto * 0.8;
    if (cabe) {
      return tam;
    }
  }
  return alto * 0.15;
}

class Placa {
  readonly malla: Mesh;
  readonly ctx: CanvasRenderingContext2D;
  private textura: CanvasTexture;
  private clave = '';

  constructor(
    readonly ancho: number,
    readonly alto: number,
    /** Placa de categoría en dos líneas. */
    private doble = false,
  ) {
    const lienzo = document.createElement('canvas');
    lienzo.width = 1024;
    lienzo.height = Math.round((1024 * alto) / ancho);
    this.ctx = lienzo.getContext('2d') as CanvasRenderingContext2D;
    this.textura = new CanvasTexture(lienzo);
    this.textura.colorSpace = SRGBColorSpace;
    this.textura.anisotropy = 8;
    // Sin tone mapping: los colores y el contraste del texto quedan como en la página.
    this.malla = new Mesh(
      new PlaneGeometry(ancho, alto),
      new MeshBasicMaterial({ map: this.textura, transparent: true, toneMapped: false }),
    );
    this.malla.userData.sinContorno = true;
  }

  escribir(texto: string, extra: string, colorExtra: string, estado: string | null): void {
    const clave = `${texto}|${extra}|${colorExtra}|${estado}`;
    if (clave === this.clave) {
      return;
    }
    this.clave = clave;
    const c = this.ctx.canvas;
    (this.doble ? dibujarPlacaDoble : dibujarPlaca)(this.ctx, c.width, c.height, texto, extra, colorExtra, estado);
    this.textura.needsUpdate = true;
  }

  /** Etiqueta de producto con un tamaño de letra dado (en px del lienzo). */
  etiqueta(texto: string, tam: number): void {
    const c = this.ctx.canvas;
    dibujarEtiqueta(this.ctx, c.width, c.height, texto, tam);
    this.textura.needsUpdate = true;
  }
}

// ---- Góndola ----------------------------------------------------------

/** Acomodo de los productos de una categoría en su bandeja. */
interface Acomodo {
  /** Columnas (a lo ancho) de cada producto; las filas hacia atrás son FILAS. */
  cols: number;
  /** Ancho del grupo de cada producto y de cada columna. */
  anchoProducto: number;
  anchoCol: number;
  nivel: number;
  /** Escala de cada producto para caber en su puesto. */
  escalas: number[];
}

/** Rejilla del fondo (como la de la góndola de la referencia). */
function texturaRejilla(): CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d') as CanvasRenderingContext2D;
  ctx.fillStyle = '#F3EFE8';
  ctx.fillRect(0, 0, 64, 64);
  ctx.strokeStyle = '#CFC7BA';
  ctx.lineWidth = 5;
  ctx.strokeRect(0, 0, 64, 64);
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  t.wrapS = t.wrapT = RepeatWrapping;
  t.anisotropy = 8;
  return t;
}

export class Repisa {
  /** Altura de la bandeja de arriba (para la ergonomía). */
  readonly alturaFilaArriba = ALTURA_FILA_ARRIBA;
  /** Frente de la góndola (para poner el reloj y el gato). */
  readonly frente = Z_FRENTE;
  readonly grupo = new Group();
  readonly cantidades: number[] = CATEGORIAS.map(() => 0);
  readonly danados: number[] = CATEGORIAS.map(() => 0);
  /** Cuántos hay de cada producto (por categoría). */
  readonly porProducto: number[][] = CATEGORIAS.map((c) => c.subs.map(() => 0));
  /** Volumen invisible de cada bandeja (para tocarla y resaltarla). */
  readonly zonas: Mesh[] = [];
  private acomodos: Acomodo[] = [];
  private bloques: InstancedMesh[][][] = [];
  private placas: Placa[] = [];
  private estados: (string | null)[] = [];
  /** Productos que el multijugador espera ver aparecer (para no cambiar el modelo). */
  private preferidos: number[][] = CATEGORIAS.map(() => []);

  constructor() {
    this.armarGondola();
    // Todas las etiquetas de producto con la misma letra.
    const anchoEtiqueta = (n: number) => (G.ancho / n) * 0.92;
    const altoEtiqueta = G.riel * 0.92;
    const pxAlto = (ancho: number) => Math.round((1024 * altoEtiqueta) / ancho);
    let letra = Infinity;
    CATEGORIAS.forEach((cat) => {
      const a = anchoEtiqueta(cat.subs.length);
      for (const p of cat.subs) {
        letra = Math.min(letra, (letraMaxima(p.nombre, 1024, pxAlto(a)) / pxAlto(a)) * altoEtiqueta);
      }
    });

    CATEGORIAS.forEach((cat, i) => {
      const n = cat.subs.length;
      const nivel = nivelDe(cat.id);
      const porProducto = Math.ceil(TOPE / n);
      const cols = Math.ceil(porProducto / FILAS);
      const anchoProducto = G.ancho / n;
      const anchoCol = anchoProducto / cols;
      const escalas = cat.subs.map((_, s) => {
        const t = tamDe(cat.id, s);
        return Math.min(
          1.6,
          (anchoCol * 0.9) / Math.max(t.x, 0.001),
          (FONDO_FILA * 0.9) / Math.max(t.z, 0.001),
          ALTO_PRODUCTO / Math.max(t.y, 0.001),
        );
      });
      this.acomodos.push({ cols, anchoProducto, anchoCol, nivel, escalas });
      const y0 = ySuperficie(nivel);

      // Zona de la bandeja (invisible; se ilumina al soltar algo).
      const alto = G.paso - G.grosor;
      const zona = new Mesh(
        new BoxGeometry(G.ancho, alto, G.fondo),
        new MeshBasicMaterial({ color: '#FFFFFF', transparent: true, opacity: 0, depthWrite: false }),
      );
      zona.position.set((X_A + X_B) / 2, y0 + alto / 2, 0);
      zona.userData.sinContorno = true;
      zona.userData.categoria = i;
      this.grupo.add(zona);
      this.zonas.push(zona);

      // Objetos de cada producto, en bloque (uno por puesto).
      const cap = cols * FILAS;
      const matriz = new Matrix4();
      const v = new Vector3();
      const porSub: InstancedMesh[][] = [];
      cat.subs.forEach((p, s) => {
        const escala = new Matrix4().makeScale(escalas[s], escalas[s], escalas[s]);
        const bloquesSub: InstancedMesh[] = [];
        for (const parte of partesDe(cat.id, s)) {
          const bloque = new InstancedMesh(parte.geometria, parte.material, cap);
          bloque.frustumCulled = false;
          for (let j = 0; j < cap; j++) {
            this.puestoEn(i, s, j, v);
            matriz.makeTranslation(v.x, v.y, v.z).multiply(escala).multiply(parte.matriz);
            bloque.setMatrixAt(j, matriz);
          }
          bloque.count = 0;
          bloque.userData.sinContorno = true;
          this.grupo.add(bloque);
          bloquesSub.push(bloque);
        }
        porSub.push(bloquesSub);

        // Etiqueta del producto en el riel, bajo su grupo (como las de precio).
        const etiqueta = new Placa(anchoEtiqueta(n), altoEtiqueta);
        etiqueta.etiqueta(p.nombre, (letra / altoEtiqueta) * etiqueta.ctx.canvas.height);
        etiqueta.malla.position.set(X_A + anchoProducto * (s + 0.5), y0 - G.riel / 2, Z_FRENTE + 0.006);
        this.grupo.add(etiqueta.malla);
      });
      this.bloques.push(porSub);

      // Placa de la categoría en la columna de letreros, a la altura de su bandeja.
      const placa = new Placa(G.columna * 0.94, 0.084, true);
      placa.malla.position.set(X_IZQ + G.poste + G.columna / 2, y0 + G.paso * 0.4, Z_FRENTE + 0.006);
      this.grupo.add(placa.malla);
      this.placas.push(placa);
    });
    this.pintar();
  }

  /** Postes, bandejas, rieles, fondo de rejilla y columna de letreros. */
  private armarGondola(): void {
    const caja = (w: number, h: number, d: number, m: MeshStandardMaterial, x: number, y: number, z: number) => {
      const malla = new Mesh(new BoxGeometry(w, h, d), m);
      malla.position.set(x, y, z);
      this.grupo.add(malla);
    };
    const alto = ALTO_REPISA;
    // Postes (adelante y atrás) a la izquierda, entre letreros y bandejas, y a la derecha.
    for (const x of [X_IZQ + G.poste / 2, X_A - G.poste / 2, X_B + G.poste / 2]) {
      for (const z of [Z_FRENTE - G.poste / 2, -Z_FRENTE + G.poste / 2]) {
        caja(G.poste, alto, G.poste, metalOscuro, x, alto / 2, z);
      }
    }
    // Bandejas (con su riel de etiquetas al frente) y la tapa de arriba.
    for (let n = 0; n < NIVELES; n++) {
      const y = ySuperficie(n);
      caja(G.ancho, G.grosor, G.fondo, metal, (X_A + X_B) / 2, y - G.grosor / 2, 0);
      caja(G.ancho, G.riel, 0.008, riel, (X_A + X_B) / 2, y - G.riel / 2, Z_FRENTE);
    }
    caja(ANCHO_REPISA, G.grosor, G.fondo, metal, 0, alto - G.grosor / 2, 0);
    // Columna de letreros (tablero claro de frente).
    caja(G.columna, alto - G.grosor, 0.01, riel, X_IZQ + G.poste + G.columna / 2, (alto - G.grosor) / 2, Z_FRENTE - 0.012);
    // Fondo de rejilla.
    const rejilla = texturaRejilla();
    rejilla.repeat.set(ANCHO_REPISA / 0.035, alto / 0.035);
    const fondo = new Mesh(
      new PlaneGeometry(ANCHO_REPISA, alto),
      new MeshStandardMaterial({ map: rejilla, roughness: 0.7, metalness: 0.1 }),
    );
    fondo.position.set(0, alto / 2, -Z_FRENTE + 0.004);
    this.grupo.add(fondo);
  }

  /** Punto (coordenadas de la estantería) del puesto j del producto s: primero adelante, luego atrás. */
  private puestoEn(i: number, s: number, j: number, salida: Vector3): Vector3 {
    const a = this.acomodos[i];
    const fila = Math.floor(j / a.cols);
    const k = j % a.cols;
    const x = X_A + a.anchoProducto * s + a.anchoCol * (k + 0.5);
    return salida.set(x, ySuperficie(a.nivel), Z_FRENTE - 0.012 - FONDO_FILA * (fila + 0.5));
  }

  private capacidad(i: number): number {
    return this.acomodos[i].cols * FILAS;
  }

  /** Producto con más espacio libre en su columna. */
  private masLibre(i: number): number {
    const cuenta = this.porProducto[i];
    let mejor = 0;
    cuenta.forEach((n, s) => {
      if (n < cuenta[mejor]) {
        mejor = s;
      }
    });
    return mejor;
  }

  /** Producto con más objetos. */
  private masLleno(i: number): number {
    const cuenta = this.porProducto[i];
    let mejor = 0;
    cuenta.forEach((n, s) => {
      if (n > cuenta[mejor]) {
        mejor = s;
      }
    });
    return mejor;
  }

  /** Columna donde quedará un producto: la suya si tiene espacio; si no, la más libre. */
  columnaPara(i: number, sub: number): number {
    return this.porProducto[i][sub] !== undefined && this.porProducto[i][sub] < this.capacidad(i) ? sub : this.masLibre(i);
  }

  /** Puesto donde aparecerá el siguiente objeto de ese producto (para animar hasta allá). */
  siguientePuesto(i: number, sub: number, salida: Vector3): Vector3 {
    const s = this.columnaPara(i, sub);
    return this.puestoEn(i, s, Math.min(this.capacidad(i) - 1, this.porProducto[i][s]), salida);
  }

  /** Escala con que se ve un producto en la estantería (sin el achicado de la ergonomía). */
  escalaDe(i: number, sub: number): number {
    return this.acomodos[i].escalas[this.columnaPara(i, sub)] ?? 1;
  }

  /** Producto más cercano a un punto de la estantería. */
  productoEn(i: number, p: Vector3): number {
    const s = Math.floor((p.x - X_A) / this.acomodos[i].anchoProducto);
    return Math.max(0, Math.min(CATEGORIAS[i].subs.length - 1, s));
  }

  lleno(i: number): boolean {
    return this.cantidades[i] >= TOPE;
  }

  /** Pone un objeto en su columna. false si la categoría está llena. */
  agregar(i: number, danado: boolean, sub = -1): boolean {
    if (this.lleno(i)) {
      return false;
    }
    const s = sub >= 0 ? this.columnaPara(i, sub) : this.masLibre(i);
    this.porProducto[i][s]++;
    this.cantidades[i]++;
    if (danado) {
      this.danados[i]++;
    }
    this.mostrar(i);
    return true;
  }

  /** Saca un objeto (del producto pedido si hay); puede salir uno dañado que alguien dejó. */
  quitar(i: number, sub = -1): { danado: boolean; sub: number } | null {
    if (this.cantidades[i] <= 0) {
      return null;
    }
    const s = sub >= 0 && this.porProducto[i][sub] > 0 ? sub : this.masLleno(i);
    const danado = this.danados[i] > 0 && Math.random() < this.danados[i] / this.cantidades[i];
    if (danado) {
      this.danados[i]--;
    }
    this.porProducto[i][s] = Math.max(0, this.porProducto[i][s] - 1);
    this.cantidades[i]--;
    this.mostrar(i);
    return { danado, sub: s };
  }

  /** Reparte una cantidad entre los productos de la categoría (parejo). */
  private repartir(i: number, n: number): void {
    const cuenta = this.porProducto[i];
    let total = cuenta.reduce((a, b) => a + b, 0);
    while (total < n) {
      const pref = this.preferidos[i].shift();
      const s = pref !== undefined && cuenta[pref] < this.capacidad(i) ? pref : this.masLibre(i);
      cuenta[s]++;
      total++;
    }
    while (total > n) {
      cuenta[this.masLleno(i)]--;
      total--;
    }
  }

  fijar(cantidades: number[]): void {
    cantidades.forEach((n, i) => {
      this.cantidades[i] = Math.min(TOPE, n);
      this.danados[i] = 0;
      this.porProducto[i].fill(0);
      this.repartir(i, this.cantidades[i]);
      this.mostrar(i);
    });
  }

  /** El multijugador avisa qué producto se acaba de poner (para mostrar ese mismo). */
  preferir(i: number, sub: number): void {
    this.preferidos[i].push(sub);
  }

  /** Pone las cantidades exactas (las que manda el anfitrión). */
  fijarExacto(cantidades: number[], danados: number[]): void {
    cantidades.forEach((n, i) => {
      const m = Math.max(0, Math.min(TOPE, n));
      if (m !== this.cantidades[i] || danados[i] !== this.danados[i]) {
        this.cantidades[i] = m;
        this.danados[i] = Math.max(0, Math.min(m, danados[i] ?? 0));
        this.repartir(i, m);
        this.mostrar(i);
      }
    });
  }

  /** Estado de cada categoría (multijugador): el punto de color de la placa. */
  fijarEstados(colores: (string | null)[]): void {
    this.estados = colores;
    this.pintar();
  }

  private mostrar(i: number): void {
    const cap = this.capacidad(i);
    this.bloques[i].forEach((bloquesSub, s) => {
      for (const b of bloquesSub) {
        b.count = Math.min(cap, this.porProducto[i][s]);
      }
    });
    this.pintar(i);
  }

  private pintar(solo?: number): void {
    CATEGORIAS.forEach((cat, i) => {
      if (solo !== undefined && solo !== i) {
        return;
      }
      const n = this.cantidades[i];
      // Contador en azul petróleo como la página; naranja casi llena y rojo llena.
      const color = n >= TOPE ? '#CC0100' : n >= ALERTA ? '#C25E1E' : '#426D8C';
      this.placas[i].escribir(cat.nombre, `${n}/${TOPE}`, color, this.estados[i] ?? null);
    });
  }

  /** ¿En qué bandeja queda ese punto (coordenadas de la repisa)? -1 si en ninguna. */
  categoriaEn(p: Vector3): number {
    if (p.x < X_A - 0.02 || p.x > X_B + 0.02 || p.z > Z_FRENTE + 0.2 || p.z < -Z_FRENTE - 0.05) {
      return -1;
    }
    const nivel = Math.floor((p.y - G.base + 0.025) / G.paso);
    if (nivel < 0 || nivel >= NIVELES) {
      return -1;
    }
    return CATEGORIAS.findIndex((c) => c.id === ORDEN[NIVELES - 1 - nivel]);
  }

  /** Marca solo esa bandeja (blanco, verde o rojo; null lo apaga). */
  marcar(i: number, color: string | null): void {
    const m = this.zonas[i]?.material as MeshBasicMaterial | undefined;
    if (!m) {
      return;
    }
    m.opacity = color ? 0.22 : 0;
    if (color) {
      m.color.set(color);
    }
  }
}
