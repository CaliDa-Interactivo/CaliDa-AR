// ============================================================
// gato.ts — la mascota guía, igual en todas las escenas: vive en
// el borde de la mesa, mira a la persona, habla en una burbuja
// (con un sonido corto) y tiene animaciones: saludar, señalar,
// aplaudir y triste.
// ============================================================
import { Group, Object3D, Vector3, type Entity, type World } from '@iwsdk/core';
import { crearGato, type GatoArmado } from '../modelos.js';
import { Globo } from '../texto.js';
import { sonidos } from './sonidos.js';

export type PoseGato = 'quieto' | 'saludar' | 'senalar' | 'aplaudir' | 'triste';

export const ALTO_GATO = 0.26;

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
    } else if (this.pose === 'triste') {
      pivote.rotation.x = 0.22;
      pivote.scale.y = 0.97;
      brazoX = 0.1;
    }
    if (brazo) {
      brazo.rotation.x = brazoX;
    }
    if (cola) {
      cola.rotation.y = Math.sin(t * (this.pose === 'triste' ? 0.5 : 1.2)) * 0.25;
    }

    // La burbuja va sobre el gato y mira a la persona sin inclinarse.
    const panel = this.panel.object3D!;
    if (panel.visible) {
      panel.position.set(gato.position.x, gato.position.y + ALTO_GATO + 0.24, gato.position.z);
      panel.getWorldPosition(this.w);
      this.w.set(cabeza.x, this.w.y, cabeza.z);
      panel.lookAt(this.w);
    }
  }
}
