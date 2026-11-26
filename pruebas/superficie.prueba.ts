// Prueba de buscarSuperficie: la estantería queda SOBRE una mesa real.
// Corre con: npm run prueba:superficie
import assert from 'node:assert/strict';
import { RejillaPlana, buscarSuperficie, buscarSuperficieEnMalla, type MallaReal, type Superficie } from '../src/superficie.js';

let pruebas = 0;
const prueba = (nombre: string, fn: () => void) => {
  fn();
  pruebas++;
  console.log(`✓ ${nombre}`);
};

/** Plano horizontal simulado: rectángulo w × d centrado en (x, y, z), girado `giro` en Y. */
function plano(x: number, y: number, z: number, w: number, d: number, giro = 0, etiqueta = 'table') {
  const c = Math.cos(giro);
  const s = Math.sin(giro);
  // Columna 0 = eje x del plano, columna 2 = eje z (rotación en Y), traslación.
  const matrix = new Float32Array([c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, x, y, z, 1]);
  const polygon = [
    { x: -w / 2, y: 0, z: -d / 2 },
    { x: w / 2, y: 0, z: -d / 2 },
    { x: w / 2, y: 0, z: d / 2 },
    { x: -w / 2, y: 0, z: d / 2 },
  ];
  return { orientation: 'horizontal', semanticLabel: etiqueta, polygon, planeSpace: { matrix } };
}

function cuadro(planos: ReturnType<typeof plano>[]) {
  return {
    detectedPlanes: new Set(planos),
    getPose: (espacio: { matrix: Float32Array }) => ({ transform: { matrix: espacio.matrix } }),
  } as unknown as XRFrame;
}

const ESPACIO = {} as XRReferenceSpace;
const ANCHO = 0.86;
const FONDO = 0.2;

/** ¿Las cuatro esquinas de la huella quedan dentro del rectángulo de la mesa? */
function sobreMesa(s: Superficie, mx: number, mz: number, w: number, d: number, giroMesa = 0): boolean {
  const c = Math.cos(s.giro);
  const sn = Math.sin(s.giro);
  for (const [lx, lz] of [
    [-ANCHO / 2, -FONDO / 2],
    [ANCHO / 2, -FONDO / 2],
    [ANCHO / 2, FONDO / 2],
    [-ANCHO / 2, FONDO / 2],
  ]) {
    const x = s.x + lx * c + lz * sn - mx;
    const z = s.z - lx * sn + lz * c - mz;
    // Al espacio de la mesa (rotación inversa).
    const cm = Math.cos(giroMesa);
    const sm = Math.sin(giroMesa);
    const px = x * cm - z * sm;
    const pz = x * sm + z * cm;
    if (Math.abs(px) > w / 2 + 1e-6 || Math.abs(pz) > d / 2 + 1e-6) {
      return false;
    }
  }
  return true;
}

prueba('mesa grande enfrente: la estantería queda encima y a la altura de la mesa', () => {
  const s = buscarSuperficie(cuadro([plano(0, 0.75, -0.6, 1.2, 0.6)]), ESPACIO, 0, { x: 0, z: -0.6, giro: 0 }, ANCHO, FONDO);
  assert.ok(s);
  assert.equal(s.y.toFixed(2), '0.75');
  assert.ok(sobreMesa(s, 0, -0.6, 1.2, 0.6));
  assert.ok(Math.hypot(s.x, s.z + 0.6) < 0.01, 'sin moverse si ya cabe');
});

prueba('mesa corrida a un lado: se corre la estantería para quedar encima', () => {
  const s = buscarSuperficie(cuadro([plano(0.35, 0.72, -0.7, 1.0, 0.5)]), ESPACIO, 0, { x: 0, z: -0.6, giro: 0 }, ANCHO, FONDO);
  assert.ok(s);
  assert.ok(sobreMesa(s, 0.35, -0.7, 1.0, 0.5));
});

prueba('mesa un poco girada respecto a la mirada: se alinea con sus bordes', () => {
  const giroMesa = 0.3;
  const s = buscarSuperficie(cuadro([plano(0, 0.75, -0.7, 0.95, 0.4, giroMesa)]), ESPACIO, 0, { x: 0, z: -0.6, giro: 0 }, ANCHO, FONDO);
  assert.ok(s);
  assert.ok(sobreMesa(s, 0, -0.7, 0.95, 0.4, giroMesa));
});

prueba('mesa muy pequeña (no cabe la estantería): nada', () => {
  const s = buscarSuperficie(cuadro([plano(0, 0.75, -0.6, 0.5, 0.5)]), ESPACIO, 0, { x: 0, z: -0.6, giro: 0 }, ANCHO, FONDO);
  assert.equal(s, null);
});

prueba('piso, techo, planos muy bajos o muy altos no cuentan', () => {
  const planos = [
    plano(0, 0, -0.6, 3, 3, 0, 'floor'),
    plano(0, 2.4, -0.6, 3, 3, 0, 'ceiling'),
    plano(0, 0.2, -0.6, 2, 2, 0, 'other'),
    plano(0, 1.6, -0.6, 2, 2, 0, 'shelf'),
  ];
  assert.equal(buscarSuperficie(cuadro(planos), ESPACIO, 0, { x: 0, z: -0.6, giro: 0 }, ANCHO, FONDO), null);
});

prueba('la altura se mide desde el piso detectado', () => {
  // Piso en y = -0.5 (espacio local): mesa a 0.25 → 0.75 m sobre el piso.
  const s = buscarSuperficie(cuadro([plano(0, 0.25, -0.6, 1.2, 0.6)]), ESPACIO, -0.5, { x: 0, z: -0.6, giro: 0 }, ANCHO, FONDO);
  assert.ok(s);
  assert.equal(s.y.toFixed(2), '0.25');
});

prueba('entre dos mesas, la más cercana a donde se mira', () => {
  const s = buscarSuperficie(
    cuadro([plano(1.5, 0.75, -0.6, 1.2, 0.6), plano(0.05, 0.75, -0.65, 1.2, 0.6)]),
    ESPACIO,
    0,
    { x: 0, z: -0.6, giro: 0 },
    ANCHO,
    FONDO,
  );
  assert.ok(s);
  assert.ok(sobreMesa(s, 0.05, -0.65, 1.2, 0.6));
});

prueba('un sofá no es mesa', () => {
  const s = buscarSuperficie(cuadro([plano(0, 0.45, -0.6, 1.9, 0.7, 0, 'couch')]), ESPACIO, 0, { x: 0, z: -0.6, giro: 0 }, ANCHO, FONDO);
  assert.equal(s, null);
});

prueba('mesa a más de un metro adelante: se encuentra igual', () => {
  const s = buscarSuperficie(cuadro([plano(0, 0.74, -1.95, 1.15, 0.6)]), ESPACIO, 0, { x: 0, z: -0.6, giro: 0 }, ANCHO, FONDO);
  assert.ok(s);
  assert.ok(sobreMesa(s, 0, -1.95, 1.15, 0.6));
});

prueba('sin planos detectados: nada (la mesa flota como antes)', () => {
  const vacio = { detectedPlanes: undefined, getPose: () => null } as unknown as XRFrame;
  assert.equal(buscarSuperficie(vacio, ESPACIO, 0, { x: 0, z: -0.6, giro: 0 }, ANCHO, FONDO), null);
});

// ---- Malla del cuarto ----

const IDENTIDAD = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
/** Rectángulo horizontal (dos triángulos) de x0..x1, z0..z1 a la altura y. */
function rect(x0: number, x1: number, z0: number, z1: number, y: number): MallaReal {
  return { matriz: IDENTIDAD, vertices: [x0, y, z0, x1, y, z0, x1, y, z1, x0, y, z1], indices: [0, 2, 1, 0, 3, 2] };
}
/** Pared vertical (no cuenta). */
const pared: MallaReal = { matriz: IDENTIDAD, vertices: [-2, 0, -2, 2, 0, -2, 2, 2.5, -2, -2, 2.5, -2], indices: [0, 1, 2, 0, 2, 3] };

prueba('malla: tablero de mesa sin marcar como plano → la estantería queda encima', () => {
  const r = new RejillaPlana();
  r.armar([rect(-3, 3, -3, 3, 0), pared, rect(-0.6, 0.6, -1.0, -0.4, 0.74)], 0);
  const s = buscarSuperficieEnMalla(r, { x: 0, z: -0.6, giro: 0 }, ANCHO, FONDO);
  assert.ok(s);
  assert.equal(s.y.toFixed(2), '0.74');
  assert.ok(sobreMesa(s, 0, -0.7, 1.2, 0.6));
});

prueba('malla: solo piso y paredes → nada', () => {
  const r = new RejillaPlana();
  r.armar([rect(-3, 3, -3, 3, 0), pared], 0);
  assert.equal(buscarSuperficieEnMalla(r, { x: 0, z: -0.6, giro: 0 }, ANCHO, FONDO), null);
});

prueba('malla: dos superficies a distinta altura no se mezclan', () => {
  const r = new RejillaPlana();
  // Mitad a 0,74 y mitad a 0,90: en ninguna de las dos sola cabe la estantería.
  r.armar([rect(-0.5, 0, -0.9, -0.4, 0.74), rect(0, 0.5, -0.9, -0.4, 0.9)], 0);
  assert.equal(buscarSuperficieEnMalla(r, { x: 0, z: -0.6, giro: 0 }, ANCHO, FONDO), null);
});

prueba('malla: mesa con un objeto pequeño encima (un libro) sirve igual', () => {
  const r = new RejillaPlana();
  r.armar([rect(-0.6, 0.6, -1.0, -0.4, 0.74), rect(-0.4, -0.3, -0.7, -0.6, 0.8)], 0);
  const s = buscarSuperficieEnMalla(r, { x: 0, z: -0.6, giro: 0 }, ANCHO, FONDO);
  assert.ok(s);
  assert.ok(Math.abs(s.y - 0.74) < 0.01, 'la altura es la de la mesa, no la del libro');
});

prueba('una mesita de centro, cama o sofá bajo (menos de 60 cm) no cuenta como mesa', () => {
  for (const alto of [0.42, 0.5, 0.58]) {
    const s = buscarSuperficie(cuadro([plano(0, alto, -0.7, 1.2, 0.6, 0, 'table')]), ESPACIO, 0, { x: 0, z: -0.6, giro: 0 }, ANCHO, FONDO);
    assert.equal(s, null, `mesa a ${alto} m`);
  }
  const r = new RejillaPlana();
  r.armar([rect(-0.6, 0.6, -1.0, -0.4, 0.45)], 0);
  assert.equal(buscarSuperficieEnMalla(r, { x: 0, z: -0.6, giro: 0 }, ANCHO, FONDO), null, 'malla a 0,45 m');
});

console.log(`\n${pruebas} pruebas de la mesa real en verde.`);
