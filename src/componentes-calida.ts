// Componentes propios de CaliDa RA (solo declaraciones, sin sistemas).
import { createComponent, Types } from '@iwsdk/core';

/** Un producto de la estantería. `indice` apunta a PRODUCTOS (datos.ts). */
export const Producto = createComponent('Producto', {
  indice: { type: Types.Int8, default: 0 },
});

/** Botón del globo del gato. */
export const Boton = createComponent('Boton', {});

/** Casa (refugio) del mapa. `indice` apunta a REFUGIOS (datos.ts). */
export const Casa = createComponent('Casa', {
  indice: { type: Types.Int8, default: 0 },
});

/** La caja de la donación. */
export const CajaDonacion = createComponent('CajaDonacion', {});

/** Guion "Cali en tu mesa": cualquier cosa que se toca o se agarra. */
export const Tocable = createComponent('Tocable', {
  id: { type: Types.String, default: '' },
});
