// ============================================================
// Escena 3 · MISION
// El gato salta al borde de la mesa y saluda. La persona le
// devuelve el saludo con la mano (vaivén de la muñeca). El gato
// cuenta la misión y aparece flotando la etiqueta "Lote N"
// (N = semana del año).
// ============================================================
import { Vector3, type Entity } from '@iwsdk/core';
import { COLOR } from '../../datos.js';
import { Etiqueta } from '../../texto.js';
import type { Contexto, Escena } from '../contexto.js';
import { RADIO_MAQUETA } from '../maqueta.js';
import { sonidos } from '../sonidos.js';

export function crearMision(): Escena {
  let lote: Entity | null = null;
  let textoLote: Etiqueta;
  let saludado = false;
  const destino = new Vector3();

  function responder(c: Contexto): void {
    if (saludado) {
      return;
    }
    saludado = true;
    c.tEscena = 0;
    sonidos.logro();
    c.gato.animar('aplaudir', 1.6, c.tiempo);
    c.gato.decir('¡Hola! Esta semana tú decides a dónde llega cada donación de Cali.');
    // Etiqueta del lote, flotando sobre la maqueta.
    textoLote.escribir(`Lote ${c.estado.lote}`, COLOR.rojo);
    const obj = lote!.object3D!;
    obj.position.set(0, 0.3, 0);
    obj.visible = true;
    obj.scale.setScalar(0.02);
    c.anim.mover(obj, null, 0.5, { escala: 1 });
  }

  return {
    nombre: 'MISION',

    entrar(c) {
      if (!lote) {
        textoLote = new Etiqueta(0.34);
        lote = c.crear(textoLote.malla);
        void document.fonts
          ?.load('700 40px Roboto')
          .then(() => textoLote.dibujar())
          .catch(() => undefined);
      }
      saludado = false;
      c.mostrar(lote, false);
      // El gato salta al borde de la mesa.
      const radio = RADIO_MAQUETA * c.maquetaEnt.object3D!.scale.x + 0.13;
      // (a la derecha de la maqueta, apenas hacia la persona)
      destino.set(Math.sin(1.4) * radio, 0, Math.cos(1.4) * radio);
      const gato = c.gato.objeto;
      gato.visible = true;
      gato.scale.setScalar(1);
      gato.position.set(destino.x, -0.3, destino.z + 0.1);
      c.anim.mover(gato, destino, 0.7, { arco: 0.22 });
      sonidos.maullido();
      c.gato.animar('saludar');
      c.gato.decir('¡Hola! Salúdame con la mano.');
    },

    actualizar(c) {
      if (!saludado) {
        // Saludo con la mano; si no llega, el gato sigue a los 15 s.
        if (c.manos.saludo || c.tEscena > 15) {
          responder(c);
        }
        return;
      }
      const obj = lote!.object3D!;
      obj.position.y = 0.3 + Math.sin(c.tiempo * 1.4) * 0.012;
      c.mirar(obj);
      if (c.tEscena > 6) {
        c.siguiente();
      }
    },

    alTocar(c, id) {
      // En el computador: tocar al gato cuenta como saludarlo.
      if (id === 'gato') {
        responder(c);
      }
    },
  };
}
