// ============================================================
// miniaturas.ts — "fotos" de los productos (como iconoProducto()
// de la página): cada categoría se dibuja con su modelo 3D en un
// lienzo transparente, para usarla de ícono en botones y mensajes.
// ============================================================
import {
  AmbientLight,
  Box3,
  Color,
  DirectionalLight,
  PerspectiveCamera,
  SRGBColorSpace,
  Scene,
  Vector3,
  WebGLRenderTarget,
  type WebGLRenderer,
} from '@iwsdk/core';
import { categoriaDe, type IdCategoria } from './datos.js';
import { Objeto } from './objetos.js';

const cache = new Map<IdCategoria, HTMLCanvasElement>();

export function miniatura(renderer: WebGLRenderer, cat: IdCategoria, px = 160): HTMLCanvasElement {
  const hecha = cache.get(cat);
  if (hecha) {
    return hecha;
  }
  const lienzo = document.createElement('canvas');
  lienzo.width = lienzo.height = px;
  cache.set(cat, lienzo);
  try {
    const escena = new Scene();
    escena.add(new AmbientLight(0xffffff, 1.3));
    const sol = new DirectionalLight(0xffffff, 1.7);
    sol.position.set(-1, 2, 3);
    escena.add(sol);
    const obj = new Objeto(cat, false, categoriaDe(cat).icono).grupo;
    obj.rotation.y = -0.45;
    escena.add(obj);
    obj.updateWorldMatrix(true, true);
    const caja = new Box3().setFromObject(obj, true);
    const centro = caja.getCenter(new Vector3());
    const tam = caja.getSize(new Vector3()).length();
    const camara = new PerspectiveCamera(28, 1, 0.001, 10);
    const dist = (tam * 0.62) / Math.tan((28 * Math.PI) / 360);
    camara.position.set(centro.x, centro.y + dist * 0.35, centro.z + dist);
    camara.lookAt(centro);

    const destino = new WebGLRenderTarget(px, px);
    destino.texture.colorSpace = SRGBColorSpace;
    const antes = renderer.getRenderTarget();
    const xr = renderer.xr.enabled;
    renderer.xr.enabled = false;
    renderer.setRenderTarget(destino);
    const fondo = renderer.getClearColor(new Color());
    const alfa = renderer.getClearAlpha();
    renderer.setClearColor(0x000000, 0);
    renderer.clear();
    renderer.render(escena, camara);
    const datos = new Uint8Array(px * px * 4);
    renderer.readRenderTargetPixels(destino, 0, 0, px, px, datos);
    renderer.setRenderTarget(antes);
    renderer.setClearColor(fondo, alfa);
    renderer.xr.enabled = xr;
    destino.dispose();

    // WebGL lee de abajo hacia arriba: se voltea.
    const imagen = new ImageData(px, px);
    for (let y = 0; y < px; y++) {
      imagen.data.set(datos.subarray((px - 1 - y) * px * 4, (px - y) * px * 4), y * px * 4);
    }
    lienzo.getContext('2d')!.putImageData(imagen, 0, 0);
  } catch {
    // Sin WebGL: el botón queda solo con el texto.
  }
  return lienzo;
}
