// ============================================================
// eventos.ts — línea de tiempo del lote: qué aviso llega cada
// día de la semana. Las escenas piden el evento por su clave y el
// gestor (notificaciones.ts) lo manda a la campana.
// ============================================================
import type { Aviso } from './estado.js';

export const DIAS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];

export interface Evento {
  /** Día de la semana del lote (0 = lunes). */
  dia: number;
  aviso: Omit<Aviso, 'estado'>;
}

export const EVENTOS = {
  cajas: {
    dia: 0,
    aviso: {
      id: 'cajas',
      tipo: 'donaciones',
      texto: 'Llegaron 3 cajas al centro de acopio',
      accion: 'Recibidas',
    },
  },
  necesidadSur: {
    dia: 1,
    aviso: {
      id: 'necesidad-sur',
      tipo: 'necesidad',
      texto: 'Sur necesita comida de bebé',
      zona: 'Sur',
      accion: 'Ver zona',
    },
  },
  lluvia: {
    dia: 2,
    aviso: {
      id: 'lluvia-oriente',
      tipo: 'urgencia',
      texto: 'URGENTE: enviar ropa y agua a Oriente',
      zona: 'Oriente',
      accion: 'Aceptar',
    },
  },
  vencida: {
    dia: 2,
    aviso: {
      id: 'oriente-empeora',
      tipo: 'urgencia',
      texto: 'Oriente empeoró: el agua sigue subiendo',
      zona: 'Oriente',
      accion: 'Entendido',
    },
  },
  entrega: {
    dia: 3,
    aviso: {
      id: 'entrega-oriente',
      tipo: 'entrega',
      texto: 'La familia de Oriente recibió el lote',
      zona: 'Oriente',
      accion: 'Ver familia',
    },
  },
} satisfies Record<string, Evento>;

export type ClaveEvento = keyof typeof EVENTOS;
