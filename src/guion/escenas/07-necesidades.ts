// ============================================================
// Escena 7 · NECESIDADES
// Sobre cada zona del mapa flota una burbuja con su estado: verde
// bosque (se necesita), beige (no se necesita) o rosa alerta
// (urgente, con un anillo que palpita). Llega a la campana el
// aviso "Sur necesita…". La persona toca una burbuja con el
// índice para abrir la lista de esa zona, y en el aviso pulsa
// "Ver zona": la burbuja de Sur parpadea.
// ============================================================
import type { Escena } from '../contexto.js';
import type { Zona } from '../estado.js';

export function crearNecesidades(): Escena {
  let vioLista = false;
  let vioZona = false;
  let lista = false;

  return {
    nombre: 'NECESIDADES',

    entrar(c) {
      vioLista = false;
      vioZona = false;
      lista = false;
      c.zonas.mostrar(true);
      c.avisos.disparar('necesidadSur');
      c.gato.animar('quieto');
      c.gato.decir(
        'Cada zona tiene su burbuja. Las rosadas no pueden esperar. Toca una para ver qué necesita.',
      );
    },

    actualizar(c) {
      // Sigue cuando ya abrió una lista y atendió el aviso (o pasó un minuto).
      if (!lista && ((vioLista && vioZona) || c.tEscena > 60)) {
        lista = true;
        c.tEscena = 0;
      }
      if (lista && c.tEscena > 5) {
        c.siguiente();
      }
    },

    alTocar(c, id) {
      if (id.startsWith('zona:')) {
        vioLista = true;
        c.zonas.abrirLista(id.slice(5) as Zona);
      }
    },

    alAviso(c, aviso) {
      if (aviso.id === 'necesidad-sur') {
        vioZona = true;
        c.avisos.resolver(aviso.id);
        c.zonas.parpadear('Sur', 4);
        c.zonas.abrirLista('Sur');
        c.gato.senalar(c.maquetaEnt.object3D!.localToWorld(c.maqueta.zonas.Sur.centro.clone()), 4, c.tiempo);
      }
    },
  };
}
