// ============================================================
// Escena 8 · URGENCIA ("¡Lluvias en Oriente!")
// Una nube sobre Oriente, lluvia y agua que sube. La campana se
// pone roja y el gato señala la muñeca. La persona abre la
// campana, lee "URGENTE: enviar ropa y agua a Oriente" y pulsa
// "Aceptar": queda una misión con tiempo límite, la burbuja de
// Oriente pasa a rosa alerta y se iluminan las repisas que se
// necesitan. Si el tiempo se vence, el agua sigue subiendo, la
// burbuja crece y llega un aviso nuevo (lo maneja zonas.ts).
// La misión se completa en las escenas 10 y 11.
// ============================================================
import type { Escena } from '../contexto.js';

/** Segundos para despachar el lote urgente. */
const TIEMPO_MISION = 150;

export function crearUrgencia(): Escena {
  let aceptada = false;

  return {
    nombre: 'URGENCIA',

    entrar(c) {
      aceptada = false;
      c.zonas.mostrar(true);
      c.zonas.llover('Oriente');
      c.zonas.cambiar('Oriente', 'urgente');
      c.gato.decir('¡Oriente necesita ropa y agua, rápido! Mira tu campana.');
      c.avisos.disparar('lluvia');
    },

    actualizar(c, dt) {
      // Antes de aceptar, el agua ya va subiendo despacio.
      if (!aceptada) {
        c.zonas.nivelAgua = Math.min(0.6, c.zonas.nivelAgua + dt * 0.02);
      } else if (c.tEscena > 4) {
        c.siguiente();
      }
    },

    alTocar(c, id) {
      if (id === 'zona:Oriente') {
        c.zonas.abrirLista('Oriente');
      }
    },

    alAviso(c, aviso) {
      if (aviso.id !== 'lluvia-oriente' || aceptada) {
        return;
      }
      aceptada = true;
      c.tEscena = 0;
      c.avisos.resolver(aviso.id);
      c.estado.misiones = [{ id: 'oriente', zona: 'Oriente', tiempo: TIEMPO_MISION }];
      c.llegadas.resaltar(['alimento', 'ropa']);
      c.gato.animar('quieto');
      c.gato.decir('Misión aceptada. Corre el tiempo: hay que despachar ropa y agua a Oriente.');
    },
  };
}
