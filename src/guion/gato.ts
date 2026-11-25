// ============================================================
// gato.ts — la mascota guía (gato.glb de la página): vive encima
// de la estantería, mira a la persona, habla en un globo (título
// rojo, texto centrado, con un sonido corto) y se anima en código:
// saludar, quieto, señalar, aplaudir, triste y feliz.
// ============================================================
import { AssetManager, Color, Group, Object3D, Vector3, type Entity, type Mesh, type MeshStandardMaterial, type World } from '@iwsdk/core';
import { COLOR } from '../oficina/datos.js';
import { encajar, sombra } from '../oficina/objetos.js';
import { FUENTE, Lienzo, lineas, rect } from '../oficina/ui.js';
import { sonidos } from './sonidos.js';

export type PoseGato = 'quieto' | 'saludar' | 'senalar' | 'aplaudir' | 'triste' | 'feliz';

export const ALTO_GATO = 0.26;

// --- Gato ----------------------------------------------------------------
export interface GatoArmado {
  raiz: Group;
  /** Se mueve para respirar y saltar sin tocar la posición del gato. */
  pivote: Group;
  brazo: Object3D | undefined;
  cola: Object3D | undefined;
}

export function crearGato(alto: number): GatoArmado {
  const escena = AssetManager.getGLTF('gato')?.scene ?? new Group();
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

/** Globo de diálogo del gato: título rojo y texto centrado. */
class Globo extends Lienzo {
  private titulo = '';
  private texto = '';

  constructor() {
    super(1024, 500, 0.56);
  }

  escribir(titulo: string, texto: string): void {
    this.titulo = titulo;
    this.texto = texto;
    this.dibujar();
  }

  /** Vuelve a dibujar (p. ej. cuando termina de cargar Roboto). */
  dibujar(): void {
    const { ctx } = this;
    const w = this.ancho;
    const h = this.alto;
    ctx.clearRect(0, 0, w, h);
    // Relieve mate: sombra abajo y panel crema.
    ctx.fillStyle = 'rgba(1, 30, 65, 0.22)';
    rect(ctx, 14, 22, w - 28, h - 30, 56);
    ctx.fill();
    ctx.fillStyle = COLOR.crema;
    rect(ctx, 14, 8, w - 28, h - 30, 56);
    ctx.fill();

    // Título y mensaje centrados (a lo ancho y a lo alto del globo).
    const margen = 62;
    const arriba = 8;
    const alto = h - 30;
    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'center';
    const altoTitulo = this.titulo ? 72 : 0;
    let tam = 50;
    let filas: string[] = [];
    // Si el mensaje es largo, la letra baja un poco para que quepa.
    for (; tam >= 32; tam -= 3) {
      ctx.font = `400 ${tam}px ${FUENTE}`;
      filas = lineas(ctx, this.texto, w - margen * 2);
      if (altoTitulo + filas.length * tam * 1.3 < alto - 70) {
        break;
      }
    }
    const altoBloque = altoTitulo + filas.length * tam * 1.3;
    let y = arriba + (alto - altoBloque) / 2;
    if (this.titulo) {
      ctx.fillStyle = COLOR.rojo;
      ctx.font = `900 58px ${FUENTE}`;
      ctx.fillText(this.titulo, w / 2, y + 50, w - margen * 2);
      y += altoTitulo;
    }
    ctx.fillStyle = COLOR.azul;
    ctx.font = `400 ${tam}px ${FUENTE}`;
    for (const linea of filas) {
      ctx.fillText(linea, w / 2, y + tam * 0.95);
      y += tam * 1.3;
    }
    this.listo();
  }
}


export class Gato {
  readonly entidad: Entity;
  readonly panel: Entity;
  pose: PoseGato = 'quieto';
  private armado: GatoArmado;
  private globo = new Globo();
  private objetivo = new Vector3();
  private poseHasta = Infinity;
  private v = new Vector3();
  private w = new Vector3();
  private u = new Vector3();

  constructor(mundo: World, padre: Entity) {
    this.armado = crearGato(ALTO_GATO);
    this.entidad = mundo.createTransformEntity(this.armado.raiz, { parent: padre });
    const grupo = new Group();
    grupo.add(this.globo.malla);
    this.globo.malla.scale.setScalar(0.85);
    this.panel = mundo.createTransformEntity(grupo, { parent: padre });
    this.ocultar();
    void document.fonts
      ?.load('700 40px Roboto')
      .then(() => this.globo.dibujar())
      .catch(() => undefined);
  }

  get objeto(): Object3D {
    return this.entidad.object3D!;
  }

  get visible(): boolean {
    return this.objeto.visible;
  }

  ocultar(): void {
    this.objeto.visible = false;
    this.panel.object3D!.visible = false;
  }

  /** Burbuja de texto con su sonido. */
  decir(texto: string, titulo = ''): void {
    this.globo.escribir(titulo, texto);
    this.panel.object3D!.visible = true;
    sonidos.burbuja();
  }

  callar(): void {
    this.panel.object3D!.visible = false;
  }

  /** Cambia la animación; con `segundos`, luego vuelve a estar quieto. */
  animar(pose: PoseGato, segundos = Infinity, tiempo = 0): void {
    this.pose = pose;
    this.poseHasta = segundos === Infinity ? Infinity : tiempo + segundos;
  }

  /** Señala un punto del mundo (una zona, una repisa o la muñeca). */
  senalar(punto: Vector3, segundos: number, tiempo: number): void {
    this.objetivo.copy(punto);
    this.animar('senalar', segundos, tiempo);
  }

  actualizar(tiempo: number, cabeza: Vector3): void {
    const gato = this.objeto;
    if (!gato.visible) {
      return;
    }
    if (tiempo > this.poseHasta) {
      this.pose = 'quieto';
      this.poseHasta = Infinity;
    }
    const padre = gato.parent;
    if (!padre) {
      return;
    }
    padre.updateWorldMatrix(true, false);
    // Mira a la persona (o hacia lo que señala), solo girando sobre su eje.
    const mira = this.pose === 'senalar' ? this.objetivo : cabeza;
    const local = padre.worldToLocal(this.v.copy(mira));
    gato.rotation.y = Math.atan2(local.x - gato.position.x, local.z - gato.position.z);

    const { pivote, brazo, cola } = this.armado;
    const t = tiempo;
    pivote.scale.y = 1 + Math.sin(t * 1.6) * 0.01;
    pivote.position.y = 0;
    pivote.rotation.x = 0;
    pivote.rotation.z = Math.sin(t * 0.9) * 0.025;
    let brazoX = Math.sin(t * 1.3) * 0.07;
    if (this.pose === 'saludar') {
      brazoX = -0.8 + Math.sin(t * 4.2) * 0.22;
    } else if (this.pose === 'senalar') {
      brazoX = -0.95;
      pivote.rotation.x = 0.06;
    } else if (this.pose === 'aplaudir') {
      const c = t % 0.7;
      pivote.position.y = c < 0.4 ? Math.sin((c / 0.4) * Math.PI) * 0.035 : 0;
      brazoX = -0.6 + Math.sin(t * 14) * 0.25;
    } else if (this.pose === 'feliz') {
      // Se balancea contento, con saltitos suaves.
      pivote.rotation.z = Math.sin(t * 3.2) * 0.09;
      pivote.position.y = Math.abs(Math.sin(t * 3.2)) * 0.015;
      brazoX = -0.35 + Math.sin(t * 3.2) * 0.15;
    } else if (this.pose === 'triste') {
      pivote.rotation.x = 0.22;
      pivote.scale.y = 0.97;
      brazoX = 0.1;
    }
    if (brazo) {
      brazo.rotation.x = brazoX;
    }
    if (cola) {
      cola.rotation.y = Math.sin(t * (this.pose === 'triste' ? 0.5 : this.pose === 'feliz' ? 3 : 1.2)) * 0.25;
    }

    // La burbuja va a la DERECHA del gato (vista desde la persona), a la altura
    // de su cara, y mira a la persona sin inclinarse.
    const panel = this.panel.object3D!;
    if (panel.visible) {
      // Hacia la persona (en el espacio del padre) y su derecha: (dz, 0, −dx).
      const persona = padre.worldToLocal(this.u.copy(cabeza));
      const dx = persona.x - gato.position.x;
      const dz = persona.z - gato.position.z;
      const largo = Math.hypot(dx, dz) || 1;
      const escala = gato.scale.x;
      const lado = 0.28 + 0.06 * escala;
      panel.position.set(
        gato.position.x + (dz / largo) * lado,
        gato.position.y + ALTO_GATO * escala * 0.7,
        gato.position.z - (dx / largo) * lado,
      );
      panel.getWorldPosition(this.w);
      this.w.set(cabeza.x, this.w.y, cabeza.z);
      panel.lookAt(this.w);
    }
  }
}
