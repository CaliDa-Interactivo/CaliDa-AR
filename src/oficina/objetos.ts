// ============================================================
// objetos.ts — los objetos donados: los 16 productos de la
// estantería de la página (sus mismos modelos, colores y
// calcomanías de js/ajustes-modelos.js). Cada uno es una lista de
// "partes" (geometría + material + posición), para dibujarlos
// sueltos o en bloque en la estantería (InstancedMesh).
// Los dañados llevan su señal (fecha vencida, tapa abierta,
// agujero, empaque arrugado), contorno rojo y una etiqueta.
// ============================================================
import {
  AssetManager,
  BackSide,
  Box3,
  BoxGeometry,
  CanvasTexture,
  Color,
  BufferGeometry,
  CylinderGeometry,
  CircleGeometry,
  Group,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  PlaneGeometry,
  SphereGeometry,
  SRGBColorSpace,
  Vector3,
  type Material,
} from '@iwsdk/core';
import { CATEGORIAS, COLOR, categoriaDe, type IdCategoria, type Producto } from './datos.js';
import { Etiqueta } from './ui.js';

export interface Parte {
  geometria: BufferGeometry;
  material: Material;
  matriz: Matrix4;
}

const mate = (color: string) => new MeshStandardMaterial({ color, roughness: 0.85, metalness: 0 });

/** Colores que la página corrige en sus modelos (COLORES de js/ajustes-modelos.js). */
const COLORES: Record<string, Record<string, string>> = {
  'ropa-mujer': { fabric: '#F6B9CC', 'Material.002': '#EE93B3', 'Material.001': '#86B5A9', metal: '#FFF8ED' },
  'ropa-ninos': { Tela_Azul: '#5E86BF', 'azul mas ocuro ': '#4A6FA5', Metal: '#E8E1D5' },
  'alimento-agua': { 'Bottle plastic': '#8FD0F2', 'Bottle cap': '#1E6FD9' },
};

// ---- Calcomanías de la página (maíz en la lata, huella en la bolsa) ----

function dibujarMaiz(ctx: CanvasRenderingContext2D, s: number): void {
  ctx.save();
  ctx.translate(s / 2, s / 2);
  ctx.rotate(-0.35);
  ctx.fillStyle = '#4CAF50';
  ctx.beginPath();
  ctx.moveTo(0, s * 0.42);
  ctx.quadraticCurveTo(-s * 0.36, s * 0.05, -s * 0.12, -s * 0.3);
  ctx.quadraticCurveTo(-s * 0.08, s * 0.1, 0, s * 0.42);
  ctx.fill();
  ctx.fillStyle = '#3E9B43';
  ctx.beginPath();
  ctx.moveTo(0, s * 0.42);
  ctx.quadraticCurveTo(s * 0.36, s * 0.05, s * 0.12, -s * 0.3);
  ctx.quadraticCurveTo(s * 0.08, s * 0.1, 0, s * 0.42);
  ctx.fill();
  ctx.fillStyle = '#FFC93C';
  ctx.beginPath();
  ctx.ellipse(0, -s * 0.05, s * 0.13, s * 0.33, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#F2A81D';
  for (let y = -0.3; y <= 0.2; y += 0.085) {
    for (let x = -0.07; x <= 0.07; x += 0.07) {
      ctx.beginPath();
      ctx.arc(x * s, (y - 0.02) * s, s * 0.022, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}

function dibujarHuella(ctx: CanvasRenderingContext2D, s: number): void {
  ctx.fillStyle = '#FFF6E6';
  ctx.beginPath();
  ctx.arc(s / 2, s / 2, s * 0.46, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#6B3A1E';
  ctx.beginPath();
  ctx.ellipse(s * 0.5, s * 0.6, s * 0.15, s * 0.13, 0, 0, Math.PI * 2);
  ctx.fill();
  for (const [x, y, r] of [
    [0.3, 0.42, -0.4],
    [0.42, 0.3, -0.15],
    [0.58, 0.3, 0.15],
    [0.7, 0.42, 0.4],
  ]) {
    ctx.beginPath();
    ctx.ellipse(s * x, s * y, s * 0.06, s * 0.08, r, 0, Math.PI * 2);
    ctx.fill();
  }
}

const CALCOMANIAS: Record<string, (ctx: CanvasRenderingContext2D, s: number) => void> = {
  'alimento-no-perecederos': dibujarMaiz,
  'alimento-animal': dibujarHuella,
};

function calcomania(sub: string, caja: Box3): Parte | null {
  const dibujar = CALCOMANIAS[sub];
  if (!dibujar) {
    return null;
  }
  const lienzo = document.createElement('canvas');
  lienzo.width = lienzo.height = 256;
  dibujar(lienzo.getContext('2d') as CanvasRenderingContext2D, 256);
  const textura = new CanvasTexture(lienzo);
  textura.colorSpace = SRGBColorSpace;
  const tam = caja.getSize(new Vector3());
  const lado = Math.min(tam.x, tam.y) * 0.5;
  const centro = caja.getCenter(new Vector3());
  return {
    geometria: new PlaneGeometry(lado, lado),
    material: new MeshBasicMaterial({ map: textura, transparent: true, depthWrite: false }),
    matriz: new Matrix4().makeTranslation(centro.x, centro.y, caja.max.z + tam.z * 0.01),
  };
}

/**
 * Partes de un producto de la página: cada malla con su material mate,
 * escalada a una caja de ancho × alto y apoyada en y = 0 (centrada en x/z).
 */
function partesDeModelo(p: Producto): Parte[] {
  const gltf = AssetManager.getGLTF(p.modelo);
  const [ancho, alto] = p.medida;
  if (!gltf) {
    // Sin el modelo: una cajita del tamaño del producto.
    return [{ geometria: new BoxGeometry(ancho, alto, ancho), material: mate('#C98F62'), matriz: new Matrix4().makeTranslation(0, alto / 2, 0) }];
  }
  const raiz = gltf.scene;
  raiz.updateMatrixWorld(true);
  const caja = new Box3().setFromObject(raiz, true);
  const tam = caja.getSize(new Vector3());
  const escala = Math.min(ancho / tam.x, alto / tam.y, ancho / tam.z);
  const centro = caja.getCenter(new Vector3());
  const ajuste = new Matrix4()
    .makeScale(escala, escala, escala)
    .multiply(new Matrix4().makeTranslation(-centro.x, -caja.min.y, -centro.z));
  const colores = COLORES[p.id] ?? {};
  const partes: Parte[] = [];
  const final = new Box3();
  raiz.traverse((o) => {
    const m = o as Mesh;
    if (!m.isMesh) {
      return;
    }
    const geometria = m.geometry.clone().applyMatrix4(new Matrix4().multiplyMatrices(ajuste, m.matrixWorld));
    const original = m.material as MeshStandardMaterial;
    // El cepillo de dientes se gira para que se vean los dos (como la página).
    if (p.id === 'aseo-bucal' && original.map) {
      geometria.computeBoundingBox();
      const c = geometria.boundingBox!.getCenter(new Vector3());
      geometria.translate(-c.x, -c.y, -c.z).rotateZ(Math.PI / 2).translate(c.x, c.y, c.z);
    }
    const material = mate(colores[original.name] ?? `#${(original.color ?? new Color('#cccccc')).getHexString()}`);
    material.name = original.name;
    if (original.map) {
      material.map = original.map;
    }
    geometria.computeBoundingBox();
    final.union(geometria.boundingBox!);
    partes.push({ geometria, material, matriz: new Matrix4() });
  });
  const calco = calcomania(p.id, final);
  if (calco) {
    partes.push(calco);
  }
  return partes;
}

const cache = new Map<string, Parte[]>();

/** Partes del producto `sub` (índice) de la categoría (base en y = 0). */
export function partesDe(cat: IdCategoria, sub: number): Parte[] {
  const p = categoriaDe(cat).subs[sub] ?? categoriaDe(cat).subs[0];
  let partes = cache.get(p.id);
  if (!partes) {
    partes = partesDeModelo(p);
    cache.set(p.id, partes);
  }
  return partes;
}

/** Tamaño (caja) de un producto armado. */
export function tamDe(cat: IdCategoria, sub: number): Vector3 {
  const caja = new Box3();
  for (const parte of partesDe(cat, sub)) {
    parte.geometria.computeBoundingBox();
    caja.union(parte.geometria.boundingBox!.clone().applyMatrix4(parte.matriz));
  }
  return caja.getSize(new Vector3());
}

/** Arma el objeto suelto (Group) a partir de sus partes. */
function armar(cat: IdCategoria, sub: number): Group {
  const g = new Group();
  for (const p of partesDe(cat, sub)) {
    const malla = new Mesh(p.geometria, p.material);
    malla.applyMatrix4(p.matriz);
    g.add(malla);
  }
  return g;
}

const negro = mate('#3A2A22');
const hueco = new MeshBasicMaterial({ color: '#2B1A12' });

/** Señal visible del daño, según el producto (ubicada según el tamaño real). */
function senalDano(cat: IdCategoria, sub: string, g: Group): void {
  const caja = new Box3().setFromObject(g, true);
  const arriba = caja.max.y;
  const frente = caja.max.z;
  if (sub === 'alimento-agua') {
    // Sin tapa (abierta) y un charquito que se sale.
    g.traverse((o) => {
      const m = o as Mesh;
      if (m.isMesh && (m.material as Material).name === 'Bottle cap') {
        m.visible = false;
      }
    });
    const gota = new Mesh(new SphereGeometry(0.006, 8, 6), mate('#4FA3D9'));
    gota.position.set(0.022, 0.003, 0.012);
    gota.scale.set(1.8, 0.35, 1.8);
    g.add(gota);
  } else if (cat === 'alimento' || cat === 'medicamentos') {
    // Etiqueta de fecha vencida en el frente.
    const fecha = new Mesh(new BoxGeometry(0.02, 0.011, 0.002), negro);
    fecha.position.set(0, arriba * 0.6, frente + 0.001);
    g.add(fecha);
  } else if (cat === 'ropa') {
    // Agujero o rasgadura en el frente.
    const agujero = new Mesh(new CircleGeometry(0.008, 10), hueco);
    agujero.position.set(0.008, arriba * 0.55, frente + 0.001);
    agujero.scale.set(1.4, 0.8, 1);
    g.add(agujero);
  } else {
    // Empaque o pieza dañada: aplastado y con una arruga oscura.
    g.scale.set(1, 0.85, 1);
    const arruga = new Mesh(new BoxGeometry(0.05, 0.003, 0.004), negro);
    arruga.position.set(0, arriba * 0.8, frente + 0.001);
    arruga.rotation.z = 0.35;
    g.add(arruga);
  }
}

// ---- Contorno (blanco / verde / rojo) ------------------------------

const MATERIAL_CONTORNO: Record<string, MeshBasicMaterial> = {};
function materialContorno(color: string): MeshBasicMaterial {
  MATERIAL_CONTORNO[color] ??= new MeshBasicMaterial({ color, side: BackSide, transparent: true });
  return MATERIAL_CONTORNO[color];
}

/**
 * Contorno de un objeto: copia de cada malla, un poco más grande y vista
 * por dentro. Se escala desde el centro de cada malla.
 */
export class Contorno {
  private capas: Mesh[] = [];
  color: string | null = null;

  constructor(objeto: Object3D, grosor = 1.14) {
    const mallas: Mesh[] = [];
    objeto.traverse((o) => {
      const m = o as Mesh;
      if (m.isMesh && !m.userData.sinContorno && (m.material as Material).visible !== false) {
        mallas.push(m);
      }
    });
    for (const m of mallas) {
      m.geometry.computeBoundingSphere();
      const c = m.geometry.boundingSphere!.center;
      const capa = new Mesh(m.geometry, materialContorno('#FFFFFF'));
      capa.userData.sinContorno = true;
      capa.scale.setScalar(grosor);
      capa.position.copy(c).multiplyScalar(1 - grosor);
      capa.visible = false;
      m.add(capa);
      this.capas.push(capa);
    }
  }

  poner(color: string | null): void {
    if (color === this.color) {
      return;
    }
    this.color = color;
    for (const capa of this.capas) {
      capa.visible = color !== null;
      if (color) {
        capa.material = materialContorno(color);
      }
    }
  }
}

// ---- Objeto suelto ---------------------------------------------------

export class Objeto {
  readonly grupo: Group;
  readonly contorno: Contorno;
  /** Ya se decidió qué hacer con él (repisa, descarte, pedido). */
  clasificado = false;

  /** Qué producto de la categoría es (índice en `subs`). */
  readonly sub: number;

  constructor(
    readonly cat: IdCategoria,
    readonly danado: boolean,
    sub?: number,
  ) {
    const subs = categoriaDe(cat).subs;
    this.sub = sub !== undefined && sub >= 0 && sub < subs.length ? sub : Math.floor(Math.random() * subs.length);
    this.grupo = armar(cat, this.sub);
    if (danado) {
      senalDano(cat, subs[this.sub].id, this.grupo);
    }
    this.contorno = new Contorno(this.grupo);
    if (danado) {
      const etiqueta = new Etiqueta(0.07);
      etiqueta.escribir(CATEGORIAS.find((c) => c.id === cat)!.defecto, COLOR.rojo);
      etiqueta.malla.position.set(0, 0.095, 0);
      etiqueta.malla.userData.sinContorno = true;
      etiqueta.malla.userData.mirar = true;
      this.grupo.add(etiqueta.malla);
    }
    this.reposo();
  }

  /** Contorno cuando nadie lo toca: rojo si está dañado. */
  reposo(): void {
    this.contorno.poner(this.danado ? COLOR.rojo : null);
  }
}

// ---- Piezas armadas en código: caja, camión, tarima y sombra ----

const MP = {
  rojo: mate(COLOR.rojo),
  rojoProfundo: mate(COLOR.rojoProfundo),
  marfil: mate(COLOR.crema),
  carbon: mate(COLOR.carbon),
  petroleo: mate(COLOR.petroleo),
  carton: mate("#C99A62"),
  cartonOscuro: mate("#B5854F"),
  crema: mate(COLOR.crema),
  verde: mate("#B3D49F"),
  ambar: mate("#E6A341"),
  cobre: mate("#B8683A"),
};

function bloque(w: number, h: number, d: number, material: Material, x = 0, y = 0, z = 0): Mesh {
  const malla = new Mesh(new BoxGeometry(w, h, d), material);
  malla.position.set(x, y, z);
  return malla;
}

const tamE = new Vector3();
const centroE = new Vector3();

/**
 * Mete un modelo en una envoltura: escalado para caber en ancho × alto ×
 * fondo, centrado en x/z y apoyado en y = 0.
 */
export function encajar(
  objeto: Object3D,
  ancho: number,
  alto: number,
  fondo = ancho,
): Group {
  objeto.updateMatrixWorld(true);
  const limites = new Box3().setFromObject(objeto, true);
  limites.getSize(tamE);
  const escala = Math.min(ancho / tamE.x, alto / tamE.y, fondo / tamE.z);
  objeto.scale.multiplyScalar(escala);
  objeto.updateMatrixWorld(true);
  limites.setFromObject(objeto, true);
  limites.getCenter(centroE);
  objeto.position.x -= centroE.x;
  objeto.position.z -= centroE.z;
  objeto.position.y -= limites.min.y;
  const envoltura = new Group();
  envoltura.add(objeto);
  return envoltura;
}


/** Zona invisible que hace más fácil apuntar a un objeto pequeño. */
function zonaDeToque(w: number, h: number, d: number): Mesh {
  const malla = new Mesh(
    new BoxGeometry(w, h, d),
    new MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }),
  );
  malla.position.y = h / 2;
  return malla;
}

// --- Sombra suave pintada (la misma idea de la isla de la portada) -------
let texturaSombra: CanvasTexture | null = null;
export function sombra(ancho: number, fondo: number, opacidad = 0.38): Mesh {
  if (!texturaSombra) {
    const lienzo = document.createElement('canvas');
    lienzo.width = lienzo.height = 128;
    const ctx = lienzo.getContext('2d') as CanvasRenderingContext2D;
    const grad = ctx.createRadialGradient(64, 64, 6, 64, 64, 64);
    grad.addColorStop(0, 'rgba(40, 18, 6, 1)');
    grad.addColorStop(0.55, 'rgba(40, 18, 6, 0.55)');
    grad.addColorStop(1, 'rgba(40, 18, 6, 0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 128, 128);
    texturaSombra = new CanvasTexture(lienzo);
    texturaSombra.colorSpace = SRGBColorSpace;
  }
  const malla = new Mesh(
    new PlaneGeometry(ancho, fondo),
    new MeshBasicMaterial({
      map: texturaSombra,
      transparent: true,
      opacity: opacidad,
      depthWrite: false,
      toneMapped: false,
    }),
  );
  malla.rotation.x = -Math.PI / 2;
  malla.position.y = 0.002;
  malla.renderOrder = 1;
  return malla;
}

// --- Caja de la donación -------------------------------------------------
export const CAJA = { ancho: 0.26, alto: 0.14, fondo: 0.19 };

export interface CajaArmada {
  raiz: Group;
  solapas: Group;
  tapa: Group;
}

export function crearCaja(conCruz = true): CajaArmada {
  const { ancho: w, alto: h, fondo: d } = CAJA;
  const g = 0.008;
  const raiz = new Group();
  raiz.add(bloque(w, g, d, MP.cartonOscuro, 0, g / 2, 0));
  raiz.add(bloque(w, h, g, MP.carton, 0, h / 2, d / 2 - g / 2));
  raiz.add(bloque(w, h, g, MP.carton, 0, h / 2, -d / 2 + g / 2));
  raiz.add(bloque(g, h, d, MP.carton, -w / 2 + g / 2, h / 2, 0));
  raiz.add(bloque(g, h, d, MP.carton, w / 2 - g / 2, h / 2, 0));
  // Relleno de papel: los productos se apoyan aquí y asoman por el borde.
  raiz.add(bloque(w - 2 * g, 0.04, d - 2 * g, MP.crema, 0, g + 0.02, 0));
  // Cruz roja al frente.
  if (conCruz) {
    raiz.add(bloque(0.07, 0.07, 0.002, MP.marfil, 0, h / 2, d / 2 + 0.001));
    raiz.add(bloque(0.045, 0.014, 0.002, MP.rojo, 0, h / 2, d / 2 + 0.003));
    raiz.add(bloque(0.014, 0.045, 0.002, MP.rojo, 0, h / 2, d / 2 + 0.003));
  }

  // Solapas abiertas hacia afuera.
  const solapas = new Group();
  const lado = (x: number, giro: number) => {
    const s = bloque(d * 0.42, g, d, MP.carton);
    s.geometry.translate((Math.sign(x) * d * 0.42) / 2, 0, 0);
    s.position.set(x, h, 0);
    s.rotation.z = giro;
    solapas.add(s);
  };
  lado(-w / 2, 0.75);
  lado(w / 2, -0.75);
  raiz.add(solapas);

  // Tapa cerrada con su cinta.
  const tapa = new Group();
  tapa.add(bloque(w + 0.004, g, d + 0.004, MP.carton, 0, h + g / 2, 0));
  tapa.add(bloque(w + 0.006, g + 0.002, 0.03, MP.crema, 0, h + g / 2, 0));
  tapa.visible = false;
  raiz.add(tapa);

  raiz.add(sombra(w * 1.5, d * 1.6, 0.36));
  raiz.add(zonaDeToque(w, h, d));
  return { raiz, solapas, tapa };
}


/** Centro de la plataforma de carga, medido desde el origen del camión. */
export const PLATAFORMA = new Vector3(-0.085, 0.092, 0);

export function crearCamion(): Group {
  const g = new Group();
  g.add(bloque(0.52, 0.03, 0.2, MP.carbon, 0, 0.06, 0));
  // Cabina (adelante es +x).
  g.add(bloque(0.15, 0.15, 0.22, MP.rojo, 0.185, 0.15, 0));
  g.add(bloque(0.004, 0.06, 0.18, MP.petroleo, 0.262, 0.175, 0));
  g.add(bloque(0.07, 0.055, 0.224, MP.petroleo, 0.2, 0.18, 0));
  g.add(bloque(0.02, 0.02, 0.2, MP.marfil, 0.262, 0.09, 0));
  // Plataforma con barandas bajas.
  g.add(bloque(0.36, 0.018, 0.24, MP.marfil, -0.085, 0.083, 0));
  g.add(bloque(0.36, 0.035, 0.008, MP.rojoProfundo, -0.085, 0.108, 0.116));
  g.add(bloque(0.36, 0.035, 0.008, MP.rojoProfundo, -0.085, 0.108, -0.116));
  g.add(bloque(0.008, 0.035, 0.24, MP.rojoProfundo, -0.261, 0.108, 0));
  // Ruedas.
  const rueda = new CylinderGeometry(0.042, 0.042, 0.035, 20);
  rueda.rotateX(Math.PI / 2);
  for (const x of [0.17, -0.17]) {
    for (const z of [0.105, -0.105]) {
      const r = new Mesh(rueda, MP.carbon);
      r.position.set(x, 0.042, z);
      g.add(r);
    }
  }
  g.add(sombra(0.7, 0.36, 0.4));
  return g;
}


// --- Tarima de la bienvenida --------------------------------------------
export function crearTarima(): Group {
  const g = new Group();
  const arriba = new Mesh(new CylinderGeometry(0.24, 0.24, 0.02, 48), MP.verde);
  arriba.position.y = 0.02;
  const medio = new Mesh(new CylinderGeometry(0.26, 0.26, 0.02, 48), MP.ambar);
  const base = new Mesh(new CylinderGeometry(0.25, 0.2, 0.03, 48), MP.cobre);
  base.position.y = -0.025;
  g.add(arriba, medio, base);
  return g;
}
