// ============================================================
// datos.ts — contenido de la experiencia (sin lógica ni three.js):
// productos de la estantería, refugios del mapa y situaciones.
// Mismos nombres y modelos de la página CaliDa.
// ============================================================

export type Categoria =
  | 'alimento'
  | 'aseo'
  | 'ropa'
  | 'medicamentos'
  | 'construccion';

export interface ProductoDato {
  id: string;
  nombre: string;
  categoria: Categoria;
  /** Archivo en public/models (sin .glb); también es su id en el catálogo. */
  modelo: string;
  /** Lo que vive la persona del refugio cuando le falta este producto. */
  situacion: string;
  /** Lo que pasa cuando lo recibe. */
  alivio: string;
}

export const PRODUCTOS: ProductoDato[] = [
  {
    id: 'alimento-agua',
    nombre: 'Agua',
    categoria: 'alimento',
    modelo: 'agua',
    situacion: 'Llevas horas sin tomar agua y bajo la carpa hace calor.',
    alivio: 'Por fin puedes tomar agua limpia.',
  },
  {
    id: 'alimento-no-perecederos',
    nombre: 'No perecederos',
    categoria: 'alimento',
    modelo: 'alimento_no_perecedero',
    situacion: 'Es de noche y tu familia no ha comido nada hoy.',
    alivio: 'Hoy hay comida para todos en la carpa.',
  },
  {
    id: 'alimento-bebe',
    nombre: 'Comida de bebé',
    categoria: 'alimento',
    modelo: 'comida_bebe',
    situacion: 'El bebé llora de hambre y no puede comer lo de los adultos.',
    alivio: 'El bebé come y por fin se duerme.',
  },
  {
    id: 'alimento-animal',
    nombre: 'Comida para animales',
    categoria: 'alimento',
    modelo: 'comida_animal',
    situacion: 'Tu perro te acompañó en todo y hoy no tienes qué darle.',
    alivio: 'Tu compañero come a tu lado.',
  },
  {
    id: 'aseo-corporal',
    nombre: 'Higiene corporal',
    categoria: 'aseo',
    modelo: 'papel_higienico',
    situacion: 'En el refugio hay un solo baño y no queda papel.',
    alivio: 'Algo tan sencillo te devuelve la tranquilidad.',
  },
  {
    id: 'aseo-bucal',
    nombre: 'Higiene bucal',
    categoria: 'aseo',
    modelo: 'higiene_bucal',
    situacion: 'Llevas tres días sin poder cepillarte los dientes.',
    alivio: 'Te sientes limpio otra vez.',
  },
  {
    id: 'aseo-limpieza-hogar',
    nombre: 'Limpieza del hogar',
    categoria: 'aseo',
    modelo: 'jabon',
    situacion: 'Hay que lavar los platos y la ropa de todos, y no hay jabón.',
    alivio: 'La carpa queda limpia y se evitan enfermedades.',
  },
  {
    id: 'ropa-hombre',
    nombre: 'Ropa de hombre',
    categoria: 'ropa',
    modelo: 'camisa',
    situacion: 'Saliste con lo que tenías puesto y esa ropa sigue mojada.',
    alivio: 'Te cambias y entras en calor.',
  },
  {
    id: 'ropa-mujer',
    nombre: 'Ropa de mujer',
    categoria: 'ropa',
    modelo: 'vestido',
    situacion: 'Tu mamá perdió toda su ropa entre los escombros.',
    alivio: 'Tu mamá vuelve a tener algo propio.',
  },
  {
    id: 'ropa-ninos',
    nombre: 'Ropa de niños',
    categoria: 'ropa',
    modelo: 'overol',
    situacion: 'La noche está fría y tu hijo no tiene con qué abrigarse.',
    alivio: 'Tu hijo duerme abrigado.',
  },
  {
    id: 'medicamentos-analgesicos',
    nombre: 'Analgésicos',
    categoria: 'medicamentos',
    modelo: 'analgesicos',
    situacion: 'Te duele la cabeza desde el temblor y no logras descansar.',
    alivio: 'El dolor baja y puedes dormir.',
  },
  {
    id: 'medicamentos-antibioticos',
    nombre: 'Antibióticos',
    categoria: 'medicamentos',
    modelo: 'antibioticos',
    situacion: 'La herida de tu brazo se está infectando.',
    alivio: 'La herida empieza a sanar.',
  },
  {
    id: 'medicamentos-cronicos',
    nombre: 'Crónicos (control)',
    categoria: 'medicamentos',
    modelo: 'cronico',
    situacion: 'A tu abuela se le acabó la medicina de la presión.',
    alivio: 'Tu abuela sigue su tratamiento.',
  },
  {
    id: 'construccion-herramientas',
    nombre: 'Herramientas',
    categoria: 'construccion',
    modelo: 'herramientas',
    situacion: 'La carpa se suelta con el viento y no tienes con qué asegurarla.',
    alivio: 'La carpa queda firme para la noche.',
  },
  {
    id: 'construccion-materiales',
    nombre: 'Material de construcción',
    categoria: 'construccion',
    modelo: 'material_construccion',
    situacion: 'Quieres empezar a reparar tu casa y no hay materiales.',
    alivio: 'Empiezas a levantar tu casa de nuevo.',
  },
  {
    id: 'construccion-proteccion',
    nombre: 'Protección personal',
    categoria: 'construccion',
    modelo: 'proteccion_personal',
    situacion: 'Hay que remover escombros y no tienes cómo protegerte.',
    alivio: 'Puedes trabajar sin lastimarte.',
  },
];

export const indiceProducto = (id: string): number =>
  PRODUCTOS.findIndex((p) => p.id === id);

export interface RefugioDato {
  nombre: string;
  zona: string;
  /** Urgente = casa roja; si no, amarilla (desabastecido). */
  urgente: boolean;
  /** Posición en el tablero del mapa, de -1 a 1 (x: oriente +, z: sur +). */
  mapa: [number, number];
  /** Ids de los tres productos que necesita. */
  necesita: [string, string, string];
}

export const REFUGIOS: RefugioDato[] = [
  {
    nombre: 'Refugio Floralia',
    zona: 'Norte',
    urgente: false,
    mapa: [0.12, -0.72],
    necesita: ['aseo-bucal', 'ropa-mujer', 'alimento-no-perecederos'],
  },
  {
    nombre: 'Refugio Siloé',
    zona: 'Occidente',
    urgente: true,
    mapa: [-0.5, 0.02],
    necesita: ['alimento-agua', 'medicamentos-analgesicos', 'ropa-ninos'],
  },
  {
    nombre: 'Refugio Jairo Varela',
    zona: 'Centro',
    urgente: true,
    mapa: [0.05, -0.18],
    necesita: ['alimento-bebe', 'aseo-corporal', 'medicamentos-antibioticos'],
  },
  {
    nombre: 'Refugio Aguablanca',
    zona: 'Oriente',
    urgente: true,
    mapa: [0.58, 0.12],
    necesita: [
      'alimento-agua',
      'construccion-herramientas',
      'medicamentos-cronicos',
    ],
  },
  {
    nombre: 'Refugio Meléndez',
    zona: 'Sur',
    urgente: false,
    mapa: [-0.08, 0.66],
    necesita: ['ropa-hombre', 'aseo-limpieza-hogar', 'alimento-animal'],
  },
];

/** Cuántos productos caben en la caja de donación. */
export const CUPO_CAJA = 6;

// Paleta de CaliDa.
export const COLOR = {
  rojo: '#CC0100',
  rojoProfundo: '#A5121A',
  azul: '#011E41',
  petroleo: '#426D8C',
  coral: '#F67751',
  amarillo: '#FDD794',
  ambar: '#E6A341',
  salvia: '#86B5A9',
  marfil: '#FFF8ED',
  crema: '#FFF6E6',
  arena: '#E8E1D5',
  carbon: '#514B46',
  cafe: '#8A3B12',
  madera: '#A8623A',
  carton: '#C99A62',
  verde: '#B3D49F',
};
