// Tipos compartidos del juego: avisos y pedidos.
import type { IdCategoria } from './datos.js';

export type TipoAviso = 'cajas' | 'pedido' | 'alerta' | 'entrega';

export interface Pedido {
  id: number;
  municipio: string;
  pide: Partial<Record<IdCategoria, number>>;
  /** Lo que ya va en la caja del pedido. */
  lleva: Partial<Record<IdCategoria, number>>;
  plazo: number;
  /** Segundos que le quedan al reloj (negativo: ya se pasó). */
  restante: number;
  /** espera: sin aceptar · elegir: aceptado, falta el municipio · curso: armándose. */
  estado: 'espera' | 'elegir' | 'curso' | 'entregado' | 'perdido';
  /** Se acabó el reloj: pasó a URGENTE. */
  tarde: boolean;
  /** Motivo si llegó urgente desde el inicio (lluvias, inundación). */
  urgente?: string;
  familias: number;
}

export interface Aviso {
  id: number;
  tipo: TipoAviso;
  texto: string;
  /** Texto del botón de acción (null: solo informa). */
  accion: string | null;
  estado: 'pendiente' | 'hecho';
  hechoEn: number;
  pedido?: Pedido;
  cajas?: number;
}

/** Lo que falta para completar un pedido, en texto. */
export function faltantes(p: Pedido, nombres: (id: IdCategoria) => string): string[] {
  const salida: string[] = [];
  for (const [id, n] of Object.entries(p.pide) as [IdCategoria, number][]) {
    const lleva = p.lleva[id] ?? 0;
    if (lleva < n) {
      salida.push(`${nombres(id)} ${n - lleva}`);
    }
  }
  return salida;
}

export function completo(p: Pedido): boolean {
  return (Object.entries(p.pide) as [IdCategoria, number][]).every(([id, n]) => (p.lleva[id] ?? 0) >= n);
}

// ---- Cuenta de cada jornada --------------------------------------

export interface Cuenta {
  pedidos: number;
  aTiempo: number;
  tarde: number;
  sinEntregar: number;
  rechazadas: number;
  perdidas: number;
  errores: number;
  quejas: number;
  familias: number;
  puntos: number;
  estrellas: number;
  /** Multijugador: donantes atendidos por el receptor. */
  atendidos: number;
}

export const cuentaNueva = (): Cuenta => ({
  pedidos: 0,
  aTiempo: 0,
  tarde: 0,
  sinEntregar: 0,
  rechazadas: 0,
  perdidas: 0,
  errores: 0,
  quejas: 0,
  familias: 0,
  puntos: 0,
  estrellas: 0,
  atendidos: 0,
});

/** De 1 a 3 estrellas según pedidos a tiempo y errores. */
export function estrellasDe(c: Cuenta): number {
  const r = c.pedidos ? c.aTiempo / c.pedidos : 1;
  return r >= 0.99 && c.errores <= 2 && c.quejas === 0 ? 3 : r >= 0.5 && c.errores <= 5 ? 2 : 1;
}
