// ============================================================
// maqueta.ts — la maqueta de Cali que crece sobre la mesa: cinco
// zonas con casitas y, en medio, el centro de acopio marcado con
// "CA" y su estantería de madera. (Sin logo de la Cruz Roja.)
// ============================================================
import {
  CylinderGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  Vector3,
} from '@iwsdk/core';
import { COLOR } from '../datos.js';
import { crearCasa, crearEstanteria, sombra } from '../modelos.js';
import { Etiqueta } from '../texto.js';
import { ZONAS, type Zona } from './estado.js';

const mate = (color: string) =>
  new MeshStandardMaterial({ color, roughness: 0.9, metalness: 0 });

export const RADIO_MAQUETA = 0.36;
export const ALTO_BASE = 0.018;

// Centro de cada zona sobre la base (x: oriente +, z: sur +) y su color.
const LUGAR: Record<Zona, { x: number; z: number; color: string }> = {
  Norte: { x: 0.02, z: -0.25, color: '#C9824F' },
  Sur: { x: -0.02, z: 0.25, color: '#9A5A32' },
  Oriente: { x: 0.25, z: 0.02, color: '#E0A040' },
  Occidente: { x: -0.25, z: 0.0, color: '#DDB483' },
  Centro: { x: 0.11, z: -0.13, color: '#B5622F' },
};

export interface ZonaMaqueta {
  grupo: Group;
  /** Centro de la zona, en la maqueta. */
  centro: Vector3;
}

export interface Maqueta {
  raiz: Group;
  zonas: Record<Zona, ZonaMaqueta>;
  centroAcopio: Group;
  /** Todo lo que "crece" al colocarla, en orden. */
  crecen: Group[];
}

export function crearMaqueta(): Maqueta {
  const raiz = new Group();
  // Base redonda: borde crema y césped verde clarito.
  const borde = new Mesh(
    new CylinderGeometry(RADIO_MAQUETA + 0.015, RADIO_MAQUETA + 0.015, 0.008, 64),
    mate(COLOR.crema),
  );
  borde.position.y = 0.004;
  const cesped = new Mesh(
    new CylinderGeometry(RADIO_MAQUETA, RADIO_MAQUETA, ALTO_BASE - 0.008, 64),
    mate(COLOR.verde),
  );
  cesped.position.y = 0.008 + (ALTO_BASE - 0.008) / 2;
  raiz.add(borde, cesped, sombra(RADIO_MAQUETA * 2.5, RADIO_MAQUETA * 2.5, 0.32));

  const crecen: Group[] = [];
  const zonas = {} as Record<Zona, ZonaMaqueta>;
  for (const nombre of ZONAS) {
    const { x, z, color } = LUGAR[nombre];
    const grupo = new Group();
    grupo.position.set(x, ALTO_BASE, z);
    const parche = new Mesh(new CylinderGeometry(0.095, 0.095, 0.004, 32), mate(color));
    parche.position.y = 0.002;
    grupo.add(parche);
    // Tres casitas por zona (los modelos del equipo).
    const puestos: [number, number, number][] = [
      [-0.045, -0.02, 0.4],
      [0.04, -0.035, -0.3],
      [0.005, 0.045, 0.1],
    ];
    puestos.forEach(([cx, cz, giro], i) => {
      const casa = crearCasa(i === 0, 0.052);
      casa.position.set(cx, 0.004, cz);
      casa.rotation.y = giro;
      grupo.add(casa);
    });
    const letrero = new Etiqueta(0.12);
    letrero.escribir(nombre, COLOR.petroleo);
    letrero.malla.position.set(0, 0.012, 0.088);
    letrero.malla.rotation.x = -Math.PI / 2;
    grupo.add(letrero.malla);
    raiz.add(grupo);
    crecen.push(grupo);
    zonas[nombre] = { grupo, centro: new Vector3(x, ALTO_BASE, z) };
  }

  // Centro de acopio en medio: estantería de madera y el letrero "CA".
  const centroAcopio = new Group();
  centroAcopio.position.set(-0.03, ALTO_BASE, 0.03);
  const piso = new Mesh(new CylinderGeometry(0.085, 0.085, 0.006, 32), mate(COLOR.marfil));
  piso.position.y = 0.003;
  const estanteria = crearEstanteria(0.13);
  estanteria.position.set(0, 0.006, -0.015);
  const ca = new Etiqueta(0.11);
  ca.escribir('CA', COLOR.azul);
  // Acostado en el piso, al frente de la estantería (como los nombres de zona).
  ca.malla.position.set(0, 0.008, 0.062);
  ca.malla.rotation.x = -Math.PI / 2;
  centroAcopio.add(piso, estanteria, ca.malla);
  raiz.add(centroAcopio);
  crecen.push(centroAcopio);

  return { raiz, zonas, centroAcopio, crecen };
}
