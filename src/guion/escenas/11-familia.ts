// ============================================================
// Escena 11 · FAMILIA (entrega)
// La zona de destino crece sobre la mesa. La persona abre las
// manos sobre la zona para ampliarla y le entrega la caja. La
// zona se ilumina, la burbuja pasa a "Entregado", deja de llover,
// la misión urgente se completa y llega el aviso "La familia de
// Oriente recibió el lote" (botón "Ver familia").
//
// El equipo pidió que en el mapa no salgan casas (la persona es
// solo el centro de acopio): la entrega se muestra en la zona,
// sin el interior de una casa.
// ============================================================
import { Color, Vector3, type Entity } from '@iwsdk/core';
import { crearCaja } from '../../modelos.js';
import type { Contexto, Escena } from '../contexto.js';
import { POS_MAPA } from '../maqueta.js';
import { sonidos } from '../sonidos.js';

export function crearFamilia(): Escena {
  let lote: Entity | null = null;
  let fase: 'llego' | 'ampliada' | 'entregado' | 'visto' = 'llego';
  let separacion0 = -1;
  const casa = new Vector3();
  const brillo = new Color('#FFD27A');

  function ampliar(c: Contexto): void {
    if (fase !== 'llego') {
      return;
    }
    fase = 'ampliada';
    c.tEscena = 0;
    sonidos.pop();
    const zona = c.maqueta.zonas.Oriente;
    c.anim.mover(zona.grupo, null, 0.6, { escala: 1.35 });
    // La caja del lote baja del camión, lista para entregarla.
    const obj = lote!.object3D!;
    // (al frente del mapa, donde nada la tapa)
    casa.set(zona.centro.x - 0.04, 0.06, POS_MAPA.z + 0.36);
    obj.position.copy(casa);
    obj.visible = true;
    obj.scale.setScalar(0.02);
    c.anim.mover(obj, null, 0.4, { escala: 0.45 });
    c.gato.decir('Esto que armaste es lo que ellos reciben. Toma la caja y entrégala en Oriente.');
  }

  function entregar(c: Contexto): void {
    fase = 'entregado';
    c.tEscena = 0;
    sonidos.logro();
    const zona = c.maqueta.zonas.Oriente;
    const obj = lote!.object3D!;
    c.anim.mover(obj, zona.centro, 0.5, {
      arco: 0.08,
      escala: 0.02,
      fin: () => (obj.visible = false),
    });
    // La zona se ilumina y vuelve a su tamaño; deja de llover.
    zona.material.emissive.copy(brillo);
    zona.material.emissiveIntensity = 0.45;
    c.anim.mover(zona.grupo, null, 0.8, { escala: 1, espera: 1.2 });
    c.estado.misiones = [];
    c.estado.familiasAtendidas++;
    c.zonas.llover(null);
    c.zonas.nivelAgua = 0;
    c.zonas.agrandar('Oriente', 1);
    c.zonas.mostrar(true);
    c.zonas.cambiar('Oriente', 'entregado');
    c.llegadas.resaltar([]);
    c.gato.animar('aplaudir', 3, c.tiempo);
    c.gato.decir('¡Entregado! Oriente recibió ropa y agua a tiempo. Revisa tu campana.');
    c.avisos.disparar('entrega');
  }

  return {
    nombre: 'FAMILIA',

    entrar(c) {
      if (!lote) {
        const caja = crearCaja(false);
        caja.solapas.visible = false;
        caja.tapa.visible = true;
        lote = c.crear(caja.raiz, c.maquetaEnt);
        c.tocable(lote, 'lote', true);
      }
      fase = 'llego';
      separacion0 = -1;
      c.mostrar(lote, false);
      c.zonas.soloZona('Oriente');
      c.gato.decir('El camión llegó a Oriente. Abre las manos sobre la zona para verla más grande.');
    },

    actualizar(c) {
      if (fase === 'llego') {
        // Abrir las manos: las dos se alejan una de otra más de 12 cm.
        const m = c.manos;
        if (m.izquierda.presente && m.derecha.presente) {
          const d = m.izquierda.muneca.distanceTo(m.derecha.muneca);
          if (separacion0 < 0 || d < separacion0) {
            separacion0 = d;
          } else if (d - separacion0 > 0.12) {
            ampliar(c);
          }
        }
        // Sin manos (controles o computador) la zona se amplía sola.
        if (c.tEscena > (m.izquierda.presente ? 14 : 3)) {
          ampliar(c);
        }
      } else if (fase === 'visto' && c.tEscena > 6) {
        c.siguiente();
      }
    },

    alTocar(c, id) {
      if (id === 'zona:Oriente') {
        if (fase === 'llego') {
          ampliar(c);
        } else {
          c.zonas.abrirLista('Oriente');
        }
      }
    },

    alSoltar(c, id, entidad, toque) {
      if (id !== 'lote' || fase !== 'ampliada') {
        return;
      }
      const centro = c.maqueta.zonas.Oriente.centro;
      const p = entidad.object3D!.position;
      if (toque || Math.hypot(p.x - centro.x, p.z - centro.z) < 0.14) {
        entregar(c);
      } else {
        c.anim.mover(entidad.object3D!, casa, 0.4, { arco: 0.08 });
      }
    },

    alAviso(c, aviso) {
      if (aviso.id === 'entrega-oriente' && fase === 'entregado') {
        fase = 'visto';
        c.tEscena = 0;
        c.avisos.resolver(aviso.id);
        c.zonas.parpadear('Oriente', 3);
        c.zonas.abrirLista('Oriente');
        c.gato.decir(
          `Una familia de Oriente ya tiene su lote. Familias atendidas esta semana: ${c.estado.familiasAtendidas}.`,
        );
      }
    },

    salir(c) {
      const zona = c.maqueta.zonas.Oriente;
      zona.material.emissiveIntensity = 0;
      zona.grupo.scale.setScalar(1);
      if (lote) {
        c.mostrar(lote, false);
      }
    },
  };
}
