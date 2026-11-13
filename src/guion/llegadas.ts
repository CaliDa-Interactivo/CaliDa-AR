// ============================================================
// llegadas.ts — lo que llega al centro de acopio: 3 cajas
// cerradas con cinta y, dentro, los objetos sueltos que hay que
// poner en su repisa. Entre el 15 % y el 25 % vienen dañados
// (contorno rojo y etiqueta "vencido" o "roto") y van a la
// bandeja de descarte. Lo usan las escenas 5 y 6.
// ============================================================
import {
  BackSide,
  CanvasTexture,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  BoxGeometry,
  SRGBColorSpace,
  Vector3,
  type Entity,
} from '@iwsdk/core';
import { COLOR, PRODUCTOS, type Categoria } from '../datos.js';
import { CAJA, MUEBLE, crearCaja, crearProducto, type CajaArmada } from '../modelos.js';
import { Etiqueta } from '../texto.js';
import { OCULTO, type Contexto } from './contexto.js';
import { ANCHO_ESTANTERIA, POS_CENTRO_ACOPIO } from './maqueta.js';

/** Las cuatro categorías del MVP, con el nombre que va en la repisa. */
export const CATEGORIAS: { id: Categoria; nombre: string }[] = [
  { id: 'alimento', nombre: 'Alimento' },
  { id: 'aseo', nombre: 'Aseo' },
  { id: 'ropa', nombre: 'Ropa' },
  { id: 'medicamentos', nombre: 'Medicamentos' },
];
export const PUESTOS_POR_REPISA = 4;
const ESCALA_MUEBLE = ANCHO_ESTANTERIA / MUEBLE.ancho;
const ESCALA_CAJA = 0.62;
/** Donde se desempaca y donde espera la pila de cajas (en la maqueta). */
const POS_DESEMPAQUE = new Vector3(-0.01, 0, 0.22);
const POS_PILA = new Vector3(-0.68, 0, 0.3);
export const POS_BANDEJA = new Vector3(-0.4, 0, 0.33);

export type Dano = '' | 'roto' | 'vencido';

export interface Objeto {
  entidad: Entity;
  producto: number;
  categoria: Categoria;
  dano: Dano;
  /** Dónde está: en su caja, flotando sobre la caja abierta, o ya resuelto. */
  lugar: 'caja' | 'suelto' | 'repisa' | 'descarte';
  /** Punto al que vuelve si rebota. */
  casa: Vector3;
  caja: number;
}

interface CajaLlegada {
  entidad: Entity;
  armada: CajaArmada;
  cinta: Entity;
  abierta: boolean;
}

/** Azar con semilla fija: el lote sale igual cada vez. */
function azar(semilla: number): () => number {
  let s = semilla;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

let texturaSilueta: CanvasTexture | null = null;
function silueta(ancho: number, alto: number): Mesh {
  if (!texturaSilueta) {
    const lienzo = document.createElement('canvas');
    lienzo.width = 96;
    lienzo.height = 128;
    const ctx = lienzo.getContext('2d') as CanvasRenderingContext2D;
    ctx.strokeStyle = COLOR.crema;
    ctx.lineWidth = 6;
    ctx.setLineDash([12, 10]);
    ctx.beginPath();
    ctx.roundRect(8, 8, 80, 112, 16);
    ctx.stroke();
    texturaSilueta = new CanvasTexture(lienzo);
    texturaSilueta.colorSpace = SRGBColorSpace;
  }
  return new Mesh(
    new PlaneGeometry(ancho, alto),
    new MeshBasicMaterial({ map: texturaSilueta, transparent: true, depthWrite: false, toneMapped: false }),
  );
}

export class Llegadas {
  readonly cajas: CajaLlegada[] = [];
  readonly objetos: Objeto[] = [];
  /** Caja que se está desempacando (-1: ninguna). */
  actual = -1;
  private siluetas: Mesh[][] = [];
  private contadores: Etiqueta[] = [];
  private ocupados: number[] = [];
  /** Cuántos se han sacado de cada repisa para despachar. */
  private sacados: number[] = [];
  private resaltadas = new Set<Categoria>();
  private bandeja: Entity;
  private rojo = new MeshBasicMaterial({ color: COLOR.rojo, side: BackSide });
  private v = new Vector3();

  constructor(private c: Contexto) {
    const padre = c.maquetaEnt;
    // Siluetas punteadas y contador de cada repisa.
    CATEGORIAS.forEach((categoria, k) => {
      const comp = MUEBLE.compartimientos[categoria.id];
      const fila: Mesh[] = [];
      for (let i = 0; i < PUESTOS_POR_REPISA; i++) {
        const marca = silueta(0.046, 0.075);
        this.puesto(k, i, marca.position);
        marca.position.y += 0.042;
        marca.position.z -= 0.012;
        c.maqueta.raiz.add(marca);
        fila.push(marca);
      }
      this.siluetas.push(fila);
      const contador = new Etiqueta(0.15);
      contador.malla.position.set(
        POS_CENTRO_ACOPIO.x + ((comp.x0 + comp.x1) / 2) * ESCALA_MUEBLE,
        comp.y1 * ESCALA_MUEBLE - 0.012,
        POS_CENTRO_ACOPIO.z + 0.86 * ESCALA_MUEBLE + 0.004,
      );
      c.maqueta.raiz.add(contador.malla);
      this.contadores.push(contador);
      this.ocupados.push(0);
      this.sacados.push(0);
    });

    // Bandeja de descarte.
    const bandeja = new Group();
    const material = new MeshStandardMaterial({ color: COLOR.arena, roughness: 0.9 });
    const base = new Mesh(new BoxGeometry(0.2, 0.012, 0.15), material);
    base.position.y = 0.006;
    bandeja.add(base);
    for (const [x, z, w, d] of [[0, 0.07, 0.2, 0.01], [0, -0.07, 0.2, 0.01], [0.095, 0, 0.01, 0.15], [-0.095, 0, 0.01, 0.15]]) {
      const borde = new Mesh(new BoxGeometry(w, 0.03, d), material);
      borde.position.set(x, 0.021, z);
      bandeja.add(borde);
    }
    const letrero = new Etiqueta(0.16);
    letrero.escribir('Descarte', COLOR.rojoProfundo);
    letrero.malla.position.set(0, 0.014, 0.115);
    letrero.malla.rotation.x = -Math.PI / 2;
    bandeja.add(letrero.malla);
    bandeja.position.copy(POS_BANDEJA);
    this.bandeja = c.crear(bandeja, padre);

    // Las 3 cajas, apiladas, cada una con su cinta para tirar.
    for (let i = 0; i < 3; i++) {
      const armada = crearCaja(false); // sin logo: el guion no lo dibuja
      armada.raiz.scale.setScalar(ESCALA_CAJA);
      const entidad = c.crear(armada.raiz, padre);
      const tira = new Group();
      tira.add(new Mesh(new BoxGeometry(CAJA.ancho * 0.5, 0.012, 0.045), new MeshStandardMaterial({ color: COLOR.rojo, roughness: 0.8 })));
      const zona = new Mesh(
        new BoxGeometry(CAJA.ancho * 0.9, 0.07, CAJA.fondo * 0.9),
        new MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }),
      );
      tira.add(zona);
      const cinta = c.crear(tira, entidad);
      c.tocable(cinta, `cinta:${i}`, true);
      this.cajas.push({ entidad, armada, cinta, abierta: false });
    }
    this.repartir();
    this.reiniciar();
  }

  /** Arma el lote: 16 objetos buenos (4 por repisa) y 5 dañados, en 3 cajas. */
  private repartir(): void {
    const c = this.c;
    const lista: { producto: number; dano: Dano }[] = [];
    for (const categoria of CATEGORIAS) {
      const deEsta = PRODUCTOS.map((p, i) => ({ p, i })).filter(({ p }) => p.categoria === categoria.id);
      for (let k = 0; k < PUESTOS_POR_REPISA; k++) {
        lista.push({ producto: deEsta[k % deEsta.length].i, dano: '' });
      }
    }
    const danados: [string, Dano][] = [
      ['ropa-hombre', 'roto'],
      ['ropa-ninos', 'roto'],
      ['alimento-no-perecederos', 'vencido'],
      ['alimento-bebe', 'vencido'],
      ['medicamentos-analgesicos', 'vencido'],
    ];
    for (const [id, dano] of danados) {
      lista.push({ producto: PRODUCTOS.findIndex((p) => p.id === id), dano });
    }
    const r = azar(46);
    for (let i = lista.length - 1; i > 0; i--) {
      const j = Math.floor(r() * (i + 1));
      [lista[i], lista[j]] = [lista[j], lista[i]];
    }
    lista.forEach((item, n) => {
      const dato = PRODUCTOS[item.producto];
      const grupo = crearProducto(dato, 0.05, 0.085);
      if (item.dano) {
        // Contorno rojo: la misma malla, un poco más grande y vista por dentro.
        const mallas: Mesh[] = [];
        grupo.traverse((o) => {
          const m = o as Mesh;
          if (m.isMesh && (m.material as MeshBasicMaterial).opacity !== 0) {
            mallas.push(m);
          }
        });
        for (const m of mallas) {
          const contorno = new Mesh(m.geometry, this.rojo);
          contorno.scale.setScalar(1.12);
          m.add(contorno);
        }
        const etiqueta = new Etiqueta(0.085);
        etiqueta.escribir(item.dano, COLOR.rojo);
        etiqueta.malla.position.set(0, 0.105, 0);
        grupo.add(etiqueta.malla);
      }
      const entidad = c.crear(grupo, c.maquetaEnt);
      c.tocable(entidad, `objeto:${n}`, true);
      this.objetos.push({
        entidad,
        producto: item.producto,
        categoria: dato.categoria,
        dano: item.dano,
        lugar: 'caja',
        casa: new Vector3(),
        caja: n % 3,
      });
    });
  }

  /** Punto de un puesto de una repisa (k: categoría, i: puesto), en la maqueta. */
  puesto(k: number, i: number, salida: Vector3): Vector3 {
    const comp = MUEBLE.compartimientos[CATEGORIAS[k].id];
    const paso = (comp.x1 - comp.x0) / PUESTOS_POR_REPISA;
    return salida.set(
      POS_CENTRO_ACOPIO.x + (comp.x0 + paso * (i + 0.5)) * ESCALA_MUEBLE,
      comp.y0 * ESCALA_MUEBLE,
      POS_CENTRO_ACOPIO.z + MUEBLE.zProductos * ESCALA_MUEBLE,
    );
  }

  reiniciar(): void {
    const c = this.c;
    this.actual = -1;
    this.cajas.forEach((caja, i) => {
      const obj = caja.entidad.object3D!;
      c.anim.cancelar(obj);
      obj.position.set(POS_PILA.x, i * CAJA.alto * ESCALA_CAJA * 1.08, POS_PILA.z);
      obj.scale.setScalar(OCULTO);
      obj.visible = false;
      caja.abierta = false;
      caja.armada.solapas.visible = false;
      caja.armada.tapa.visible = true;
      const cinta = caja.cinta.object3D!;
      cinta.position.set(0, CAJA.alto + 0.016, 0);
      cinta.scale.setScalar(OCULTO);
      cinta.visible = false;
    });
    for (const objeto of this.objetos) {
      objeto.lugar = 'caja';
      const obj = objeto.entidad.object3D!;
      c.anim.cancelar(obj);
      obj.visible = false;
      obj.scale.setScalar(OCULTO);
    }
    this.ocupados.fill(0);
    this.sacados.fill(0);
    this.resaltadas.clear();
    this.siluetas.forEach((fila) => fila.forEach((m) => (m.visible = false)));
    this.contadores.forEach((contador) => (contador.malla.visible = false));
    this.bandeja.object3D!.visible = false;
    c.estado.inventario = {};
    this.pintarContadores();
  }

  private pintarContadores(): void {
    CATEGORIAS.forEach((categoria, k) => {
      const hay = this.ocupados[k] - this.sacados[k];
      this.c.estado.inventario[categoria.id] = hay;
      // Las repisas de una misión urgente se iluminan en rojo.
      const urgente = this.resaltadas.has(categoria.id);
      this.contadores[k].escribir(
        `${urgente ? '¡' : ''}${categoria.nombre} ${hay}/${PUESTOS_POR_REPISA}${urgente ? '!' : ''}`,
        urgente ? COLOR.rojo : hay === PUESTOS_POR_REPISA ? '#3E7A6C' : COLOR.petroleo,
      );
      this.contadores[k].malla.scale.setScalar(urgente ? 1.25 : 1);
    });
  }

  /** Aparecen las 3 cajas cerradas junto al centro de acopio. */
  mostrarCajas(): void {
    this.cajas.forEach((caja, i) => {
      const obj = caja.entidad.object3D!;
      obj.visible = true;
      obj.scale.setScalar(0.02);
      this.c.anim.mover(obj, null, 0.4, { escala: ESCALA_CAJA, espera: i * 0.15 });
    });
  }

  /** La siguiente caja cerrada se acerca para desempacar. Devuelve false si no quedan. */
  acercarSiguiente(): boolean {
    let siguiente = -1;
    for (let i = this.cajas.length - 1; i >= 0; i--) {
      if (!this.cajas[i].abierta) {
        siguiente = i;
        break;
      }
    }
    if (this.actual >= 0) {
      // La caja vacía se va.
      const vacia = this.cajas[this.actual].entidad.object3D!;
      this.c.anim.mover(vacia, null, 0.3, { escala: OCULTO, fin: () => (vacia.visible = false) });
    }
    this.actual = siguiente;
    if (siguiente < 0) {
      return false;
    }
    const caja = this.cajas[siguiente];
    this.c.anim.mover(caja.entidad.object3D!, POS_DESEMPAQUE, 0.7, { arco: 0.14, espera: 0.25 });
    const cinta = caja.cinta.object3D!;
    cinta.visible = true;
    cinta.scale.setScalar(1);
    return true;
  }

  /** Se tiró de la cinta: se abren las solapas y salen los objetos sueltos. */
  abrir(i: number): void {
    const caja = this.cajas[i];
    if (caja.abierta || i !== this.actual) {
      return;
    }
    caja.abierta = true;
    caja.armada.tapa.visible = false;
    caja.armada.solapas.visible = true;
    caja.cinta.object3D!.visible = false;
    caja.cinta.object3D!.scale.setScalar(OCULTO);
    this.siluetas.forEach((fila, k) => fila.forEach((m, n) => (m.visible = n >= this.ocupados[k])));
    this.contadores.forEach((contador) => (contador.malla.visible = true));
    this.bandeja.object3D!.visible = true;
    // Los objetos quedan a la vista sobre la caja, en dos filas.
    const sueltos = this.objetos.filter((o) => o.caja === i);
    sueltos.forEach((objeto, n) => {
      const columnas = Math.ceil(sueltos.length / 2);
      const fila = n < columnas ? 0 : 1;
      const col = fila === 0 ? n : n - columnas;
      const enFila = fila === 0 ? columnas : sueltos.length - columnas;
      objeto.casa.set(
        POS_DESEMPAQUE.x + (col - (enFila - 1) / 2) * 0.068,
        0.2 + fila * 0.115,
        POS_DESEMPAQUE.z - fila * 0.02,
      );
      objeto.lugar = 'suelto';
      const obj = objeto.entidad.object3D!;
      obj.position.set(POS_DESEMPAQUE.x, 0.05, POS_DESEMPAQUE.z);
      obj.visible = true;
      obj.scale.setScalar(0.02);
      this.c.anim.mover(obj, objeto.casa, 0.5, { escala: 1, arco: 0.06, espera: n * 0.06 });
    });
  }

  /** Quedan objetos por sacar de la caja abierta. */
  pendientesEnCaja(): number {
    return this.objetos.filter((o) => o.caja === this.actual && o.lugar === 'suelto').length;
  }

  /** En qué repisa (índice de categoría) se soltó, o -1 bandeja, o -2 nada. */
  dondeCayo(objeto: Objeto): number {
    const p = objeto.entidad.object3D!.position;
    if (Math.hypot(p.x - POS_BANDEJA.x, p.z - POS_BANDEJA.z) < 0.14 && p.y < 0.3) {
      return -1;
    }
    for (let k = 0; k < CATEGORIAS.length; k++) {
      const comp = MUEBLE.compartimientos[CATEGORIAS[k].id];
      const x0 = POS_CENTRO_ACOPIO.x + comp.x0 * ESCALA_MUEBLE - 0.03;
      const x1 = POS_CENTRO_ACOPIO.x + comp.x1 * ESCALA_MUEBLE + 0.03;
      const y0 = comp.y0 * ESCALA_MUEBLE - 0.05;
      const y1 = comp.y1 * ESCALA_MUEBLE + 0.02;
      if (p.x > x0 && p.x < x1 && p.y > y0 && p.y < y1 && p.z < POS_CENTRO_ACOPIO.z + 0.4) {
        return k;
      }
    }
    return -2;
  }

  /** Encaja el objeto en el siguiente puesto libre de su repisa. */
  encajar(objeto: Objeto, k: number): boolean {
    if (this.ocupados[k] >= PUESTOS_POR_REPISA) {
      return false;
    }
    const i = this.ocupados[k]++;
    objeto.lugar = 'repisa';
    this.siluetas[k][i].visible = false;
    this.c.anim.mover(objeto.entidad.object3D!, this.puesto(k, i, this.v), 0.3, { escala: 0.85 });
    this.pintarContadores();
    return true;
  }

  descartar(objeto: Objeto): void {
    objeto.lugar = 'descarte';
    if (objeto.dano) {
      this.c.estado.descartados[objeto.dano]++;
    }
    const obj = objeto.entidad.object3D!;
    this.v.copy(POS_BANDEJA);
    this.v.y = 0.02;
    this.c.anim.mover(obj, this.v, 0.3, {
      escala: 0.02,
      fin: () => {
        obj.visible = false;
        obj.scale.setScalar(OCULTO);
      },
    });
  }

  /** Ilumina las repisas que pide una misión (lista vacía: ninguna). */
  resaltar(categorias: Categoria[]): void {
    this.resaltadas = new Set(categorias);
    this.pintarContadores();
  }

  /** Saca de su repisa un objeto de ese producto y lo lleva a `destino`. */
  sacar(productoId: string, destino: Vector3): boolean {
    const objeto =
      this.objetos.find((o) => o.lugar === 'repisa' && PRODUCTOS[o.producto].id === productoId) ??
      this.objetos.find(
        (o) => o.lugar === 'repisa' && o.categoria === PRODUCTOS.find((p) => p.id === productoId)?.categoria,
      );
    if (!objeto) {
      return false;
    }
    objeto.lugar = 'descarte';
    this.sacados[CATEGORIAS.findIndex((k) => k.id === objeto.categoria)]++;
    const obj = objeto.entidad.object3D!;
    this.c.anim.mover(obj, destino, 0.9, {
      arco: 0.18,
      escala: 0.3,
      fin: () => {
        obj.visible = false;
        obj.scale.setScalar(OCULTO);
      },
    });
    this.pintarContadores();
    return true;
  }

  /** Rebota: vuelve a su sitio sobre la caja. */
  rebotar(objeto: Objeto): void {
    this.c.anim.mover(objeto.entidad.object3D!, objeto.casa, 0.45, { arco: 0.1, escala: 1 });
  }
}
