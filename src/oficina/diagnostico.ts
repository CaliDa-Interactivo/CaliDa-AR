// ============================================================
// diagnostico.ts — modo ?diagnostico (para probar en las gafas).
//
// Frente a la vista aparecen:
//  · Un panel con los datos de la profundidad que entrega el visor
//    (formato, near/far, factor a metros, tamaño, matriz de la vista)
//    y de las manos.
//  · Dos imágenes de la profundidad: a la izquierda el valor crudo de
//    la textura (0 = negro, 1 = blanco) y a la derecha lo que da la
//    fórmula de IWSDK en metros (negro = cerca, blanco = 3 m o más).
// Con una foto de esto se puede ajustar la oclusión sin adivinar.
// ============================================================
import {
  Group,
  Mesh,
  PlaneGeometry,
  ShaderMaterial,
  type Object3D,
  type Texture,
  type World,
} from '@iwsdk/core';
import type { Manos } from './manos.js';
import { FUENTE, Lienzo } from './ui.js';

const VERTICE = `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const FRAGMENTO = `
uniform sampler2DArray prof;
uniform float cerca;
uniform float factor;
uniform float metros;
varying vec2 vUv;
void main() {
  float v = texture(prof, vec3(vUv.x, vUv.y, 0.0)).r;
  float c = v;
  if (metros > 0.5) {
    float m = factor * cerca / max(1e-5, 1.0 - v);
    c = clamp(m / 3.0, 0.0, 1.0);
  }
  gl_FragColor = vec4(c, c, c, 1.0);
}`;

export class Diagnostico {
  readonly grupo = new Group();
  private texto = new Lienzo(1100, 900, 0.34);
  private crudo: Mesh;
  private enMetros: Mesh;
  private t = 0;

  constructor(
    private mundo: World,
    private manos: Manos,
  ) {
    this.texto.malla.position.set(-0.2, 0, 0);
    this.grupo.add(this.texto.malla);
    const imagen = (metros: number, x: number) => {
      const mat = new ShaderMaterial({
        vertexShader: VERTICE,
        fragmentShader: FRAGMENTO,
        uniforms: { prof: { value: null }, cerca: { value: 0.1 }, factor: { value: 1 }, metros: { value: metros } },
        depthTest: false,
        depthWrite: false,
      });
      const m = new Mesh(new PlaneGeometry(0.16, 0.16), mat);
      m.position.set(x, 0.04, 0);
      m.renderOrder = 2000;
      m.visible = false;
      this.grupo.add(m);
      return m;
    };
    this.crudo = imagen(0, 0.06);
    this.enMetros = imagen(1, 0.24);
    // A 60 cm frente a los ojos, un poco abajo.
    this.grupo.position.set(0, -0.06, -0.6);
    this.grupo.traverse((o) => (o.renderOrder = 2000));
    this.escribir(['Diagnóstico: entra en RA para ver los datos.']);
  }

  /** Lo pega a la cabeza. */
  colgarDe(cabeza: Object3D): void {
    cabeza.add(this.grupo);
  }

  actualizar(dt: number): void {
    const xr = this.mundo.renderer.xr;
    const tex = xr.getDepthTexture() as Texture | null;
    for (const m of [this.crudo, this.enMetros]) {
      const u = (m.material as ShaderMaterial).uniforms;
      u.prof.value = tex;
      m.visible = !!tex;
    }
    this.t += dt;
    if (this.t < 0.5) {
      return;
    }
    this.t = 0;
    const sesion = this.mundo.xrSession;
    const cuadro = this.mundo.xrFrame;
    const espacio = this.mundo.xrReferenceSpace;
    const filas: string[] = [];
    if (!sesion) {
      this.escribir(['Diagnóstico: entra en RA para ver los datos.']);
      return;
    }
    const f = (n: number | undefined) => (n === undefined || n === null ? '—' : Number(n).toPrecision(4));
    filas.push(`Funciones: ${(sesion.enabledFeatures ?? []).join(', ')}`);
    filas.push(`Profundidad: uso ${sesion.depthUsage ?? '—'} · formato ${sesion.depthDataFormat ?? '—'}`);
    filas.push(`renderState near ${f(sesion.renderState.depthNear)} far ${f(sesion.renderState.depthFar)}`);
    filas.push(`Capas: ${(sesion.renderState as { layers?: unknown[] }).layers?.length ?? 0} · three tiene profundidad: ${xr.hasDepthSensing()}`);
    try {
      const pose = cuadro && espacio ? cuadro.getViewerPose(espacio) : undefined;
      const vista = pose?.views[0];
      const info = vista ? (xr.getBinding() as XRWebGLBinding).getDepthInformation(vista) : undefined;
      if (info) {
        const i = info as XRWebGLDepthInformation & { depthNear?: number; depthFar?: number; isValid?: boolean; imageIndex?: number; textureType?: string };
        filas.push(`Textura ${info.width}×${info.height} · tipo ${i.textureType ?? '—'} · capa ${i.imageIndex ?? '—'}`);
        filas.push(`depthNear ${f(i.depthNear)} · depthFar ${f(i.depthFar)}`);
        filas.push(`rawValueToMeters ${f(info.rawValueToMeters)} · válida ${i.isValid ?? '—'}`);
        const mt = info.normDepthBufferFromNormView?.matrix;
        if (mt) {
          filas.push(`Matriz vista→prof.: ${[0, 1, 4, 5, 12, 13].map((k) => f(mt[k])).join(' ')}`);
        }
        for (const m of [this.crudo, this.enMetros]) {
          const u = (m.material as ShaderMaterial).uniforms;
          u.cerca.value = i.depthNear ?? 0.1;
          u.factor.value = 1;
        }
      } else {
        filas.push('Sin datos de profundidad en este cuadro.');
      }
    } catch (e) {
      filas.push(`Error al leer la profundidad: ${(e as Error).message}`);
    }
    for (const mano of this.manos.lista) {
      filas.push(
        `Mano ${mano.lado}: ${mano.presente ? mano.tipo : 'no'} · articulaciones ${mano.conArticulaciones ? 'sí' : 'no'}` +
          (mano.conArticulaciones ? ` · radio punta índice ${f(mano.radios[9])} m` : ''),
      );
    }
    filas.push('Imágenes: izq. valor crudo · der. metros (IWSDK)');
    this.escribir(filas);
  }

  private escribir(filas: string[]): void {
    const l = this.texto;
    const { ctx } = l;
    l.limpiar();
    ctx.fillStyle = 'rgba(1, 30, 65, 0.88)';
    ctx.fillRect(0, 0, l.ancho, l.alto);
    ctx.fillStyle = '#FFFFFF';
    ctx.font = `700 34px ${FUENTE}`;
    ctx.textBaseline = 'top';
    let y = 20;
    for (const fila of filas) {
      // Partir las filas largas.
      let resto = fila;
      while (resto.length > 0 && y < l.alto - 40) {
        let n = resto.length;
        while (n > 10 && ctx.measureText(resto.slice(0, n)).width > l.ancho - 40) {
          n--;
        }
        ctx.fillText(resto.slice(0, n), 20, y);
        resto = resto.slice(n);
        y += 42;
      }
      y += 6;
    }
    l.listo();
  }
}
