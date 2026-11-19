// ============================================================
// objetos.ts — los objetos donados, low-poly y reconocibles:
// lata, botella, camiseta doblada, cobija enrollada, jabón y
// paquete de pañales. Cada uno es una lista de "partes"
// (geometría + material + posición), para dibujarlos sueltos o en
// bloque en la repisa (InstancedMesh).
// Los dañados llevan su señal (fecha vencida, tapa abierta,
// agujero, empaque arrugado), contorno rojo y una etiqueta.
// ============================================================
import {
  AssetManager,
  BackSide,
  Box3,
  BoxGeometry,
  Color,
  BufferGeometry,
  CircleGeometry,
  CylinderGeometry,
  Group,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  Quaternion,
  SphereGeometry,
  Vector3,
  type Material,
} from '@iwsdk/core';
import { CATEGORIAS, COLOR, type IdCategoria } from './datos.js';
import { Etiqueta } from '../texto.js';

export interface Parte {
  geometria: BufferGeometry;
  material: Material;
  matriz: Matrix4;
}

const mate = (color: string) => new MeshStandardMaterial({ color, roughness: 0.85, metalness: 0 });
const m4 = (x: number, y: number, z: number, rz = 0, rx = 0): Matrix4 =>
  new Matrix4().compose(
    new Vector3(x, y, z),
    new Quaternion().setFromAxisAngle(new Vector3(rz ? 0 : 1, 0, rz ? 1 : 0), rz || rx),
    new Vector3(1, 1, 1),
  );

let cache: Record<IdCategoria, Parte[]> | null = null;

/** Modelos de la página (los mismos de su estantería) para cada categoría. */
const MODELO_PAGINA: Partial<Record<IdCategoria, string>> = {
  alimentos: 'ra_lata',
  agua: 'ra_agua',
  ropa: 'ra_camisa',
  higiene: 'ra_papel',
};

/** Colores que la página corrige en sus modelos (js/ajustes-modelos.js). */
const AJUSTES: Record<string, string> = {
  'Bottle plastic': '#8FD0F2',
  'Bottle cap': '#1E6FD9',
};

/**
 * Partes de un modelo .glb de la página: cada malla con su material mate,
 * escalada a una caja de ancho × alto y apoyada en y = 0.
 */
function partesDeModelo(id: string, ancho: number, alto: number): Parte[] | null {
  const gltf = AssetManager.getGLTF(id);
  if (!gltf) {
    return null;
  }
  const raiz = gltf.scene;
  raiz.updateMatrixWorld(true);
  const caja = new Box3().setFromObject(raiz, true);
  const tam = caja.getSize(new Vector3());
  const escala = Math.min(ancho / tam.x, alto / tam.y, ancho / tam.z);
  const centro = caja.getCenter(new Vector3());
  // Mueve el modelo a su lugar: centrado en x/z, base en y = 0.
  const ajuste = new Matrix4()
    .makeScale(escala, escala, escala)
    .multiply(new Matrix4().makeTranslation(-centro.x, -caja.min.y, -centro.z));
  const partes: Parte[] = [];
  raiz.traverse((o) => {
    const m = o as Mesh;
    if (!m.isMesh) {
      return;
    }
    const geometria = m.geometry.clone().applyMatrix4(new Matrix4().multiplyMatrices(ajuste, m.matrixWorld));
    const original = m.material as MeshStandardMaterial;
    const material = mate(AJUSTES[original.name] ?? `#${(original.color ?? new Color('#cccccc')).getHexString()}`);
    material.name = original.name;
    if (original.map) {
      material.map = original.map;
    }
    partes.push({ geometria, material, matriz: new Matrix4() });
  });
  return partes;
}

/** Partes de un objeto de cada categoría (base en y = 0, unos 5-6 cm). */
export function partesDe(cat: IdCategoria): Parte[] {
  if (!cache) {
    cache = {
      alimentos: [
        { geometria: new CylinderGeometry(0.022, 0.022, 0.05, 14), material: mate('#C9C2B8'), matriz: m4(0, 0.025, 0) },
        { geometria: new CylinderGeometry(0.0226, 0.0226, 0.03, 14), material: mate(COLOR.coral), matriz: m4(0, 0.025, 0) },
        { geometria: new CylinderGeometry(0.019, 0.019, 0.003, 14), material: mate('#E6E1D8'), matriz: m4(0, 0.0505, 0) },
      ],
      agua: [
        { geometria: new CylinderGeometry(0.016, 0.018, 0.055, 12), material: mate('#8FD0F2'), matriz: m4(0, 0.0275, 0) },
        { geometria: new CylinderGeometry(0.008, 0.015, 0.012, 12), material: mate('#8FD0F2'), matriz: m4(0, 0.061, 0) },
        { geometria: new CylinderGeometry(0.0185, 0.0185, 0.018, 12), material: mate(COLOR.crema), matriz: m4(0, 0.03, 0) },
        { geometria: new CylinderGeometry(0.0085, 0.0085, 0.008, 10), material: mate('#1E6FD9'), matriz: m4(0, 0.071, 0) },
      ],
      ropa: [
        { geometria: new BoxGeometry(0.056, 0.016, 0.046), material: mate('#5E86BF'), matriz: m4(0, 0.008, 0) },
        { geometria: new BoxGeometry(0.022, 0.005, 0.01), material: mate('#3F5F8F'), matriz: m4(0, 0.018, -0.016) },
        { geometria: new BoxGeometry(0.057, 0.002, 0.003), material: mate('#3F5F8F'), matriz: m4(0, 0.0165, 0.006) },
      ],
      cobijas: [
        { geometria: new CylinderGeometry(0.021, 0.021, 0.06, 14), material: mate('#E58C6F'), matriz: m4(0, 0.021, 0, Math.PI / 2) },
        { geometria: new CylinderGeometry(0.0215, 0.0215, 0.008, 14), material: mate(COLOR.crema), matriz: m4(-0.018, 0.021, 0, Math.PI / 2) },
        { geometria: new CylinderGeometry(0.0215, 0.0215, 0.008, 14), material: mate(COLOR.crema), matriz: m4(0.018, 0.021, 0, Math.PI / 2) },
      ],
      higiene: [
        { geometria: new BoxGeometry(0.048, 0.02, 0.032), material: mate('#F6B9CC'), matriz: m4(0, 0.01, 0) },
        { geometria: new BoxGeometry(0.03, 0.002, 0.02), material: mate(COLOR.crema), matriz: m4(0, 0.0205, 0) },
      ],
      panales: [
        { geometria: new BoxGeometry(0.044, 0.054, 0.032), material: mate('#BFE0F2'), matriz: m4(0, 0.027, 0) },
        { geometria: new BoxGeometry(0.0445, 0.014, 0.0325), material: mate(COLOR.crema), matriz: m4(0, 0.032, 0) },
        { geometria: new SphereGeometry(0.006, 8, 6), material: mate('#F2B84B'), matriz: m4(0, 0.032, 0.017) },
      ],
    };
    // Las categorías que existen en la página usan su modelo.
    const medidas: Record<string, [number, number]> = {
      alimentos: [0.045, 0.055],
      agua: [0.04, 0.075],
      ropa: [0.06, 0.04],
      higiene: [0.045, 0.05],
    };
    for (const [c, id] of Object.entries(MODELO_PAGINA) as [IdCategoria, string][]) {
      const partes = partesDeModelo(id, ...medidas[c]);
      if (partes?.length) {
        cache[c] = partes;
      }
    }
  }
  return cache[cat];
}

/** Arma el objeto suelto (Group) a partir de sus partes. */
function armar(cat: IdCategoria): Group {
  const g = new Group();
  for (const p of partesDe(cat)) {
    const malla = new Mesh(p.geometria, p.material);
    malla.applyMatrix4(p.matriz);
    g.add(malla);
  }
  return g;
}

const negro = mate('#3A2A22');
const hueco = new MeshBasicMaterial({ color: '#2B1A12' });

/** Señal visible del daño, según la categoría (ubicada según el tamaño real). */
function senalDano(cat: IdCategoria, g: Group): void {
  const caja = new Box3().setFromObject(g, true);
  const arriba = caja.max.y;
  const frente = caja.max.z;
  if (cat === 'alimentos') {
    // Etiqueta de fecha vencida en el frente.
    const fecha = new Mesh(new BoxGeometry(0.02, 0.011, 0.002), negro);
    fecha.position.set(0, arriba * 0.75, frente + 0.001);
    g.add(fecha);
  } else if (cat === 'agua') {
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
  } else if (cat === 'ropa' || cat === 'cobijas') {
    // Agujero o rasgadura encima.
    const agujero = new Mesh(new CircleGeometry(0.008, 10), hueco);
    agujero.rotation.x = -Math.PI / 2;
    agujero.position.set(0.01, arriba + 0.0008, 0.004);
    agujero.scale.set(1.4, 0.7, 1);
    g.add(agujero);
  } else {
    // Empaque dañado: aplastado y con una arruga oscura.
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

  constructor(
    readonly cat: IdCategoria,
    readonly danado: boolean,
  ) {
    this.grupo = armar(cat);
    if (danado) {
      senalDano(cat, this.grupo);
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
