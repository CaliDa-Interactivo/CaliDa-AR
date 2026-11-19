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
import { partesDe } from './objetos.js';

/** Medidas del mueble en sus propias unidades (js/estanteria3d.js de la página). */
const MUEBLE = { ancho: 6.15, alto: 5.412, fondo: -0.567, frente: 0.8 };
const COMPARTIMIENTOS: Record<IdCategoria, { x0: number; x1: number; y0: number; y1: number; frente?: number }> = {
  alimentos: { x0: -2.743, x1: -0.123, y0: 3.797, y1: 5.079 },
  agua: { x0: 0.123, x1: 2.743, y0: 3.797, y1: 5.079 },
  ropa: { x0: -2.743, x1: -0.123, y0: 2.198, y1: 3.582 },
  cobijas: { x0: 0.123, x1: 2.743, y0: 2.198, y1: 3.582 },
  // El de Construcción de la página, partido en dos.
  higiene: { x0: -2.743, x1: -0.06, y0: 0.332, y1: 1.983, frente: 0.86 },
  panales: { x0: 0.06, x1: 2.743, y0: 0.332, y1: 1.983, frente: 0.86 },
};
/** Ancho real de la estantería sobre la mesa (m). */
export const ANCHO_REPISA = 0.84;
const S = ANCHO_REPISA / MUEBLE.ancho;
export const ALTO_REPISA = MUEBLE.alto * S;
const POR_LINEA = 15;
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

class Placa {
  readonly malla: Mesh;
  private ctx: CanvasRenderingContext2D;
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
    this.textura.anisotropy = 4;
    this.malla = new Mesh(new PlaneGeometry(ancho, alto), new MeshBasicMaterial({ map: this.textura, transparent: true }));
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
}

// ---- Estantería ------------------------------------------------------

export class Repisa {
  readonly grupo = new Group();
  readonly cantidades: number[] = CATEGORIAS.map(() => 0);
  readonly danados: number[] = CATEGORIAS.map(() => 0);
  /** Volumen invisible de cada compartimiento (para tocarlo y resaltarlo). */
  readonly zonas: Mesh[] = [];
  private bloques: InstancedMesh[][] = [];
  private placas: Placa[] = [];
  private estados: (string | null)[] = [];
  private v = new Vector3();

  constructor() {
    this.armarMueble();
    CATEGORIAS.forEach((cat, i) => {
      const c = COMPARTIMIENTOS[cat.id];
      const ancho = (c.x1 - c.x0) * S;
      const alto = (c.y1 - c.y0) * S;
      const fondo = (frenteDe(c) - MUEBLE.fondo) * S;
      // Zona del compartimiento (invisible; se ilumina al soltar algo).
      const zona = new Mesh(
        new BoxGeometry(ancho, alto, fondo),
        new MeshBasicMaterial({ color: '#FFFFFF', transparent: true, opacity: 0, depthWrite: false }),
      );
      zona.position.set(((c.x0 + c.x1) / 2) * S, ((c.y0 + c.y1) / 2) * S, ((frenteDe(c) + MUEBLE.fondo) / 2) * S);
      zona.userData.sinContorno = true;
      zona.userData.categoria = i;
      this.grupo.add(zona);
      this.zonas.push(zona);
      // Objetos de la fila, en bloque.
      const matriz = new Matrix4();
      const escala = new Matrix4().makeScale(ESCALA_REPISA, ESCALA_REPISA, ESCALA_REPISA);
      const fila: InstancedMesh[] = [];
      for (const parte of partesDe(cat.id)) {
        const bloque = new InstancedMesh(parte.geometria, parte.material, TOPE);
        bloque.frustumCulled = false;
        for (let k = 0; k < TOPE; k++) {
          this.puesto(i, k, this.v);
          matriz.makeTranslation(this.v.x, this.v.y, this.v.z).multiply(escala).multiply(parte.matriz);
          bloque.setMatrixAt(k, matriz);
        }
        bloque.count = 0;
        bloque.userData.sinContorno = true;
        this.grupo.add(bloque);
        fila.push(bloque);
      }
      this.bloques.push(fila);
      // Placa de madera clavada al frente de la tabla de abajo (como la página).
      const anchoPlaca = Math.min(1.55, (c.x1 - c.x0) * 0.62) * S;
      const placa = new Placa(anchoPlaca, 0.25 * S);
      placa.malla.position.set(((c.x0 + c.x1) / 2) * S, yTabla(c) * S, (frenteDe(c) + 0.035) * S);
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
    // Tabla que divide el compartimiento ancho de abajo (Higiene | Pañales).
    const c = COMPARTIMIENTOS.higiene;
    const tabla = new Mesh(new BoxGeometry(0.12 * S, (c.y1 - c.y0) * S, (0.86 - MUEBLE.fondo) * S), madera);
    tabla.position.set(0, ((c.y0 + c.y1) / 2) * S, ((0.86 + MUEBLE.fondo) / 2) * S);
    this.grupo.add(tabla);
  }

  /** Punto (en la repisa) del puesto k de la fila i: 2 líneas de 15. */
  puesto(i: number, k: number, salida: Vector3): Vector3 {
    const c = COMPARTIMIENTOS[CATEGORIAS[i].id];
    const linea = Math.floor(k / POR_LINEA);
    const ancho = (c.x1 - c.x0) * S;
    const paso = (ancho - 0.02) / POR_LINEA;
    const frente = frenteDe(c) * S;
    return salida.set(c.x0 * S + 0.01 + paso * ((k % POR_LINEA) + 0.5), c.y0 * S, frente - (linea === 0 ? 0.04 : 0.095));
  }

  lleno(i: number): boolean {
    return this.cantidades[i] >= TOPE;
  }

  /** Pone un objeto en el siguiente puesto libre. false si está llena. */
  agregar(i: number, danado: boolean): boolean {
    if (this.lleno(i)) {
      return false;
    }
    this.cantidades[i]++;
    if (danado) {
      this.danados[i]++;
    }
    this.mostrar(i);
    return true;
  }

  /** Saca el último objeto de la fila; puede salir uno dañado que alguien dejó. */
  quitar(i: number): { danado: boolean } | null {
    if (this.cantidades[i] <= 0) {
      return null;
    }
    const danado = this.danados[i] > 0 && Math.random() < this.danados[i] / this.cantidades[i];
    if (danado) {
      this.danados[i]--;
    }
    this.cantidades[i]--;
    this.mostrar(i);
    return { danado };
  }

  fijar(cantidades: number[]): void {
    cantidades.forEach((n, i) => {
      this.cantidades[i] = Math.min(TOPE, n);
      this.danados[i] = 0;
      this.mostrar(i);
    });
  }

  /** Pone las cantidades exactas (las que manda el anfitrión). */
  fijarExacto(cantidades: number[], danados: number[]): void {
    cantidades.forEach((n, i) => {
      const m = Math.max(0, Math.min(TOPE, n));
      if (m !== this.cantidades[i] || danados[i] !== this.danados[i]) {
        this.cantidades[i] = m;
        this.danados[i] = Math.max(0, Math.min(m, danados[i] ?? 0));
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
    for (const b of this.bloques[i]) {
      b.count = this.cantidades[i];
    }
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
      this.placas[i].escribir(cat.corto, `${n}/${TOPE}`, color, this.estados[i] ?? null);
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
