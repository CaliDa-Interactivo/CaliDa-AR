// ============================================================
// demo.ts — animación de ejemplo antes de empezar: una mano
// (dibujada con las mismas piezas que la oclusión de la mano, con
// su línea blanca) muestra cómo se agarra con la PINZA:
//   1. acerca el pulgar y el índice a una botella;
//   2. la botella se ilumina (contorno blanco = hover);
//   3. junta el pulgar y el índice: la agarra y la lleva;
//   4. los separa: la suelta.
// Se repite en bucle junto al botón "Colocar aquí".
// Las poses (mano abierta y en pinza) se tomaron de una mano
// derecha del emulador de Quest de IWSDK (coordenadas de la muñeca).
// ============================================================
import { CylinderGeometry, Group, Mesh, MeshBasicMaterial, Quaternion, Vector3 } from '@iwsdk/core';
import { Objeto } from './objetos.js';
import { GROSOR_LINEA, MATERIAL_LINEA, PiezasMano, type DatosMano } from './oclusion.js';
import { FUENTE, Lienzo, lineas } from './ui.js';

// prettier-ignore
const ABIERTA = [0,0,0,-0.0302,-0.0161,-0.0345,-0.051,-0.0267,-0.0572,-0.0727,-0.0329,-0.0823,-0.0868,-0.0403,-0.1011,-0.0198,-0.0095,-0.0365,-0.0236,-0.0073,-0.096,-0.0299,-0.0087,-0.1334,-0.0335,-0.0152,-0.1565,-0.0354,-0.0218,-0.1778,-0.0036,-0.0077,-0.0343,-0.0017,-0.0025,-0.0956,0.0035,-0.0017,-0.1383,0.0066,-0.0096,-0.1645,0.0098,-0.0164,-0.1883,0.015,-0.006,-0.0348,0.0175,-0.0065,-0.0887,0.0265,-0.0028,-0.1264,0.0316,-0.0076,-0.1521,0.0348,-0.0132,-0.1756,0.023,-0.0094,-0.0341,0.0351,-0.0137,-0.0779,0.0478,-0.0116,-0.1058,0.0557,-0.0169,-0.1237,0.0622,-0.0219,-0.1441];
// prettier-ignore
const PINZA = [0,0,0,-0.0205,-0.025,-0.0384,-0.0244,-0.0488,-0.0603,-0.0219,-0.0694,-0.0869,-0.0205,-0.0863,-0.1047,-0.015,-0.014,-0.0384,-0.0236,-0.0073,-0.096,-0.0245,-0.0417,-0.1119,-0.0224,-0.0658,-0.109,-0.0187,-0.0874,-0.1044,-0.0036,-0.0077,-0.0343,-0.0017,-0.0025,-0.0956,0.0035,-0.0017,-0.1383,0.0066,-0.0096,-0.1645,0.0098,-0.0164,-0.1883,0.015,-0.006,-0.0348,0.0175,-0.0065,-0.0887,0.0265,-0.0028,-0.1264,0.0316,-0.0076,-0.1521,0.0348,-0.0132,-0.1756,0.023,-0.0094,-0.0341,0.0351,-0.0137,-0.0779,0.0478,-0.0116,-0.1058,0.0557,-0.0169,-0.1237,0.0622,-0.0219,-0.1441];
// prettier-ignore
const RADIOS = [0.0215,0.0194,0.0123,0.0098,0.0088,0.0212,0.0103,0.0085,0.0076,0.0066,0.0212,0.0112,0.008,0.0076,0.0066,0.0191,0.0099,0.0076,0.0072,0.0062,0.0181,0.0085,0.0068,0.0064,0.0054];
/** Giro de la muñeca de esa mano (vista desde atrás, como la propia). */
const GIRO = new Quaternion(0.2574, 0.1336, 0.0362, 0.9563);

const DURACION = 5.2;
const suave = (x: number) => {
  const t = Math.min(1, Math.max(0, x));
  return t * t * (3 - 2 * t);
};

export class DemoPinza {
  readonly grupo = new Group();
  private relleno = new PiezasMano({
    material: new MeshBasicMaterial({ color: '#F2E4D4', transparent: true, opacity: 0.85, toneMapped: false }),
    margen: 0,
    orden: 0,
    palma: true,
    contorno: false,
  });
  private linea = new PiezasMano({ material: MATERIAL_LINEA, margen: GROSOR_LINEA, orden: 1, palma: false, contorno: true });
  private datos: DatosMano = { articulaciones: new Float32Array(75), radios: Float32Array.from(RADIOS) };
  private botella = new Objeto('alimento', false, 0);
  private reposo = new Vector3(0, 0.012, 0);
  private t = 0;
  private v = new Vector3();
  private w = new Vector3();
  private muneca = new Vector3();
  private pinzaLocal = new Vector3();
  private inicio = new Vector3(0.1, 0.13, 0.06);
  private alto = new Vector3(-0.06, 0.12, 0.02);

  constructor() {
    // Base redonda donde está la botella.
    const base = new Mesh(new CylinderGeometry(0.05, 0.05, 0.012, 32), new MeshBasicMaterial({ color: '#E8E1D5', toneMapped: false }));
    base.position.y = 0.006;
    this.grupo.add(base);
    this.botella.grupo.position.copy(this.reposo);
    this.grupo.add(this.botella.grupo);
    this.grupo.add(this.relleno.grupo, this.linea.grupo);
    // Leyenda.
    const leyenda = new Lienzo(900, 260, 0.26);
    const { ctx } = leyenda;
    ctx.fillStyle = 'rgba(255, 248, 237, 0.95)';
    ctx.beginPath();
    ctx.roundRect(6, 6, 888, 248, 40);
    ctx.fill();
    ctx.fillStyle = '#CC0100';
    ctx.font = `900 50px ${FUENTE}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText('Así se agarra', 450, 22);
    ctx.fillStyle = '#011E41';
    ctx.font = `400 36px ${FUENTE}`;
    lineas(ctx, 'Acerca el pulgar y el índice: cuando el objeto se ilumine, júntalos para agarrar y sepáralos para soltar.', 820).forEach(
      (f, i) => ctx.fillText(f, 450, 90 + i * 44),
    );
    leyenda.listo();
    leyenda.malla.position.set(0, 0.3, 0);
    this.grupo.add(leyenda.malla);
  }

  actualizar(dt: number): void {
    this.t = (this.t + dt) % DURACION;
    const t = this.t;
    // Cierre de la pinza (0 abierta, 1 cerrada).
    const cierre = t < 1.6 ? 0 : t < 2.0 ? suave((t - 1.6) / 0.4) : t < 3.0 ? 1 : t < 3.4 ? 1 - suave((t - 3.0) / 0.4) : 0;
    // Dónde está la pinza (coordenadas del grupo).
    const objeto = this.v.copy(this.reposo).setY(this.reposo.y + 0.05);
    const pinza = this.w;
    if (t < 1.2) {
      pinza.copy(this.inicio).lerp(objeto, suave(t / 1.2));
    } else if (t < 2.0) {
      pinza.copy(objeto);
    } else if (t < 3.0) {
      pinza.copy(objeto).lerp(this.alto, suave((t - 2.0) / 1.0));
    } else if (t < 3.4) {
      pinza.copy(this.alto);
    } else if (t < 4.4) {
      pinza.copy(this.alto).lerp(this.inicio, suave((t - 3.4) / 1.0));
    } else {
      pinza.copy(this.inicio);
    }
    // Pose de la mano y muñeca para que la pinza quede en su punto.
    const art = this.datos.articulaciones;
    for (let i = 0; i < 75; i++) {
      art[i] = ABIERTA[i] + (PINZA[i] - ABIERTA[i]) * cierre;
    }
    this.pinzaLocal
      .set((art[12] + art[27]) / 2, (art[13] + art[28]) / 2, (art[14] + art[29]) / 2)
      .applyQuaternion(GIRO);
    this.muneca.copy(pinza).sub(this.pinzaLocal);
    for (let i = 0; i < 25; i++) {
      this.pinzaLocal.set(art[i * 3], art[i * 3 + 1], art[i * 3 + 2]).applyQuaternion(GIRO).add(this.muneca);
      art[i * 3] = this.pinzaLocal.x;
      art[i * 3 + 1] = this.pinzaLocal.y;
      art[i * 3 + 2] = this.pinzaLocal.z;
    }
    this.relleno.actualizar([this.datos]);
    this.linea.actualizar([this.datos]);
    // La botella: se ilumina cerca de la pinza, viaja con ella y cae al soltarla.
    const b = this.botella.grupo.position;
    if (t >= 2.0 && t < 3.2) {
      b.copy(pinza).setY(pinza.y - 0.05);
    } else if (t >= 3.2 && t < 3.7) {
      const k = suave((t - 3.2) / 0.5);
      b.copy(this.alto).setY(this.alto.y - 0.05).lerp(this.reposo, k);
    } else {
      b.copy(this.reposo);
    }
    const cerca = t > 0.85 && t < 3.3;
    this.botella.contorno.poner(cerca ? '#FFFFFF' : null);
  }
}
