// ============================================================
// modelos.ts — objetos de la experiencia. Los del equipo salen
// de los .glb de CaliDa (gato, estantería, productos, casas);
// la caja, el camión, la mesa, la carpa y el mapa se arman aquí
// con el mismo material mate y la paleta de la página.
// ============================================================
import {
  AssetManager,
  Box3,
  BoxGeometry,
  CanvasTexture,
  Color,
  CylinderGeometry,
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  PlaneGeometry,
  Shape,
  ShapeGeometry,
  SphereGeometry,
  SRGBColorSpace,
  TorusGeometry,
  Vector3,
} from '@iwsdk/core';
import { COLOR, type ProductoDato } from './datos.js';

const mate = (color: string, extra: Record<string, unknown> = {}) =>
  new MeshStandardMaterial({ color, roughness: 0.88, metalness: 0, ...extra });

const M = {
  rojo: mate(COLOR.rojo),
  rojoProfundo: mate(COLOR.rojoProfundo),
  marfil: mate(COLOR.marfil),
  carbon: mate(COLOR.carbon),
  petroleo: mate(COLOR.petroleo),
  carton: mate(COLOR.carton),
  cartonOscuro: mate('#B5854F'),
  madera: mate('#C98F62'),
  maderaOscura: mate(COLOR.madera),
  verde: mate(COLOR.verde),
  verdeOscuro: mate('#8DBB7C'),
  ambar: mate(COLOR.ambar),
  cobre: mate('#B8683A'),
  salvia: mate(COLOR.salvia),
  crema: mate(COLOR.crema),
  // La carpa es translúcida: en realidad aumentada la persona siempre
  // debe seguir viendo su entorno real a través de la lona.
  lona: mate(COLOR.marfil, {
    side: DoubleSide,
    transparent: true,
    opacity: 0.3,
    depthWrite: false,
  }),
  lonaRoja: mate(COLOR.rojo, {
    side: DoubleSide,
    transparent: true,
    opacity: 0.5,
    depthWrite: false,
  }),
  rio: mate('#6FB3D8'),
};

function caja(
  w: number,
  h: number,
  d: number,
  material: MeshStandardMaterial,
  x = 0,
  y = 0,
  z = 0,
): Mesh {
  const malla = new Mesh(new BoxGeometry(w, h, d), material);
  malla.position.set(x, y, z);
  return malla;
}

const tam = new Vector3();
const centro = new Vector3();

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
  limites.getSize(tam);
  const escala = Math.min(ancho / tam.x, alto / tam.y, fondo / tam.z);
  objeto.scale.multiplyScalar(escala);
  objeto.updateMatrixWorld(true);
  limites.setFromObject(objeto, true);
  limites.getCenter(centro);
  objeto.position.x -= centro.x;
  objeto.position.z -= centro.z;
  objeto.position.y -= limites.min.y;
  const envoltura = new Group();
  envoltura.add(objeto);
  return envoltura;
}

function modelo(id: string): Object3D {
  const gltf = AssetManager.getGLTF(id);
  if (!gltf) {
    // Respaldo visible si faltara un archivo: un bloque de la paleta.
    return caja(0.1, 0.1, 0.1, M.salvia);
  }
  return gltf.scene;
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

// --- Gato ----------------------------------------------------------------
export interface GatoArmado {
  raiz: Group;
  /** Se mueve para respirar y saltar sin tocar la posición del gato. */
  pivote: Group;
  brazo: Object3D | undefined;
  cola: Object3D | undefined;
}

export function crearGato(alto: number): GatoArmado {
  const escena = modelo('gato');
  // Mismo café de la estantería (como en la página): se cambian las partes coral.
  const coral = new Color(COLOR.coral);
  const cafe = new Color(COLOR.madera);
  escena.traverse((n) => {
    const malla = n as Mesh;
    if (!malla.isMesh) {
      return;
    }
    const lista = Array.isArray(malla.material)
      ? malla.material
      : [malla.material];
    for (const m of lista) {
      const c = (m as MeshStandardMaterial).color;
      if (
        c &&
        Math.abs(c.r - coral.r) + Math.abs(c.g - coral.g) + Math.abs(c.b - coral.b) <
          0.35
      ) {
        c.copy(cafe);
      }
    }
  });
  // El modelo mira hacia +x: se gira para que mire hacia +z.
  escena.rotation.y = -Math.PI / 2;
  const girado = new Group();
  girado.add(escena);
  const pivote = encajar(girado, alto * 2, alto, alto * 2);
  const raiz = new Group();
  raiz.add(pivote);
  raiz.add(sombra(alto * 0.95, alto * 0.75, 0.42));
  return {
    raiz,
    pivote,
    brazo: escena.getObjectByName('BrazoDer'),
    cola: escena.getObjectByName('Cola'),
  };
}

// --- Productos -----------------------------------------------------------
// Colores que venían mal en el archivo (igual que js/ajustes-modelos.js).
const AJUSTES_COLOR: Record<string, Record<string, string>> = {
  vestido: {
    fabric: '#F6B9CC',
    'Material.002': '#EE93B3',
    'Material.001': '#86B5A9',
    metal: '#FFF8ED',
  },
  overol: {
    Tela_Azul: '#5E86BF',
    'azul mas ocuro ': '#4A6FA5',
    Metal: '#E8E1D5',
  },
  agua: {
    'Bottle plastic': '#8FD0F2',
    'Bottle cap': '#1E6FD9',
  },
};

export function crearProducto(
  dato: ProductoDato,
  ancho: number,
  alto: number,
): Group {
  const escena = modelo(dato.modelo);
  const ajustes = AJUSTES_COLOR[dato.modelo];
  escena.traverse((n) => {
    const malla = n as Mesh;
    if (!malla.isMesh) {
      return;
    }
    const lista = Array.isArray(malla.material)
      ? malla.material
      : [malla.material];
    for (const m of lista) {
      const material = m as MeshStandardMaterial;
      const color = ajustes?.[material.name];
      if (color) {
        material.color.set(color);
      }
      if ('metalness' in material) {
        material.metalness = 0;
        material.roughness = Math.max(material.roughness ?? 0.85, 0.6);
      }
    }
  });
  const grupo = encajar(escena, ancho, alto, ancho);
  grupo.add(zonaDeToque(ancho * 1.15, alto * 1.1, ancho * 1.15));
  return grupo;
}

// --- Estantería ----------------------------------------------------------
/** Medidas de assets/modelos/estanteria.glb (las de js/estanteria3d.js). */
export const MUEBLE = {
  ancho: 6.15,
  alto: 5.412,
  zProductos: 0.12,
  compartimientos: {
    alimento: { x0: -2.743, x1: -0.123, y0: 3.797, y1: 5.079 },
    aseo: { x0: 0.123, x1: 2.743, y0: 3.797, y1: 5.079 },
    ropa: { x0: -2.743, x1: -0.123, y0: 2.198, y1: 3.582 },
    medicamentos: { x0: 0.123, x1: 2.743, y0: 2.198, y1: 3.582 },
    construccion: { x0: -2.743, x1: 2.743, y0: 0.332, y1: 1.983 },
  },
} as const;

export function crearEstanteria(ancho: number): Group {
  const escena = modelo('estanteria');
  const escala = ancho / MUEBLE.ancho;
  escena.scale.multiplyScalar(escala);
  const grupo = new Group();
  grupo.add(escena);
  grupo.add(sombra(ancho * 1.15, ancho * 0.5, 0.4));
  return grupo;
}

// --- Caja de la donación -------------------------------------------------
export const CAJA = { ancho: 0.26, alto: 0.14, fondo: 0.19 };

export interface CajaArmada {
  raiz: Group;
  solapas: Group;
  tapa: Group;
}

export function crearCaja(): CajaArmada {
  const { ancho: w, alto: h, fondo: d } = CAJA;
  const g = 0.008;
  const raiz = new Group();
  raiz.add(caja(w, g, d, M.cartonOscuro, 0, g / 2, 0));
  raiz.add(caja(w, h, g, M.carton, 0, h / 2, d / 2 - g / 2));
  raiz.add(caja(w, h, g, M.carton, 0, h / 2, -d / 2 + g / 2));
  raiz.add(caja(g, h, d, M.carton, -w / 2 + g / 2, h / 2, 0));
  raiz.add(caja(g, h, d, M.carton, w / 2 - g / 2, h / 2, 0));
  // Relleno de papel: los productos se apoyan aquí y asoman por el borde.
  raiz.add(caja(w - 2 * g, 0.04, d - 2 * g, M.crema, 0, g + 0.02, 0));
  // Cruz roja al frente.
  raiz.add(caja(0.07, 0.07, 0.002, M.marfil, 0, h / 2, d / 2 + 0.001));
  raiz.add(caja(0.045, 0.014, 0.002, M.rojo, 0, h / 2, d / 2 + 0.003));
  raiz.add(caja(0.014, 0.045, 0.002, M.rojo, 0, h / 2, d / 2 + 0.003));

  // Solapas abiertas hacia afuera.
  const solapas = new Group();
  const lado = (x: number, giro: number) => {
    const s = caja(d * 0.42, g, d, M.carton);
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
  tapa.add(caja(w + 0.004, g, d + 0.004, M.carton, 0, h + g / 2, 0));
  tapa.add(caja(w + 0.006, g + 0.002, 0.03, M.crema, 0, h + g / 2, 0));
  tapa.visible = false;
  raiz.add(tapa);

  raiz.add(sombra(w * 1.5, d * 1.6, 0.36));
  raiz.add(zonaDeToque(w, h, d));
  return { raiz, solapas, tapa };
}

// --- Camión --------------------------------------------------------------
/** Centro de la plataforma de carga, medido desde el origen del camión. */
export const PLATAFORMA = new Vector3(-0.085, 0.092, 0);

export function crearCamion(): Group {
  const g = new Group();
  g.add(caja(0.52, 0.03, 0.2, M.carbon, 0, 0.06, 0));
  // Cabina (adelante es +x).
  g.add(caja(0.15, 0.15, 0.22, M.rojo, 0.185, 0.15, 0));
  g.add(caja(0.004, 0.06, 0.18, M.petroleo, 0.262, 0.175, 0));
  g.add(caja(0.07, 0.055, 0.224, M.petroleo, 0.2, 0.18, 0));
  g.add(caja(0.02, 0.02, 0.2, M.marfil, 0.262, 0.09, 0));
  // Plataforma con barandas bajas.
  g.add(caja(0.36, 0.018, 0.24, M.marfil, -0.085, 0.083, 0));
  g.add(caja(0.36, 0.035, 0.008, M.rojoProfundo, -0.085, 0.108, 0.116));
  g.add(caja(0.36, 0.035, 0.008, M.rojoProfundo, -0.085, 0.108, -0.116));
  g.add(caja(0.008, 0.035, 0.24, M.rojoProfundo, -0.261, 0.108, 0));
  // Ruedas.
  const rueda = new CylinderGeometry(0.042, 0.042, 0.035, 20);
  rueda.rotateX(Math.PI / 2);
  for (const x of [0.17, -0.17]) {
    for (const z of [0.105, -0.105]) {
      const r = new Mesh(rueda, M.carbon);
      r.position.set(x, 0.042, z);
      g.add(r);
    }
  }
  g.add(sombra(0.7, 0.36, 0.4));
  return g;
}

// --- Mesa virtual --------------------------------------------------------
export const MESA = { ancho: 1.5, fondo: 0.78 };

export interface MesaArmada {
  raiz: Group;
  /** Patas de 1 m hacia abajo: se estiran con `patas.scale.y`. */
  patas: Group;
}

/** Mesa con el tablero en y = 0. */
export function crearMesa(): MesaArmada {
  const raiz = new Group();
  raiz.add(caja(MESA.ancho, 0.04, MESA.fondo, M.madera, 0, -0.02, 0));
  const patas = new Group();
  patas.position.y = -0.04;
  for (const x of [-1, 1]) {
    for (const z of [-1, 1]) {
      patas.add(
        caja(
          0.06,
          1,
          0.06,
          M.maderaOscura,
          x * (MESA.ancho / 2 - 0.08),
          -0.5,
          z * (MESA.fondo / 2 - 0.08),
        ),
      );
    }
  }
  raiz.add(patas);
  return { raiz, patas };
}

// --- Tarima de la bienvenida --------------------------------------------
export function crearTarima(): Group {
  const g = new Group();
  const arriba = new Mesh(new CylinderGeometry(0.24, 0.24, 0.02, 48), M.verde);
  arriba.position.y = 0.02;
  const medio = new Mesh(new CylinderGeometry(0.26, 0.26, 0.02, 48), M.ambar);
  const base = new Mesh(new CylinderGeometry(0.25, 0.2, 0.03, 48), M.cobre);
  base.position.y = -0.025;
  g.add(arriba, medio, base);
  return g;
}

// --- Mapa de Cali --------------------------------------------------------
export const MAPA = { ancho: 0.8, fondo: 0.6, alto: 0.016 };

// Calles del mapa (metros, en el tablero; x: oriente +, z: sur +). Cada
// refugio tiene su esquina, justo al frente de la casa.
const ESQUINA = {
  inicio: [0.28, 0.25],
  norte: [0.04, -0.105],
  occidente: [-0.165, 0.075],
  centro: [0.0165, 0.03],
  oriente: [0.19, 0.1],
  sur: [-0.026, 0.225],
} as const;
type Esquina = keyof typeof ESQUINA;

const CALLES: [Esquina, Esquina][] = [
  ['inicio', 'sur'],
  ['inicio', 'oriente'],
  ['sur', 'centro'],
  ['oriente', 'centro'],
  ['centro', 'norte'],
  ['centro', 'occidente'],
  ['occidente', 'sur'],
  ['norte', 'oriente'],
];

// Recorrido del camión hasta cada refugio (mismo orden de REFUGIOS): sale
// de la esquina del mapa y atraviesa la ciudad por las calles, pasando por
// otras zonas antes de llegar.
const RECORRIDOS: Esquina[][] = [
  ['inicio', 'sur', 'occidente', 'centro', 'norte'], // Floralia (Norte)
  ['inicio', 'oriente', 'norte', 'centro', 'occidente'], // Siloé (Occidente)
  ['inicio', 'sur', 'occidente', 'centro'], // Jairo Varela (Centro)
  ['inicio', 'sur', 'centro', 'norte', 'oriente'], // Aguablanca (Oriente)
  ['inicio', 'oriente', 'centro', 'occidente', 'sur'], // Meléndez (Sur)
];

/** Puntos por los que pasa el camión, en el tablero del mapa. */
export function recorridoHasta(refugio: number): Vector3[] {
  return RECORRIDOS[refugio].map(
    (e) => new Vector3(ESQUINA[e][0], MAPA.alto, ESQUINA[e][1]),
  );
}

export function crearMapa(): Group {
  const g = new Group();
  const { ancho: w, fondo: d, alto: h } = MAPA;
  g.add(caja(w + 0.04, 0.008, d + 0.04, M.crema, 0, 0.004, 0));
  g.add(caja(w, h - 0.008, d, M.verde, 0, 0.008 + (h - 0.008) / 2, 0));
  // Zonas en tonos cobrizos y cafés, como el mapa de la página.
  const zonas: [number, number, number, number, string][] = [
    [0.04, -0.2, 0.13, 0.08, '#C9824F'], // Norte
    [-0.14, 0.0, 0.1, 0.12, '#DDB483'], // Occidente
    [0.03, -0.04, 0.1, 0.09, '#B5622F'], // Centro
    [0.2, 0.04, 0.12, 0.13, '#E0A040'], // Oriente
    [-0.02, 0.18, 0.13, 0.09, '#9A5A32'], // Sur
  ];
  for (const [x, z, rx, rz, color] of zonas) {
    const zona = new Mesh(new CylinderGeometry(1, 1, 0.004, 32), mate(color));
    zona.scale.set(rx, 1, rz);
    zona.position.set(x, h + 0.002, z);
    g.add(zona);
  }
  // Calles: unen las zonas y es por donde anda el camión.
  const asfalto = mate('#FFF3DC');
  for (const [desde, hasta] of CALLES) {
    const [x0, z0] = ESQUINA[desde];
    const [x1, z1] = ESQUINA[hasta];
    const largo = Math.hypot(x1 - x0, z1 - z0);
    const calle = caja(largo + 0.022, 0.003, 0.022, asfalto, (x0 + x1) / 2, h + 0.0052, (z0 + z1) / 2);
    calle.rotation.y = Math.atan2(-(z1 - z0), x1 - x0);
    g.add(calle);
  }
  // Río Cauca al oriente.
  g.add(caja(0.028, 0.004, d * 0.94, M.rio, w / 2 - 0.05, h + 0.002, 0));
  // Cerros al occidente.
  const cerro = new SphereGeometry(1, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2);
  const cerros: [number, number, number][] = [
    [-0.24, 0.08, 0.05],
    [-0.1, 0.1, 0.075],
    [0.04, 0.085, 0.055],
    [0.17, 0.095, 0.065],
  ];
  for (const [z, r, alto] of cerros) {
    const c = new Mesh(cerro, M.verdeOscuro);
    c.scale.set(r * 0.7, alto, r);
    c.position.set(-w / 2 + 0.07, h, z);
    g.add(c);
  }
  g.add(sombra(w * 1.3, d * 1.35, 0.34));
  return g;
}

export function crearCasa(urgente: boolean, alto: number): Group {
  const grupo = encajar(
    modelo(urgente ? 'casa_roja' : 'casa_amarilla'),
    alto * 1.2,
    alto,
    alto * 1.2,
  );
  grupo.add(zonaDeToque(alto * 1.5, alto * 1.4, alto * 1.5));
  return grupo;
}

/** Aro que marca la casa elegida. */
export function crearAro(): Mesh {
  const aro = new Mesh(new TorusGeometry(0.075, 0.007, 10, 40), M.rojo);
  aro.rotation.x = Math.PI / 2;
  return aro;
}

// --- Carpa (refugio temporal) -------------------------------------------
export function crearCarpa(): Group {
  const a = 1.75; // medio ancho
  const h = 2.5; // alto de la cumbrera
  const d = 3.6; // fondo
  const g = new Group();
  const largo = Math.hypot(a, h);
  const giro = Math.asin(a / largo);
  for (const lado of [-1, 1]) {
    const lona = new PlaneGeometry(d, largo);
    lona.rotateY(Math.PI / 2);
    const panel = new Mesh(lona, M.lona);
    panel.position.set((lado * a) / 2, h / 2, 0);
    panel.rotation.z = lado * giro;
    g.add(panel);
    // Franja roja abajo.
    const franja = new PlaneGeometry(d, 0.32);
    franja.rotateY(Math.PI / 2);
    const banda = new Mesh(franja, M.lonaRoja);
    const t = 0.16 / largo;
    banda.position.set(lado * a * (1 - t) - lado * 0.004, h * t, 0);
    banda.rotation.z = lado * giro;
    g.add(banda);
  }
  // Pared del fondo (queda detrás de la persona) con la cruz roja.
  const triangulo = new Shape();
  triangulo.moveTo(-a, 0);
  triangulo.lineTo(a, 0);
  triangulo.lineTo(0, h);
  triangulo.closePath();
  const fondo = new Mesh(new ShapeGeometry(triangulo), M.lona);
  fondo.position.z = d / 2;
  g.add(fondo);
  g.add(caja(0.5, 0.15, 0.01, M.rojo, 0, 1.2, d / 2 - 0.01));
  g.add(caja(0.15, 0.5, 0.01, M.rojo, 0, 1.2, d / 2 - 0.01));
  // Palos: cumbrera y dos parales al frente.
  const palo = M.maderaOscura;
  g.add(caja(0.05, 0.05, d, palo, 0, h - 0.03, 0));
  g.add(caja(0.05, h, 0.05, palo, 0, h / 2, d / 2 - 0.03));
  for (const lado of [-1, 1]) {
    const paral = caja(0.05, largo, 0.05, palo, (lado * a) / 2, h / 2, -d / 2);
    paral.rotation.z = lado * giro;
    g.add(paral);
  }
  // Estera en el piso.
  const estera = new Mesh(
    new PlaneGeometry(a * 2 - 0.5, d - 0.3),
    mate(COLOR.salvia, { transparent: true, opacity: 0.22, depthWrite: false }),
  );
  estera.rotation.x = -Math.PI / 2;
  estera.position.y = 0.006;
  g.add(estera);
  return g;
}
