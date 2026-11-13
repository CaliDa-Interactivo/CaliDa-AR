// ============================================================
// Escena 5 · NOTIFICACION_CAJAS
// La campana suena con su número rojo y aparecen 3 cajas cerradas
// junto al centro de acopio. La persona abre la campana, lee
// "Llegaron 3 cajas al centro de acopio" y pulsa "Recibidas": el
// aviso pasa a "hecho" y la primera caja se acerca. Al tirar de
// la cinta con dos dedos se abren las solapas.
// ============================================================
import type { Escena } from '../contexto.js';
import { sonidos } from '../sonidos.js';

export function crearNotificacionCajas(): Escena {
  let recibidas = false;

  return {
    nombre: 'NOTIFICACION_CAJAS',

    entrar(c) {
      recibidas = false;
      c.llegadas.reiniciar();
      c.llegadas.mostrarCajas();
      c.avisos.disparar('cajas');
      c.gato.animar('quieto');
      c.gato.decir(
        'Llegó lo que la gente trajo al centro. Gira la palma izquierda hacia arriba y toca la campana.',
      );
    },

    alAviso(c, aviso) {
      if (aviso.id !== 'cajas' || recibidas) {
        return;
      }
      recibidas = true;
      c.avisos.resolver('cajas');
      c.llegadas.acercarSiguiente();
      c.gato.decir('¡A desempacar! Tira de la cinta roja de la caja con dos dedos.');
    },

    alSoltar(c, id) {
      // Tirar de la cinta (o tocarla): se abre la caja y empieza el restock.
      if (recibidas && id.startsWith('cinta:')) {
        sonidos.pop();
        c.llegadas.abrir(Number(id.slice(6)));
        c.siguiente();
      }
    },
  };
}
