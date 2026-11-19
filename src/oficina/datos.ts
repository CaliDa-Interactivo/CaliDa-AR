// ============================================================
// datos.ts — contenido del juego "CaliDa RA · Centro de acopio":
// categorías de la repisa, defectos, municipios del Valle del
// Cauca y la dificultad de cada jornada (lunes a viernes).
// Sin lógica ni three.js.
// ============================================================

export type IdCategoria = 'alimentos' | 'agua' | 'ropa' | 'cobijas' | 'higiene' | 'panales';

export interface Categoria {
  id: IdCategoria;
  nombre: string;
  /** Nombre corto para contadores y pedidos. */
  corto: string;
  /** Lo que tiene un objeto dañado de esta categoría. */
  defecto: string;
}

export const CATEGORIAS: Categoria[] = [
  { id: 'alimentos', nombre: 'Alimentos no perecederos', corto: 'Alimentos', defecto: 'vencido' },
  { id: 'agua', nombre: 'Agua', corto: 'Agua', defecto: 'abierta' },
  { id: 'ropa', nombre: 'Ropa', corto: 'Ropa', defecto: 'rota' },
  { id: 'cobijas', nombre: 'Cobijas', corto: 'Cobijas', defecto: 'rota' },
  { id: 'higiene', nombre: 'Higiene', corto: 'Higiene', defecto: 'empaque dañado' },
  { id: 'panales', nombre: 'Pañales', corto: 'Pañales', defecto: 'empaque dañado' },
];

export const indiceCategoria = (id: IdCategoria): number =>
  CATEGORIAS.findIndex((c) => c.id === id);

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
  rojo: '#C80000',
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
 * cortos y aparecen más urgencias.
 */
export const JORNADAS: Jornada[] = [
  {
    // Lunes (incluye el tutorial)
    duracion: 270,
    danados: 0.15,
    porCaja: [5, 6],
    eventos: [
      { tipo: 'cajas', en: 4, cantidad: 2 },
      { tipo: 'pedido', en: 70, municipio: 'Jamundí', pide: { agua: 2, alimentos: 2 }, plazo: 120, familias: 3 },
      { tipo: 'cajas', en: 120, cantidad: 2 },
      { tipo: 'pedido', en: 170, municipio: 'Palmira', pide: { cobijas: 2, ropa: 2 }, plazo: 110, familias: 3 },
    ],
  },
  {
    // Martes
    duracion: 270,
    danados: 0.2,
    porCaja: [6, 7],
    eventos: [
      { tipo: 'cajas', en: 3, cantidad: 3 },
      { tipo: 'pedido', en: 40, municipio: 'Tuluá', pide: { cobijas: 3, agua: 3 }, plazo: 100, familias: 4 },
      { tipo: 'cajas', en: 95, cantidad: 2 },
      { tipo: 'pedido', en: 130, municipio: 'Yumbo', pide: { higiene: 2, panales: 2 }, plazo: 90, familias: 3 },
      {
        tipo: 'pedido',
        en: 200,
        municipio: 'Candelaria',
        pide: { agua: 3, alimentos: 2 },
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
      { tipo: 'pedido', en: 30, municipio: 'Buga', pide: { ropa: 3, higiene: 2 }, plazo: 90, familias: 4 },
      { tipo: 'cajas', en: 80, cantidad: 3 },
      {
        tipo: 'pedido',
        en: 115,
        municipio: 'Buenaventura',
        pide: { agua: 3, cobijas: 3 },
        plazo: 65,
        urgente: 'Lluvias en Buenaventura',
        familias: 6,
      },
      { tipo: 'pedido', en: 190, municipio: 'Florida', pide: { panales: 3, alimentos: 3 }, plazo: 80, familias: 4 },
    ],
  },
  {
    // Jueves
    duracion: 300,
    danados: 0.3,
    porCaja: [7, 8],
    eventos: [
      { tipo: 'cajas', en: 3, cantidad: 3 },
      { tipo: 'pedido', en: 25, municipio: 'Dagua', pide: { cobijas: 3, ropa: 3 }, plazo: 80, familias: 5 },
      { tipo: 'cajas', en: 70, cantidad: 3 },
      {
        tipo: 'pedido',
        en: 100,
        municipio: 'El Cerrito',
        pide: { agua: 4, higiene: 2 },
        plazo: 60,
        urgente: 'Inundación en El Cerrito',
        familias: 6,
      },
      { tipo: 'cajas', en: 150, cantidad: 2 },
      { tipo: 'pedido', en: 170, municipio: 'Cartago', pide: { alimentos: 3, panales: 3 }, plazo: 70, familias: 5 },
      {
        tipo: 'pedido',
        en: 235,
        municipio: 'Pradera',
        pide: { cobijas: 2, agua: 3 },
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
        pide: { agua: 4, cobijas: 3 },
        plazo: 55,
        urgente: 'Lluvias en Buenaventura',
        familias: 7,
      },
      { tipo: 'cajas', en: 75, cantidad: 3 },
      { tipo: 'pedido', en: 105, municipio: 'Sevilla', pide: { ropa: 4, higiene: 3 }, plazo: 65, familias: 5 },
      { tipo: 'cajas', en: 150, cantidad: 3 },
      {
        tipo: 'pedido',
        en: 175,
        municipio: 'Jamundí',
        pide: { alimentos: 4, panales: 3 },
        plazo: 55,
        urgente: 'Inundación en Jamundí',
        familias: 7,
      },
      { tipo: 'pedido', en: 235, municipio: 'Zarzal', pide: { cobijas: 3, agua: 3 }, plazo: 55, familias: 5 },
    ],
  },
];

/** Inventario con que abre el centro el lunes (Ropa casi llena a propósito). */
export const INVENTARIO_INICIAL: Record<IdCategoria, number> = {
  alimentos: 8,
  agua: 10,
  ropa: 26,
  cobijas: 6,
  higiene: 9,
  panales: 7,
};

/** Probabilidad de cada categoría dentro de las cajas que llegan. */
export const PESO_CATEGORIA: Record<IdCategoria, number> = {
  alimentos: 1.2,
  agua: 1.1,
  ropa: 1.3,
  cobijas: 0.9,
  higiene: 1,
  panales: 0.8,
};

export const MENSAJE_FINAL =
  'En la vida real, la Cruz Roja recibe las donaciones en centros de acopio, las revisa una por una, aparta lo que no sirve y las despacha según lo que pide cada municipio. Por eso es mejor donar lo que se necesita y en buen estado.';
