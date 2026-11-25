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
  DoubleSide,
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

/** Giros propios de algunos productos: el martillo acostado de lado (apoyado, se ve de perfil). */
const GIRO_PRODUCTO: Record<string, () => Matrix4> = {
  'construccion-herramientas': () => new Matrix4().makeRotationZ(Math.PI / 2),
};

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
  // Giro propio del producto (p. ej. el martillo acostado) antes de medirlo.
  const giro = GIRO_PRODUCTO[p.id]?.() ?? new Matrix4();
  const caja = new Box3();
  raiz.traverse((o) => {
    const m = o as Mesh;
    if (m.isMesh) {
      m.geometry.computeBoundingBox();
      caja.union(m.geometry.boundingBox!.clone().applyMatrix4(new Matrix4().multiplyMatrices(giro, m.matrixWorld)));
    }
  });
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
    const geometria = m.geometry
      .clone()
      .applyMatrix4(new Matrix4().multiplyMatrices(ajuste, new Matrix4().multiplyMatrices(giro, m.matrixWorld)));
    const original = m.material as MeshStandardMaterial;
    // Los cepillos de dientes quedan verticales, como vienen en el modelo.
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


/** Largo del camión (m, antes de su escala en la oficina). */
const LARGO_CAMION = 0.6;
/** Dónde queda la caja del pedido: ADENTRO del furgón, sobre su piso, cerca de la puerta. */
export const PLATAFORMA = new Vector3();
/** Justo detrás de las puertas traseras (por donde entra la caja). */
export const ENTRADA = new Vector3();

export interface CamionArmado {
  raiz: Group;
  /** Bisagras de las dos puertas traseras (giran en Y para abrir). */
  puertas: [Object3D, Object3D];
}

/**
 * El camión de la Cruz Roja (camion.glb), con la cabina hacia +x. El furgón
 * del archivo es una caja cerrada: se reemplaza por uno hueco (piso, techo,
 * paredes y frente) con dos puertas traseras que se abren, para que la caja
 * del pedido entre sin atravesar el modelo.
 */
export function crearCamion(): CamionArmado {
  const raiz = new Group();
  const gltf = AssetManager.getGLTF('camion');
  // Medidas del furgón en unidades del archivo (la cabina mira a +Z).
  const F = { x: 1.2, y0: 0.94, y1: 3.44, zAtras: -3.62, zAdelante: 2.76, grosor: 0.08 };
  const puertas: [Object3D, Object3D] = [new Group(), new Group()];
  const marcaCarga = new Object3D();
  const marcaEntrada = new Object3D();
  const modelo = gltf ? gltf.scene.clone(true) : new Group();
  if (gltf) {
    let pintura: MeshStandardMaterial | null = null;
    modelo.traverse((o) => {
      const m = o as Mesh;
      if (m.isMesh && (m.material as Material).name === 'Box') {
        pintura = m.material as MeshStandardMaterial;
        m.visible = false; // el furgón cerrado del archivo
      }
    });
    const pared = new MeshStandardMaterial({ color: '#F1F1EE', roughness: 0.8, side: DoubleSide });
    const adentro = new MeshStandardMaterial({ color: '#9C8F80', roughness: 0.9 });
    const largo = F.zAdelante - F.zAtras;
    const zc = (F.zAdelante + F.zAtras) / 2;
    const alto = F.y1 - F.y0;
    const yc = (F.y0 + F.y1) / 2;
    const g = F.grosor;
    const pieza = (w: number, h: number, d: number, m: Material, x: number, y: number, z: number) => {
      const malla = new Mesh(new BoxGeometry(w, h, d), m);
      malla.position.set(x, y, z);
      modelo.add(malla);
      return malla;
    };
    pieza(F.x * 2, g, largo, adentro, 0, F.y0 + g / 2, zc); // piso
    pieza(F.x * 2, g, largo, pared, 0, F.y1 - g / 2, zc); // techo
    pieza(g, alto, largo, pared, -F.x + g / 2, yc, zc); // lado
    pieza(g, alto, largo, pared, F.x - g / 2, yc, zc); // lado
    pieza(F.x * 2, alto, g, pared, 0, yc, F.zAdelante - g / 2); // frente
    // Cruz roja a los lados.
    for (const lado of [-1, 1]) {
      pieza(0.01, 0.9, 0.3, MP.rojo, lado * (F.x + 0.005), yc, zc);
      pieza(0.01, 0.3, 0.9, MP.rojo, lado * (F.x + 0.005), yc, zc);
    }
    // Puertas traseras con bisagra en cada borde.
    const ancho = F.x - 0.02;
    puertas.forEach((bisagra, k) => {
      const lado = k === 0 ? -1 : 1;
      bisagra.position.set(lado * F.x, yc, F.zAtras);
      const hoja = new Mesh(new BoxGeometry(ancho, alto - 0.04, 0.06), pared);
      hoja.position.set(-lado * (ancho / 2), 0, 0);
      const manija = new Mesh(new BoxGeometry(0.06, 0.4, 0.06), MP.carbon);
      manija.position.set(-lado * (ancho - 0.12), 0, -0.05);
      bisagra.add(hoja, manija);
      modelo.add(bisagra);
    });
    void pintura;
    // Puntos: la carga, adentro cerca de la puerta; la entrada, detrás.
    marcaCarga.position.set(0, F.y0 + g, F.zAtras + 2.3);
    marcaEntrada.position.set(0, F.y0 + g, F.zAtras - 1.2);
    modelo.add(marcaCarga, marcaEntrada);
    // En el archivo la cabina mira a +Z: se gira para que mire a +x.
    modelo.rotation.y = Math.PI / 2;
    const girado = new Group();
    girado.add(modelo);
    raiz.add(encajar(girado, LARGO_CAMION, 1, 1));
  } else {
    raiz.add(bloque(LARGO_CAMION, 0.2, 0.19, MP.rojo, 0, 0.1, 0));
  }
  raiz.updateMatrixWorld(true);
  raiz.worldToLocal(marcaCarga.getWorldPosition(PLATAFORMA));
  raiz.worldToLocal(marcaEntrada.getWorldPosition(ENTRADA));
  raiz.add(sombra(0.8, 0.32, 0.4));
  return { raiz, puertas };
}

/** Pantalla del monitor de escritorio.glb (coordenadas del nodo "Monitor"). */
const PANTALLA = { x: -0.017, y: 0.323, z: 0.065, ancho: 0.81, alto: 0.458 };
/** Parte más baja del monitor (la base del pie), en coordenadas del nodo. */
const BASE_MONITOR = -0.036;

/** Cuánto baja la base del monitor desde el centro de la pantalla (m), para una pantalla de ese alto. */
export const bajoPantalla = (alto: number): number => (PANTALLA.y - BASE_MONITOR) * (alto / PANTALLA.alto);

/**
 * El monitor del computador (solo el monitor de escritorio.glb: sin mesa,
 * teclado ni mouse), ajustado para que su pantalla mida ancho × alto y
 * quede centrada en el origen (la interfaz del panel se dibuja encima).
 */
export function crearMonitor(ancho: number, alto: number): Group {
  const g = new Group();
  const gltf = AssetManager.getGLTF('monitor');
  if (!gltf) {
    return g;
  }
  const escena = gltf.scene.clone(true);
  const nodo = escena.getObjectByName('Monitor') ?? escena;
  nodo.position.set(0, 0, 0);
  nodo.quaternion.identity();
  const sx = ancho / PANTALLA.ancho;
  const sy = alto / PANTALLA.alto;
  escena.scale.set(sx, sy, sx);
  escena.position.set(-PANTALLA.x * sx, -PANTALLA.y * sy, -PANTALLA.z * sx - 0.004);
  // La pantalla con el fondo crema de los paneles.
  const fondo = new MeshBasicMaterial({ color: COLOR.crema, toneMapped: false });
  escena.traverse((o) => {
    const m = o as Mesh;
    if (!m.isMesh) {
      return;
    }
    const mat = m.material as MeshStandardMaterial;
    if (!mat || Array.isArray(mat)) {
      return;
    }
    if (mat.name.startsWith('monitor_screen')) {
      m.material = fondo;
      return;
    }
    // Material estándar y mate (el original trae barniz y extensiones que
    // pesan más en el Quest).
    m.material = new MeshStandardMaterial({
      name: mat.name,
      color: mat.color,
      map: mat.map ?? null,
      roughness: Math.max(0.5, mat.roughness ?? 0.6),
      metalness: Math.min(0.3, mat.metalness ?? 0),
    });
  });
  g.add(escena);
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
