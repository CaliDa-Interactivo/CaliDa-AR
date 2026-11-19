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
