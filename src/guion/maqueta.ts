// ============================================================
// maqueta.ts — lo que aparece sobre la mesa, en dos partes
// separadas:
//
//   · El CENTRO DE ACOPIO (izquierda): es el puesto de la persona.
//     Su estantería de madera, el letrero "CA" y, encima, el panel
//     con las opciones para gestionar las donaciones.
//   · El MAPA DE CALI (derecha): las cinco zonas con el mismo
//     contorno y los mismos colores del mapa de la página web. Sirve
//     para enviar las donaciones. No lleva casas ni base redonda.
// ============================================================
import {
  ExtrudeGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  Shape,
  SphereGeometry,
  Vector2,
  Vector3,
} from '@iwsdk/core';
import { COLOR } from '../datos.js';
import { crearEstanteria, sombra } from '../modelos.js';
import { Etiqueta } from '../texto.js';
import { ZONAS, type Zona } from './estado.js';
import { COLOR_ZONA, ETIQUETAS_PX, POLIGONOS_PX, PX_ALTO, PX_CENTRO } from './zonas-cali.js';

const mate = (color: string) =>
  new MeshStandardMaterial({ color, roughness: 0.88, metalness: 0 });

/** Alto del mapa de norte a sur, en metros. */
export const ALTO_MAPA = 0.6;
const ESCALA_PX = ALTO_MAPA / PX_ALTO;
/** Grosor de las zonas. */
export const GROSOR_ZONA = 0.022;
/** Dónde va cada parte sobre la mesa (x: derecha +, z: hacia la persona +). */
export const POS_CENTRO_ACOPIO = new Vector3(-0.44, 0, -0.06);
export const POS_MAPA = new Vector3(0.4, 0, 0.02);
export const ANCHO_ESTANTERIA = 0.6;
/** Punto del borde donde se para el gato. */
export const POS_GATO = new Vector3(0.72, 0, 0.28);

const pxAMetros = (px: number, py: number): [number, number] => [
  (px - PX_CENTRO.x) * ESCALA_PX,
  (py - PX_CENTRO.y) * ESCALA_PX,
];

export interface ZonaMaqueta {
  /** Se escala desde el centro de la zona (para crecer o resaltarse). */
  grupo: Group;
  material: MeshStandardMaterial;
  /** Centro de la zona, en la maqueta. */
  centro: Vector3;
}

export interface Maqueta {
  raiz: Group;
  mapa: Group;
  zonas: Record<Zona, ZonaMaqueta>;
  centroAcopio: Group;
  /** Punto del centro de acopio donde va el panel de opciones. */
  puestoPanel: Vector3;
  /** Todo lo que "crece" al colocarla, en orden. */
  crecen: Group[];
}

function crearMapa(): { mapa: Group; zonas: Record<Zona, ZonaMaqueta>; crecen: Group[] } {
  const mapa = new Group();
  mapa.position.copy(POS_MAPA);
  const crecen: Group[] = [];
  const zonas = {} as Record<Zona, ZonaMaqueta>;

  for (const nombre of ZONAS) {
    const lista = POLIGONOS_PX[nombre];
    const [cx, cz] = pxAMetros(...ETIQUETAS_PX[nombre]);
    // Contorno de la zona, medido desde su propio centro.
    const puntos: Vector2[] = [];
    for (let i = 0; i < lista.length; i += 2) {
      const [x, z] = pxAMetros(lista[i], lista[i + 1]);
      puntos.push(new Vector2(x - cx, z - cz));
    }
    const geometria = new ExtrudeGeometry(new Shape(puntos), {
      depth: GROSOR_ZONA * 0.72,
      bevelEnabled: true,
      bevelThickness: GROSOR_ZONA * 0.14,
      bevelSize: 0.002,
      bevelOffset: -0.003, // deja una ranura entre zonas, como en la página
      bevelSegments: 2,
    });
    // La forma está en (x, z): se acuesta y queda entre y = 0 y el grosor.
    geometria.rotateX(Math.PI / 2);
    geometria.translate(0, GROSOR_ZONA * 0.86, 0);
    const material = mate(COLOR_ZONA[nombre]);
    const grupo = new Group();
    grupo.position.set(cx, 0, cz);
    grupo.add(new Mesh(geometria, material));
    // Nombre de la zona, acostado encima.
    const letrero = new Etiqueta(0.11);
    letrero.escribir(nombre, COLOR.azul);
    letrero.malla.position.set(0, GROSOR_ZONA + 0.003, 0);
    letrero.malla.rotation.x = -Math.PI / 2;
    grupo.add(letrero.malla);
    mapa.add(grupo);
    crecen.push(grupo);
    zonas[nombre] = { grupo, material, centro: new Vector3(POS_MAPA.x + cx, GROSOR_ZONA, POS_MAPA.z + cz) };
  }

  // Cerros al occidente (verdes, como las colinas de la página).
  const cerros = new Group();
  const forma = new SphereGeometry(1, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2);
  const tonos = ['#9CC78A', '#86B874', '#B3D49F', '#79AE68'];
  const lugares: [number, number, number, number][] = [
    [-0.275, -0.11, 0.05, 0.05],
    [-0.3, -0.02, 0.065, 0.075],
    [-0.285, 0.08, 0.055, 0.06],
    [-0.255, 0.17, 0.05, 0.045],
  ];
  lugares.forEach(([x, z, radio, alto], i) => {
    const cerro = new Mesh(forma, mate(tonos[i]));
    cerro.scale.set(radio * 0.8, alto, radio);
    cerro.position.set(x, 0, z);
    cerros.add(cerro);
  });
  mapa.add(cerros);
  crecen.push(cerros);
  mapa.add(sombra(0.75, 0.85, 0.3));
  return { mapa, zonas, crecen };
}

export function crearMaqueta(): Maqueta {
  const raiz = new Group();
  const { mapa, zonas, crecen } = crearMapa();
  raiz.add(mapa);

  // Centro de acopio: la estantería de madera y el letrero "CA".
  const centroAcopio = new Group();
  centroAcopio.position.copy(POS_CENTRO_ACOPIO);
  centroAcopio.add(crearEstanteria(ANCHO_ESTANTERIA));
  const ca = new Etiqueta(0.16);
  ca.escribir('CA', COLOR.azul);
  ca.malla.position.set(-0.22, 0.006, 0.16);
  ca.malla.rotation.x = -Math.PI / 2;
  centroAcopio.add(ca.malla);
  raiz.add(centroAcopio);
  // El centro de acopio crece primero; después, el mapa zona por zona.
  crecen.unshift(centroAcopio);

  const puestoPanel = new Vector3(POS_CENTRO_ACOPIO.x, 0.74, POS_CENTRO_ACOPIO.z - 0.02);
  return { raiz, mapa, zonas, centroAcopio, puestoPanel, crecen };
}
