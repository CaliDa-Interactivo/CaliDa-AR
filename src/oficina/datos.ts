// ============================================================
// datos.ts — contenido del juego "CaliDa RA · Centro de acopio":
// categorías y productos de la estantería (los de la página), defectos, municipios del Valle del
// Cauca y la dificultad de cada jornada (lunes a viernes).
// Sin lógica ni three.js.
// ============================================================

export type IdCategoria = 'alimento' | 'aseo' | 'ropa' | 'medicamentos' | 'construccion';

/** Producto (subcategoría) de la página, con su modelo 3D. */
export interface Producto {
  /** El mismo id de la página (js/data.js). */
  id: string;
  nombre: string;
  /** Clave del modelo en assets.ts. */
  modelo: string;
  /** Tamaño del objeto suelto (ancho, alto) en metros. */
  medida: [number, number];
}

export interface Categoria {
  id: IdCategoria;
  nombre: string;
  /** Nombre corto para contadores y pedidos. */
  corto: string;
  /** Lo que tiene un objeto dañado de esta categoría. */
  defecto: string;
  /** Sus productos, como en la estantería de la página. */
  subs: Producto[];
  /** Producto que hace de ícono de la categoría (botones de mensajes). */
  icono: number;
}

/** Las categorías y productos de la estantería de la página, con los mismos nombres. */
export const CATEGORIAS: Categoria[] = [
  {
    id: 'alimento',
    nombre: 'Alimento',
    corto: 'Alimento',
    defecto: 'vencido',
    icono: 1,
    subs: [
      { id: 'alimento-agua', nombre: 'Agua', modelo: 'ra_agua', medida: [0.04, 0.075] },
      { id: 'alimento-no-perecederos', nombre: 'No perecederos', modelo: 'ra_alimento_no_perecedero', medida: [0.045, 0.055] },
      { id: 'alimento-bebe', nombre: 'Comida de bebé', modelo: 'ra_comida_bebe', medida: [0.04, 0.05] },
      { id: 'alimento-animal', nombre: 'Comida para animales', modelo: 'ra_comida_animal', medida: [0.05, 0.065] },
    ],
  },
  {
    id: 'aseo',
    nombre: 'Aseo',
    corto: 'Aseo',
    defecto: 'empaque dañado',
    icono: 0,
    subs: [
      { id: 'aseo-corporal', nombre: 'Higiene corporal', modelo: 'ra_papel_higienico', medida: [0.045, 0.05] },
      { id: 'aseo-bucal', nombre: 'Higiene bucal', modelo: 'ra_higiene_bucal', medida: [0.05, 0.06] },
      { id: 'aseo-limpieza-hogar', nombre: 'Limpieza del hogar', modelo: 'ra_jabon', medida: [0.045, 0.06] },
    ],
  },
  {
    id: 'ropa',
    nombre: 'Ropa',
    corto: 'Ropa',
    defecto: 'rota',
    icono: 0,
    subs: [
      { id: 'ropa-hombre', nombre: 'Ropa de hombre', modelo: 'ra_camisa', medida: [0.065, 0.055] },
      { id: 'ropa-mujer', nombre: 'Ropa de mujer', modelo: 'ra_vestido', medida: [0.05, 0.065] },
      { id: 'ropa-ninos', nombre: 'Ropa de niños', modelo: 'ra_overol', medida: [0.055, 0.06] },
    ],
  },
  {
    id: 'medicamentos',
    nombre: 'Medicamentos',
    corto: 'Medicamentos',
    defecto: 'vencido',
    icono: 0,
    subs: [
      { id: 'medicamentos-analgesicos', nombre: 'Analgésicos', modelo: 'ra_analgesicos', medida: [0.045, 0.04] },
      { id: 'medicamentos-antibioticos', nombre: 'Antibióticos', modelo: 'ra_antibioticos', medida: [0.04, 0.05] },
      { id: 'medicamentos-cronicos', nombre: 'Crónicos (control)', modelo: 'ra_cronico', medida: [0.04, 0.05] },
    ],
  },
  {
    id: 'construccion',
    nombre: 'Construcción',
    corto: 'Construcción',
    defecto: 'dañado',
    icono: 0,
    subs: [
      { id: 'construccion-herramientas', nombre: 'Herramientas', modelo: 'ra_herramientas', medida: [0.07, 0.05] },
      { id: 'construccion-materiales', nombre: 'Material de construcción', modelo: 'ra_material_construccion', medida: [0.06, 0.05] },
      { id: 'construccion-proteccion', nombre: 'Protección personal', modelo: 'ra_proteccion_personal', medida: [0.06, 0.05] },
    ],
  },
];

export const indiceCategoria = (id: IdCategoria): number =>
  CATEGORIAS.findIndex((c) => c.id === id);

export const categoriaDe = (id: IdCategoria): Categoria => CATEGORIAS[indiceCategoria(id)];

/** Un producto al azar de la categoría (índice en `subs`). */
export const subAlAzar = (id: IdCategoria): number => Math.floor(Math.random() * categoriaDe(id).subs.length);

/** Tope de cada categoría en la repisa (2 líneas × 15 puestos). */
export const TOPE = 30;
export const ALERTA = 25;

export const MUNICIPIOS = [
  'Cali',
  'Jamundí',
  'Yumbo',
  'Palmira',
  'Candelaria',
  'Florida',
  'Pradera',
  'El Cerrito',
  'Buga',
  'Tuluá',
  'Buenaventura',
  'Dagua',
  'La Cumbre',
  'Cartago',
  'Zarzal',
  'Roldanillo',
  'Sevilla',
  'Caicedonia',
];

export const DIAS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes'];

/** Cuántas cajas caben en la pila de la mesa; las demás se pierden. */
export const MAX_PILA = 8;

// Paleta de CaliDa para la oficina.
export const COLOR = {
  azul: '#011E41',
  azulMarino: '#0B1E3F',
  coral: '#F67B5A',
  rojo: '#CC0100',
  rojoProfundo: '#A5121A',
  crema: '#FFF8ED',
  arena: '#E8E1D5',
  carbon: '#514B46',
  petroleo: '#426D8C',
  naranja: '#E47832',
  amarillo: '#FDD794',
  verde: '#3E7A6C',
  gris: '#9A948C',
  madera: '#A8623A',
  maderaClara: '#C98F62',
};

// ---- Jornadas -------------------------------------------------

export type Evento =
  | { tipo: 'cajas'; en: number; cantidad: number }
  | {
      tipo: 'pedido';
      en: number;
      municipio: string;
      pide: Partial<Record<IdCategoria, number>>;
      /** Segundos del reloj del pedido. */
      plazo: number;
      /** Pedido urgente desde el inicio (lluvias, inundación). */
      urgente?: string;
      familias: number;
    };

export interface Jornada {
  /** Segundos de juego que dura el día (8:00 a. m. → 5:00 p. m.). */
  duracion: number;
  /** Fracción de objetos dañados. */
  danados: number;
  /** Objetos por caja: [mínimo, máximo]. */
  porCaja: [number, number];
  eventos: Evento[];
}

/**
 * Cada día llegan más cajas, hay más objetos dañados, los relojes son más
 * cortos y aparecen más urgencias. (Base: a esto se le suman las tareas
 * rápidas de `conMasTareas`.)
 */
const JORNADAS_BASE: Jornada[] = [
  {
    // Lunes (incluye el tutorial)
    duracion: 270,
    danados: 0.15,
    porCaja: [5, 6],
    eventos: [
      { tipo: 'cajas', en: 4, cantidad: 2 },
      { tipo: 'pedido', en: 70, municipio: 'Jamundí', pide: { alimento: 2, aseo: 2 }, plazo: 120, familias: 3 },
      { tipo: 'cajas', en: 120, cantidad: 2 },
      { tipo: 'pedido', en: 170, municipio: 'Palmira', pide: { ropa: 2, medicamentos: 2 }, plazo: 110, familias: 3 },
    ],
  },
  {
    // Martes
    duracion: 270,
    danados: 0.2,
    porCaja: [6, 7],
    eventos: [
      { tipo: 'cajas', en: 3, cantidad: 3 },
      { tipo: 'pedido', en: 40, municipio: 'Tuluá', pide: { medicamentos: 3, alimento: 3 }, plazo: 100, familias: 4 },
      { tipo: 'cajas', en: 95, cantidad: 2 },
      { tipo: 'pedido', en: 130, municipio: 'Yumbo', pide: { aseo: 2, construccion: 2 }, plazo: 90, familias: 3 },
      {
        tipo: 'pedido',
        en: 200,
        municipio: 'Candelaria',
        pide: { alimento: 3, medicamentos: 2 },
        plazo: 70,
        urgente: 'Inundación en Candelaria',
        familias: 5,
      },
    ],
  },
  {
    // Miércoles
    duracion: 285,
    danados: 0.25,
    porCaja: [6, 8],
    eventos: [
      { tipo: 'cajas', en: 3, cantidad: 3 },
      { tipo: 'pedido', en: 30, municipio: 'Buga', pide: { ropa: 3, aseo: 2 }, plazo: 90, familias: 4 },
      { tipo: 'cajas', en: 80, cantidad: 3 },
      {
        tipo: 'pedido',
        en: 115,
        municipio: 'Buenaventura',
        pide: { alimento: 3, construccion: 3 },
        plazo: 65,
        urgente: 'Lluvias en Buenaventura',
        familias: 6,
      },
      { tipo: 'pedido', en: 190, municipio: 'Florida', pide: { medicamentos: 3, alimento: 3 }, plazo: 80, familias: 4 },
    ],
  },
  {
    // Jueves
    duracion: 300,
    danados: 0.3,
    porCaja: [7, 8],
    eventos: [
      { tipo: 'cajas', en: 3, cantidad: 3 },
      { tipo: 'pedido', en: 25, municipio: 'Dagua', pide: { construccion: 3, ropa: 3 }, plazo: 80, familias: 5 },
      { tipo: 'cajas', en: 70, cantidad: 3 },
      {
        tipo: 'pedido',
        en: 100,
        municipio: 'El Cerrito',
        pide: { alimento: 4, aseo: 2 },
        plazo: 60,
        urgente: 'Inundación en El Cerrito',
        familias: 6,
      },
      { tipo: 'cajas', en: 150, cantidad: 2 },
      { tipo: 'pedido', en: 170, municipio: 'Cartago', pide: { medicamentos: 3, aseo: 3 }, plazo: 70, familias: 5 },
      {
        tipo: 'pedido',
        en: 235,
        municipio: 'Pradera',
        pide: { construccion: 2, alimento: 3 },
        plazo: 55,
        urgente: 'Lluvias en Pradera',
        familias: 5,
      },
    ],
  },
  {
    // Viernes
    duracion: 300,
    danados: 0.35,
    porCaja: [7, 9],
    eventos: [
      { tipo: 'cajas', en: 3, cantidad: 4 },
      {
        tipo: 'pedido',
        en: 20,
        municipio: 'Buenaventura',
        pide: { alimento: 4, medicamentos: 3 },
        plazo: 55,
        urgente: 'Lluvias en Buenaventura',
        familias: 7,
      },
      { tipo: 'cajas', en: 75, cantidad: 3 },
      { tipo: 'pedido', en: 105, municipio: 'Sevilla', pide: { ropa: 4, aseo: 3 }, plazo: 65, familias: 5 },
      { tipo: 'cajas', en: 150, cantidad: 3 },
      {
        tipo: 'pedido',
        en: 175,
        municipio: 'Jamundí',
        pide: { construccion: 4, medicamentos: 3 },
        plazo: 55,
        urgente: 'Inundación en Jamundí',
        familias: 7,
      },
      { tipo: 'pedido', en: 235, municipio: 'Zarzal', pide: { alimento: 3, ropa: 3 }, plazo: 55, familias: 5 },
    ],
  },
];

/**
 * Más tareas para trabajar más rápido: entre los eventos grandes llegan
 * cajas sueltas y ENCARGOS RÁPIDOS (pedidos pequeños de 1 o 2 cosas con un
 * reloj corto), así siempre hay algo que hacer. Lunes desde el minuto 2
 * (después del tutorial); cada día empiezan antes y son más seguidos.
 */
function conMasTareas(j: Jornada, dia: number): Jornada {
  const eventos = [...j.eventos];
  const libre = (tipo: Evento['tipo'], en: number) => !eventos.some((e) => e.tipo === tipo && Math.abs(e.en - en) < 15);
  const orden: IdCategoria[] = ['alimento', 'aseo', 'medicamentos', 'ropa', 'construccion'];
  const fin = j.duracion - 35;
  // Cajas sueltas.
  const cadaCaja = 48 - dia * 4;
  for (let t = dia === 0 ? 145 : 30, k = 0; t < fin; t += cadaCaja, k++) {
    if (libre('cajas', t)) {
      eventos.push({ tipo: 'cajas', en: t, cantidad: dia >= 3 && k % 2 === 0 ? 2 : 1 });
    }
  }
  // Encargos rápidos.
  const cadaEncargo = 44 - dia * 3;
  for (let t = dia === 0 ? 150 : 45, k = 0; t < fin; t += cadaEncargo, k++) {
    if (!libre('pedido', t)) {
      continue;
    }
    const a = orden[(dia + k) % orden.length];
    const b = orden[(dia + k + 2) % orden.length];
    const pide: Partial<Record<IdCategoria, number>> = k % 2 === 0 ? { [a]: 2 } : { [a]: 1, [b]: 1 };
    eventos.push({
      tipo: 'pedido',
      en: t,
      municipio: MUNICIPIOS[(dia * 7 + k * 5 + 3) % MUNICIPIOS.length],
      pide,
      plazo: 75 - dia * 4,
      familias: 2,
    });
  }
  eventos.sort((x, y) => x.en - y.en);
  return { ...j, eventos };
}

export const JORNADAS: Jornada[] = JORNADAS_BASE.map(conMasTareas);

/** Inventario con que abre el centro el lunes (Ropa casi llena a propósito). */
export const INVENTARIO_INICIAL: Record<IdCategoria, number> = {
  alimento: 10,
  aseo: 9,
  ropa: 26,
  medicamentos: 7,
  construccion: 6,
};

/** Probabilidad de cada categoría dentro de las cajas que llegan. */
export const PESO_CATEGORIA: Record<IdCategoria, number> = {
  alimento: 1.3,
  aseo: 1.1,
  ropa: 1.3,
  medicamentos: 0.9,
  construccion: 0.8,
};

export const MENSAJE_FINAL =
  'En la vida real, la Cruz Roja recibe las donaciones en centros de acopio, las revisa una por una, aparta lo que no sirve y las despacha según lo que pide cada municipio. Por eso es mejor donar lo que se necesita y en buen estado.';
