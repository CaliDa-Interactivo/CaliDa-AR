// ============================================================
// repisa.ts — la repisa de madera del centro de acopio.
// Seis compartimientos (2 columnas × 3 pisos), uno por categoría,
// cada uno con 30 puestos: 2 líneas × 15, uno al lado del otro,
// como un restock de supermercado. Los objetos de la repisa se
// dibujan en bloque (InstancedMesh): pocas mallas aunque haya 180.
// Contador por fila: "18 / 30", naranja desde 25 y rojo al llenarse.
// ============================================================
import {
  BoxGeometry,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Vector3,
} from '@iwsdk/core';
import { ALERTA, CATEGORIAS, COLOR, TOPE, type IdCategoria } from './datos.js';
import { partesDe } from './objetos.js';
import { Lienzo, textoAjustado } from './ui.js';

const ANCHO = 0.45; // ancho interior de un compartimiento
const ALTO = 0.125; // alto interior
const FONDO = 0.1;
const TABLA = 0.015;
const POR_LINEA = 15;
/** Escala de los objetos dentro de la repisa. */
export const ESCALA_REPISA = 0.47;
/** Orden: piso de arriba Alimentos y Agua; medio Ropa y Cobijas; abajo Higiene y Pañales. */
const LUGAR: Record<IdCategoria, [col: number, piso: number]> = {
  alimentos: [0, 2],
  agua: [1, 2],
  ropa: [0, 1],
  cobijas: [1, 1],
  higiene: [0, 0],
  panales: [1, 0],
};

export const ALTO_REPISA = TABLA + 3 * (ALTO + TABLA);
export const ANCHO_REPISA = 2 * ANCHO + 3 * TABLA;

const madera = new MeshStandardMaterial({ color: COLOR.madera, roughness: 0.85 });
const maderaFondo = new MeshStandardMaterial({ color: '#8E4F2C', roughness: 0.9 });

export class Repisa {
  readonly grupo = new Group();
  readonly cantidades: number[] = CATEGORIAS.map(() => 0);
  readonly danados: number[] = CATEGORIAS.map(() => 0);
  /** Volumen invisible de cada compartimiento (para tocarlo y resaltarlo). */
  readonly zonas: Mesh[] = [];
  private bloques: InstancedMesh[][] = [];
  private letreros: Lienzo[] = [];
  private v = new Vector3();

  constructor() {
    this.armarMueble();
    CATEGORIAS.forEach((cat, i) => {
      const [cx, base] = this.esquina(cat.id);
      // Zona del compartimiento.
      const zona = new Mesh(
        new BoxGeometry(ANCHO, ALTO, FONDO),
        new MeshBasicMaterial({ color: '#FFFFFF', transparent: true, opacity: 0, depthWrite: false }),
      );
      zona.position.set(cx, base + ALTO / 2, 0);
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
      // Letrero con el contador, en la pared del fondo del compartimiento.
      const letrero = new Lienzo(512, 96, 0.2);
      letrero.malla.position.set(cx, base + ALTO - 0.022, -FONDO / 2 + 0.006);
      this.grupo.add(letrero.malla);
      this.letreros.push(letrero);
    });
    this.pintar();
  }

  private armarMueble(): void {
    const tabla = (w: number, h: number, d: number, x: number, y: number, z: number, m = madera) => {
      const malla = new Mesh(new BoxGeometry(w, h, d), m);
      malla.position.set(x, y, z);
      this.grupo.add(malla);
    };
    for (let piso = 0; piso <= 3; piso++) {
      tabla(ANCHO_REPISA, TABLA, FONDO, 0, TABLA / 2 + piso * (ALTO + TABLA), 0);
    }
    for (const x of [-1, 0, 1]) {
      tabla(TABLA, ALTO_REPISA, FONDO, x * (ANCHO + TABLA), ALTO_REPISA / 2, 0);
    }
    tabla(ANCHO_REPISA, ALTO_REPISA, 0.008, 0, ALTO_REPISA / 2, -FONDO / 2 + 0.004, maderaFondo);
  }

  /** Centro en x y base en y del compartimiento de esa categoría. */
  private esquina(id: IdCategoria): [number, number] {
    const [col, piso] = LUGAR[id];
    return [(col === 0 ? -1 : 1) * (ANCHO / 2 + TABLA / 2), TABLA + piso * (ALTO + TABLA)];
  }

  /** Punto (en la repisa) del puesto k de la fila i. */
  puesto(i: number, k: number, salida: Vector3): Vector3 {
    const [cx, base] = this.esquina(CATEGORIAS[i].id);
    const linea = Math.floor(k / POR_LINEA);
    const paso = (ANCHO - 0.02) / POR_LINEA;
    return salida.set(cx - ANCHO / 2 + 0.01 + paso * ((k % POR_LINEA) + 0.5), base, linea === 0 ? 0.022 : -0.018);
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
      const l = this.letreros[i];
      const n = this.cantidades[i];
      const color = n >= TOPE ? COLOR.rojo : n >= ALERTA ? COLOR.naranja : COLOR.azul;
      const { ctx } = l;
      l.limpiar();
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.roundRect(4, 4, l.ancho - 8, l.alto - 8, 40);
      ctx.fill();
      ctx.fillStyle = COLOR.crema;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      textoAjustado(ctx, `${cat.corto}  ${n} / ${TOPE}${n >= TOPE ? '  llena' : ''}`, l.ancho / 2, l.alto / 2 + 2, l.ancho - 40, 52);
      l.listo();
    });
  }

  /** ¿En qué compartimiento queda ese punto (coordenadas de la repisa)? -1 si en ninguno. */
  categoriaEn(p: Vector3): number {
    for (let i = 0; i < CATEGORIAS.length; i++) {
      const [cx, base] = this.esquina(CATEGORIAS[i].id);
      if (
        Math.abs(p.x - cx) < ANCHO / 2 + 0.01 &&
        p.y > base - 0.03 &&
        p.y < base + ALTO + 0.02 &&
        p.z < FONDO / 2 + 0.22 &&
        p.z > -FONDO / 2 - 0.05
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

  /** Resalta un compartimiento (verde = se puede soltar, rojo = no). */
  resaltar(i: number, color: string | null): void {
    this.zonas.forEach((z, k) => {
      const m = z.material as MeshBasicMaterial;
      const activo = k === i && color !== null;
      m.opacity = activo ? 0.22 : 0;
      if (activo) {
        m.color.set(color!);
      }
    });
  }
}
