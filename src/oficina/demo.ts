// ============================================================
// demo.ts — animaciones de ejemplo con una mano dibujada (las
// mismas piezas que la oclusión de la mano, con su línea blanca):
//
//  · DemoBoton (en "Colocar aquí"): la mano empuja con la punta del
//    índice un botón de MUESTRA que está al lado. Es solo un ejemplo:
//    el botón de verdad lo tiene que empujar la persona.
//  · DemoPinza (justo después de colocar la oficina, sobre la mesa):
//    la mano acerca el pulgar y el índice a una botella, la botella se
//    ilumina (hover), la agarra con la pinza, la lleva y la suelta.
//
// Las poses (abierta, pinza y señalar) se tomaron de una mano derecha
// del emulador de Quest de IWSDK, en coordenadas de la muñeca.
// ============================================================
import { CylinderGeometry, Group, Mesh, MeshBasicMaterial, Quaternion, Vector3 } from '@iwsdk/core';
import { Objeto } from './objetos.js';
import { GROSOR_LINEA, MATERIAL_LINEA, PiezasMano, type DatosMano } from './oclusion.js';
import { BOTON, Boton3D, FUENTE, Lienzo, lineas } from './ui.js';

// prettier-ignore
const ABIERTA = [0,0,0,-0.0302,-0.0161,-0.0345,-0.051,-0.0267,-0.0572,-0.0727,-0.0329,-0.0823,-0.0868,-0.0403,-0.1011,-0.0198,-0.0095,-0.0365,-0.0236,-0.0073,-0.096,-0.0299,-0.0087,-0.1334,-0.0335,-0.0152,-0.1565,-0.0354,-0.0218,-0.1778,-0.0036,-0.0077,-0.0343,-0.0017,-0.0025,-0.0956,0.0035,-0.0017,-0.1383,0.0066,-0.0096,-0.1645,0.0098,-0.0164,-0.1883,0.015,-0.006,-0.0348,0.0175,-0.0065,-0.0887,0.0265,-0.0028,-0.1264,0.0316,-0.0076,-0.1521,0.0348,-0.0132,-0.1756,0.023,-0.0094,-0.0341,0.0351,-0.0137,-0.0779,0.0478,-0.0116,-0.1058,0.0557,-0.0169,-0.1237,0.0622,-0.0219,-0.1441];
// prettier-ignore
const PINZA = [0,0,0,-0.0205,-0.025,-0.0384,-0.0244,-0.0488,-0.0603,-0.0219,-0.0694,-0.0869,-0.0205,-0.0863,-0.1047,-0.015,-0.014,-0.0384,-0.0236,-0.0073,-0.096,-0.0245,-0.0417,-0.1119,-0.0224,-0.0658,-0.109,-0.0187,-0.0874,-0.1044,-0.0036,-0.0077,-0.0343,-0.0017,-0.0025,-0.0956,0.0035,-0.0017,-0.1383,0.0066,-0.0096,-0.1645,0.0098,-0.0164,-0.1883,0.015,-0.006,-0.0348,0.0175,-0.0065,-0.0887,0.0265,-0.0028,-0.1264,0.0316,-0.0076,-0.1521,0.0348,-0.0132,-0.1756,0.023,-0.0094,-0.0341,0.0351,-0.0137,-0.0779,0.0478,-0.0116,-0.1058,0.0557,-0.0169,-0.1237,0.0622,-0.0219,-0.1441];
// prettier-ignore
const SENALAR = [0,0,0,-0.0316,-0.0133,-0.0331,-0.0549,-0.019,-0.0551,-0.075,-0.0232,-0.0819,-0.0954,-0.0248,-0.0955,-0.0205,-0.0081,-0.0357,-0.0236,-0.0073,-0.096,-0.0258,-0.0119,-0.1336,-0.0269,-0.0176,-0.1572,-0.0264,-0.0198,-0.1794,-0.0043,-0.0069,-0.0336,-0.0017,-0.0025,-0.0956,0.0004,-0.041,-0.1145,-0.0032,-0.0565,-0.092,-0.0092,-0.0484,-0.0691,0.015,-0.006,-0.0348,0.0175,-0.0065,-0.0887,0.0164,-0.044,-0.0993,0.0081,-0.0531,-0.0757,0.0021,-0.0379,-0.0576,0.023,-0.0094,-0.0341,0.0351,-0.0137,-0.0779,0.029,-0.0429,-0.0854,0.0197,-0.0479,-0.0681,0.0132,-0.0331,-0.0533];
// prettier-ignore
const RADIOS = [0.0215,0.0194,0.0123,0.0098,0.0088,0.0212,0.0103,0.0085,0.0076,0.0066,0.0212,0.0112,0.008,0.0076,0.0066,0.0191,0.0099,0.0076,0.0072,0.0062,0.0181,0.0085,0.0068,0.0064,0.0054];
/** Giros de la muñeca de esas manos (vistas desde atrás, como la propia). */
const GIRO_PINZA = new Quaternion(0.2574, 0.1336, 0.0362, 0.9563);
const GIRO_SENALAR = new Quaternion(0.2032, 0.1782, 0.0348, 0.9621);

const suave = (x: number) => {
  const t = Math.min(1, Math.max(0, x));
  return t * t * (3 - 2 * t);
};

/** Una mano de ejemplo: piel clara con la línea blanca, en una pose interpolada. */
class ManoEjemplo {
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
  private v = new Vector3();
  private muneca = new Vector3();

  constructor() {
    this.grupo.add(this.relleno.grupo, this.linea.grupo);
  }

  /**
   * Pone la mano en la pose `a`→`b` (mezcla `k`) de modo que la articulación
   * `punta` (o el punto medio entre dos) quede en `destino`.
   */
  poner(a: number[], b: number[], k: number, giro: Quaternion, puntas: number[], destino: Vector3): void {
    const art = this.datos.articulaciones;
    for (let i = 0; i < 75; i++) {
      art[i] = a[i] + (b[i] - a[i]) * k;
    }
    this.v.set(0, 0, 0);
    for (const j of puntas) {
      this.v.x += art[j * 3] / puntas.length;
      this.v.y += art[j * 3 + 1] / puntas.length;
      this.v.z += art[j * 3 + 2] / puntas.length;
    }
    this.v.applyQuaternion(giro);
    this.muneca.copy(destino).sub(this.v);
    for (let i = 0; i < 25; i++) {
      this.v.set(art[i * 3], art[i * 3 + 1], art[i * 3 + 2]).applyQuaternion(giro).add(this.muneca);
      art[i * 3] = this.v.x;
      art[i * 3 + 1] = this.v.y;
      art[i * 3 + 2] = this.v.z;
    }
    this.relleno.actualizar([this.datos]);
    this.linea.actualizar([this.datos]);
  }
}

/** Leyenda crema con título rojo y texto azul (como el globo del gato). */
function leyenda(titulo: string, texto: string): Lienzo {
  const l = new Lienzo(900, 250, 0.24);
  const { ctx } = l;
  ctx.fillStyle = 'rgba(255, 248, 237, 0.95)';
  ctx.beginPath();
  ctx.roundRect(6, 6, 888, 238, 40);
  ctx.fill();
  ctx.fillStyle = '#CC0100';
  ctx.font = `900 50px ${FUENTE}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText(titulo, 450, 22);
  ctx.fillStyle = '#011E41';
  ctx.font = `400 36px ${FUENTE}`;
  lineas(ctx, texto, 820).forEach((f, i) => ctx.fillText(f, 450, 92 + i * 44));
  l.listo();
  return l;
}

/** Ejemplo de cómo se empuja un botón con la punta del índice (botón de muestra). */
export class DemoBoton {
  readonly grupo = new Group();
  private mano = new ManoEjemplo();
  private boton = new Boton3D('Ejemplo', 0.12, 0.045, BOTON.secundario);
  private t = 0;
  private punta = new Vector3();
  private lejos = new Vector3(0.05, -0.03, 0.14);

  constructor() {
    this.grupo.add(this.boton.grupo, this.mano.grupo);
    const l = leyenda('Así se presiona', 'Empuja el botón con la punta del índice. ¡Ahora hazlo tú con "Colocar aquí"!');
    l.malla.position.set(0, 0.11, 0);
    this.grupo.add(l.malla);
  }

  actualizar(dt: number): void {
    const DURACION = 3.8;
    this.t = (this.t + dt) % DURACION;
    const t = this.t;
    const cara = this.boton.grosor;
    // Profundidad del dedo respecto a la cara del botón (negativo = empujando).
    let z: number;
    const p = this.punta;
    if (t < 1.0) {
      p.copy(this.lejos).lerp(this.v0.set(0, 0, cara + 0.03), suave(t));
    } else if (t < 1.8) {
      const k = t < 1.35 ? suave((t - 1.0) / 0.35) : 1 - suave((t - 1.45) / 0.35);
      z = cara + 0.03 - k * 0.045;
      p.set(0, 0, z);
    } else if (t < 2.8) {
      p.set(0, 0, cara + 0.03).lerp(this.lejos, suave(t - 1.8));
    } else {
      p.copy(this.lejos);
    }
    this.boton.hundir(Math.max(0, cara - p.z));
    if (t > 1.3 && t < 1.32) {
      this.boton.tocadoEn = t;
    }
    this.boton.pintar(t);
    this.mano.poner(SENALAR, SENALAR, 0, GIRO_SENALAR, [9], p);
  }

  private v0 = new Vector3();
}

/** Ejemplo de cómo se agarra con la pinza: hover, pinza, llevar y soltar. */
export class DemoPinza {
  readonly grupo = new Group();
  private mano = new ManoEjemplo();
  private botella = new Objeto('alimento', false, 0);
  private reposo = new Vector3(0, 0.012, 0);
  private t = 0;
  private v = new Vector3();
  private w = new Vector3();
  private inicio = new Vector3(0.1, 0.13, 0.06);
  private alto = new Vector3(-0.06, 0.12, 0.02);
  /** Vueltas que lleva (se esconde sola después de unas cuantas). */
  vueltas = 0;

  constructor() {
    const base = new Mesh(new CylinderGeometry(0.05, 0.05, 0.012, 32), new MeshBasicMaterial({ color: '#E8E1D5', toneMapped: false }));
    base.position.y = 0.006;
    this.grupo.add(base);
    this.botella.grupo.position.copy(this.reposo);
    this.grupo.add(this.botella.grupo, this.mano.grupo);
    const l = leyenda('Así se agarra', 'Acerca el pulgar y el índice: cuando el objeto se ilumine, júntalos para agarrar y sepáralos para soltar.');
    l.malla.position.set(0, 0.36, 0);
    this.grupo.add(l.malla);
  }

  reiniciar(): void {
    this.t = 0;
    this.vueltas = 0;
  }

  actualizar(dt: number): void {
    const DURACION = 5.2;
    this.t += dt;
    if (this.t >= DURACION) {
      this.t -= DURACION;
      this.vueltas++;
    }
    const t = this.t;
    // Cierre de la pinza (0 abierta, 1 cerrada).
    const cierre = t < 1.6 ? 0 : t < 2.0 ? suave((t - 1.6) / 0.4) : t < 3.0 ? 1 : t < 3.4 ? 1 - suave((t - 3.0) / 0.4) : 0;
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
    this.mano.poner(ABIERTA, PINZA, cierre, GIRO_PINZA, [4, 9], pinza);
    // La botella: se ilumina cerca de la pinza, viaja con ella y cae al soltarla.
    const b = this.botella.grupo.position;
    if (t >= 2.0 && t < 3.2) {
      b.copy(pinza).setY(pinza.y - 0.05);
    } else if (t >= 3.2 && t < 3.7) {
      b.copy(this.alto).setY(this.alto.y - 0.05).lerp(this.reposo, suave((t - 3.2) / 0.5));
    } else {
      b.copy(this.reposo);
    }
    this.botella.contorno.poner(t > 0.85 && t < 3.3 ? '#FFFFFF' : null);
  }
}
