// ============================================================
// Escena 6 · RESTOCK_MANUAL (sin banda transportadora)
// La caja abierta trae objetos sueltos. Cada repisa tiene su
// categoría y siluetas punteadas en fila. La persona saca los
// objetos uno por uno y los suelta cerca de su repisa: encajan
// solos en el siguiente puesto libre (con un "clic") y sube el
// contador. Los dañados van a la bandeja de descarte. Si algo se
// suelta donde no es, rebota y el gato explica por qué. Termina
// cuando las 3 cajas quedan vacías.
// ============================================================
import { PRODUCTOS } from '../../datos.js';
import type { Escena } from '../contexto.js';
import { CATEGORIAS } from '../llegadas.js';
import { sonidos } from '../sonidos.js';

export function crearRestock(): Escena {
  let terminado = false;
  let avisoDanados = false;

  const repisaDe = (categoria: string): string =>
    CATEGORIAS.find((k) => k.id === categoria)?.nombre ?? '';

  return {
    nombre: 'RESTOCK_MANUAL',

    entrar(c) {
      terminado = false;
      avisoDanados = false;
      c.gato.decir(
        'Pon cada cosa en su repisa. Lo que tenga borde rojo va a la bandeja de descarte.',
      );
    },

    actualizar(c) {
      if (terminado && c.tEscena > 3.5) {
        c.siguiente();
      }
    },

    alSoltar(c, id, _entidad, toque) {
      const llegadas = c.llegadas;
      // Las cajas siguientes también se abren tirando de la cinta.
      if (id.startsWith('cinta:')) {
        sonidos.pop();
        llegadas.abrir(Number(id.slice(6)));
        return;
      }
      if (!id.startsWith('objeto:')) {
        return;
      }
      const objeto = llegadas.objetos[Number(id.slice(7))];
      if (objeto.lugar !== 'suelto') {
        return;
      }
      const dato = PRODUCTOS[objeto.producto];
      const donde = llegadas.dondeCayo(objeto);
      if (toque || donde === -2) {
        llegadas.rebotar(objeto);
        if (toque) {
          c.gato.decir(
            objeto.dano
              ? `Ese está ${objeto.dano}: llévalo a la bandeja de descarte.`
              : `${dato.nombre}: llévalo a la repisa de ${repisaDe(objeto.categoria)}.`,
          );
        }
        return;
      }
      if (donde === -1) {
        // Bandeja de descarte.
        if (objeto.dano) {
          sonidos.clic();
          llegadas.descartar(objeto);
          if (!avisoDanados) {
            avisoDanados = true;
            c.gato.decir('Bien: lo roto y lo vencido no se entrega.');
          }
        } else {
          sonidos.error();
          llegadas.rebotar(objeto);
          c.gato.animar('triste', 2, c.tiempo);
          c.gato.decir(`${dato.nombre} está en buen estado: sí se entrega. Va en su repisa.`);
        }
      } else if (objeto.dano) {
        // Un dañado en una repisa: rebota.
        sonidos.error();
        llegadas.rebotar(objeto);
        c.gato.animar('triste', 2, c.tiempo);
        c.gato.decir(
          objeto.dano === 'roto'
            ? 'Esa prenda está rota. Eso no se entrega: va al descarte.'
            : 'Eso ya venció. No se entrega: va al descarte.',
        );
      } else if (CATEGORIAS[donde].id !== objeto.categoria) {
        // Repisa equivocada: rebota.
        sonidos.error();
        llegadas.rebotar(objeto);
        c.gato.decir(
          `${dato.nombre} no va en ${CATEGORIAS[donde].nombre}: va en ${repisaDe(objeto.categoria)}.`,
        );
      } else if (llegadas.encajar(objeto, donde)) {
        sonidos.clic();
      } else {
        llegadas.rebotar(objeto);
      }

      // ¿Se vació la caja? Viene la siguiente; si no hay más, termina.
      if (!terminado && llegadas.pendientesEnCaja() === 0) {
        if (llegadas.acercarSiguiente()) {
          c.gato.decir('Caja vacía. Viene otra: tira de su cinta.');
        } else {
          terminado = true;
          c.tEscena = 0;
          sonidos.logro();
          c.gato.animar('aplaudir', 3, c.tiempo);
          const d = c.estado.descartados;
          c.gato.decir(
            `¡Estantería surtida! Apartaste ${d.roto + d.vencido} cosas dañadas que no se podían entregar.`,
          );
        }
      }
    },
  };
}
