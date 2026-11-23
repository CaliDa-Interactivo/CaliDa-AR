// ============================================================
// repisa.ts — la estantería del centro de acopio, la MISMA de la
// página de CaliDa: el mueble estanteria.glb, su madera (#B87048)
// y las placas de madera clavadas al frente de cada compartimiento
// (fondo crema, borde de madera, dos clavitos, texto azul #011E41
// en Roboto y el contador en azul petróleo #426D8C).
//
// Seis categorías: arriba Alimentos y Agua; al medio Ropa y
// Cobijas; abajo Higiene y Pañales (el compartimiento ancho de
// abajo de la página se divide en dos con una tabla).
// Cada una con 30 puestos (2 líneas × 15). Los objetos de la
// repisa se dibujan en bloque (InstancedMesh).
// ============================================================
import {
  AssetManager,
  BoxGeometry,
  CanvasTexture,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  SRGBColorSpace,
  Vector3,
} from '@iwsdk/core';
import { ALERTA, CATEGORIAS, TOPE, type IdCategoria } from './datos.js';
import { partesDe, tamDe } from './objetos.js';

/** Medidas del mueble en sus propias unidades (js/estanteria3d.js de la página). */
const MUEBLE = { ancho: 6.15, alto: 5.412, fondo: -0.567, frente: 0.8 };
const COMPARTIMIENTOS: Record<IdCategoria, { x0: number; x1: number; y0: number; y1: number; frente?: number }> = {
  alimento: { x0: -2.743, x1: -0.123, y0: 3.797, y1: 5.079 },
  aseo: { x0: 0.123, x1: 2.743, y0: 3.797, y1: 5.079 },
  ropa: { x0: -2.743, x1: -0.123, y0: 2.198, y1: 3.582 },
  medicamentos: { x0: 0.123, x1: 2.743, y0: 2.198, y1: 3.582 },
  construccion: { x0: -2.743, x1: 2.743, y0: 0.332, y1: 1.983, frente: 0.86 },
};
/** Ancho real de la estantería sobre la mesa (m). */
export const ANCHO_REPISA = 0.84;
const S = ANCHO_REPISA / MUEBLE.ancho;
export const ALTO_REPISA = MUEBLE.alto * S;
const POR_LINEA = 15;
/** Altura de la tabla de la fila de arriba sobre la base (m, sin achicar). */
const ALTURA_FILA_ARRIBA = 3.797 * (ANCHO_REPISA / 6.15);
/** Escala de los objetos dentro de la repisa. */
export const ESCALA_REPISA = 0.5;

/** Madera de la página (ajustes de oct 2026, 16): un solo tono, mate. */
const madera = new MeshStandardMaterial({ color: '#B87048', emissive: '#4E2A14', roughness: 0.95, metalness: 0 });

const frenteDe = (c: { frente?: number }) => c.frente ?? MUEBLE.frente;
/** Centro de la tabla de abajo de cada compartimiento (donde se clava la placa). */
const yTabla = (c: { y0: number; frente?: number }) => (c.frente ? c.y0 / 2 : c.y0 - 0.108);

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
    dibujarPlaca(this.ctx, c.width, c.height, texto, extra, colorExtra, estado);
    this.textura.needsUpdate = true;
  }

  /** Etiqueta de producto con un tamaño de letra dado (en px del lienzo). */
  etiqueta(texto: string, tam: number): void {
    const c = this.ctx.canvas;
    dibujarEtiqueta(this.ctx, c.width, c.height, texto, tam);
    this.textura.needsUpdate = true;
  }
}

// ---- Estantería ------------------------------------------------------
//
// Cada compartimiento tiene una columna por producto (como la página),
// con su etiqueta clavada al frente de la tabla de abajo y la placa de
// la categoría (con su contador n/30) colgada al frente, arriba. Los objetos
// se acomodan como cajas en bodega: primero se llena la fila de adelante
// y después las de atrás (con 30 se ven filas hacia el fondo).

/** Medidas del acomodo de un compartimiento (unidades del mueble salvo donde se dice). */
interface Acomodo {
  /** Puestos a lo ancho de cada columna, pisos (uno encima del otro) y filas hacia atrás. */
  ancho: number;
  pisos: number;
  filas: number;
  colAncho: number;
  altoPiso: number;
  /** Fondo útil del compartimiento. */
  fondo: number;
  zFrente: number;
  /** Escala de cada producto y su fondo ya escalado (m). */
  escalas: number[];
  fondos: number[];
}

/** Productos grandes: hasta 2 pisos y las filas que hagan falta hacia atrás (como en bodega). */
const PISOS = 2;

/** Alto de las etiquetas y placas (unidades del mueble); algo más que en la página para leerlas en RA. */
const ALTO_ETIQUETA = 0.3;

export class Repisa {
  /** Altura de la fila de arriba (para la ergonomía). */
  readonly alturaFilaArriba = ALTURA_FILA_ARRIBA;
  readonly grupo = new Group();
  readonly cantidades: number[] = CATEGORIAS.map(() => 0);
  readonly danados: number[] = CATEGORIAS.map(() => 0);
  /** Cuántos hay de cada producto (por categoría). */
  readonly porProducto: number[][] = CATEGORIAS.map((c) => c.subs.map(() => 0));
  /** Volumen invisible de cada compartimiento (para tocarlo y resaltarlo). */
  readonly zonas: Mesh[] = [];
  private acomodos: Acomodo[] = [];
  private bloques: InstancedMesh[][][] = [];
  private placas: Placa[] = [];
  private estados: (string | null)[] = [];
  /** Productos que el multijugador espera ver aparecer (para no cambiar el modelo). */
  private preferidos: number[][] = CATEGORIAS.map(() => []);

  constructor() {
    this.armarMueble();
    // Todas las etiquetas de producto con la misma letra (como la página).
    let letra = Infinity;
    const pxAlto = (anchoU: number) => Math.round((1024 * ALTO_ETIQUETA) / anchoU);
    CATEGORIAS.forEach((cat) => {
      const c = COMPARTIMIENTOS[cat.id];
      const anchoU = ((c.x1 - c.x0) / cat.subs.length) * 0.92;
      for (const p of cat.subs) {
        letra = Math.min(letra, (letraMaxima(p.nombre, 1024, pxAlto(anchoU)) / pxAlto(anchoU)) * ALTO_ETIQUETA);
      }
    });

    CATEGORIAS.forEach((cat, i) => {
      const c = COMPARTIMIENTOS[cat.id];
      const n = cat.subs.length;
      // Productos grandes (el doble que antes): uno de frente por columna
      // (tres en Construcción, que es más ancha), dos pisos y el resto hacia
      // atrás; los de atrás quedan detrás de los de adelante, como en bodega.
      const ancho = cat.id === 'construccion' ? 3 : 1;
      const pisos = PISOS;
      const filas = Math.ceil(Math.ceil(TOPE / n) / (ancho * pisos));
      const colAncho = (c.x1 - c.x0) / n;
      const zFrente = frenteDe(c) - 0.06;
      const fondoU = zFrente - (MUEBLE.fondo + 0.04);
      const altoU = c.y1 - c.y0;
      const altoPiso = (altoU * 0.78) / pisos;
      const escalas = cat.subs.map((_, s) => {
        const t = tamDe(cat.id, s);
        return Math.min(
          1.8,
          ((colAncho / ancho) * 0.9 * S) / Math.max(t.x, 0.001),
          (altoPiso * 0.95 * S) / Math.max(t.y, 0.001),
          (fondoU * 0.9 * S) / Math.max(t.z, 0.001),
        );
      });
      const fondos = cat.subs.map((_, s) => tamDe(cat.id, s).z * escalas[s]);
      const acomodo: Acomodo = { ancho, pisos, filas, colAncho, altoPiso, fondo: fondoU, zFrente, escalas, fondos };
      this.acomodos.push(acomodo);

      // Zona del compartimiento (invisible; se ilumina al soltar algo).
      const zona = new Mesh(
        new BoxGeometry((c.x1 - c.x0) * S, altoU * S, (frenteDe(c) - MUEBLE.fondo) * S),
        new MeshBasicMaterial({ color: '#FFFFFF', transparent: true, opacity: 0, depthWrite: false }),
      );
      zona.position.set(((c.x0 + c.x1) / 2) * S, ((c.y0 + c.y1) / 2) * S, ((frenteDe(c) + MUEBLE.fondo) / 2) * S);
      zona.userData.sinContorno = true;
      zona.userData.categoria = i;
      this.grupo.add(zona);
      this.zonas.push(zona);

      // Objetos de cada producto, en bloque (uno por puesto de su columna).
      const cap = ancho * pisos * filas;
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

        // Etiqueta del producto clavada al frente de la tabla de abajo, bajo su columna.
        const etiqueta = new Placa(colAncho * 0.92 * S, ALTO_ETIQUETA * S);
        etiqueta.etiqueta(p.nombre, (letra / ALTO_ETIQUETA) * etiqueta.ctx.canvas.height);
        etiqueta.malla.position.set((c.x0 + colAncho * (s + 0.5)) * S, yTabla(c) * S, (frenteDe(c) + 0.035) * S);
        this.grupo.add(etiqueta.malla);
      });
      this.bloques.push(porSub);

      // Placa de la categoría (con su contador) colgada al frente, arriba del
      // compartimiento (los productos no llegan tan alto, así siempre se lee).
      const placa = new Placa(Math.min(1.7, (c.x1 - c.x0) * 0.66) * S, ALTO_ETIQUETA * S);
      placa.malla.position.set(((c.x0 + c.x1) / 2) * S, (c.y1 - ALTO_ETIQUETA * 0.6) * S, (frenteDe(c) + 0.05) * S);
      this.grupo.add(placa.malla);
      this.placas.push(placa);
    });
    this.pintar();
  }

  private armarMueble(): void {
    const gltf = AssetManager.getGLTF('estanteria');
    if (gltf) {
      const mueble = gltf.scene;
      mueble.scale.setScalar(S);
      mueble.traverse((o) => {
        const m = o as Mesh;
        if (m.isMesh) {
          m.material = madera;
        }
      });
      this.grupo.add(mueble);
    }
  }

  /**
   * Punto (coordenadas de la estantería) del puesto j del producto s: primero
   * la fila de adelante (abajo y luego encima), después las de atrás.
   */
  private puestoEn(i: number, s: number, j: number, salida: Vector3): Vector3 {
    const c = COMPARTIMIENTOS[CATEGORIAS[i].id];
    const a = this.acomodos[i];
    const porFila = a.ancho * a.pisos;
    const fila = Math.floor(j / porFila);
    const resto = j % porFila;
    const piso = Math.floor(resto / a.ancho);
    const k = resto % a.ancho;
    const x = c.x0 + a.colAncho * s + (a.colAncho / a.ancho) * (k + 0.5);
    const fondo = a.fondos[s] ?? 0;
    const paso = a.filas > 1 ? Math.max(0, (a.fondo * S - fondo) / (a.filas - 1)) : 0;
    return salida.set(x * S, (c.y0 + piso * a.altoPiso) * S, a.zFrente * S - fondo / 2 - paso * fila);
  }

  private capacidad(i: number): number {
    const a = this.acomodos[i];
    return a.ancho * a.pisos * a.filas;
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

  /** Producto (columna) más cercano a un punto de la estantería; -1 si fuera de la categoría. */
  productoEn(i: number, p: Vector3): number {
    const c = COMPARTIMIENTOS[CATEGORIAS[i].id];
    const s = Math.floor((p.x / S - c.x0) / this.acomodos[i].colAncho);
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

  /** ¿En qué compartimiento queda ese punto (coordenadas de la repisa)? -1 si en ninguno. */
  categoriaEn(p: Vector3): number {
    for (let i = 0; i < CATEGORIAS.length; i++) {
      const c = COMPARTIMIENTOS[CATEGORIAS[i].id];
      if (
        p.x > c.x0 * S - 0.01 &&
        p.x < c.x1 * S + 0.01 &&
        p.y > c.y0 * S - 0.03 &&
        p.y < c.y1 * S + 0.02 &&
        p.z < frenteDe(c) * S + 0.22 &&
        p.z > MUEBLE.fondo * S - 0.05
      ) {
        return i;
      }
    }
    return -1;
  }

  /** Marca solo ese compartimiento (blanco, verde o rojo; null lo apaga). */
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
