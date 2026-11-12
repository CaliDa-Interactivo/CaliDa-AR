// Estado global de "Cali en tu mesa" (un lote = una semana).
export const ZONAS = ['Norte', 'Sur', 'Oriente', 'Occidente', 'Centro'] as const;
export type Zona = (typeof ZONAS)[number];
export type EstadoZona = 'necesita' | 'no_necesita' | 'urgente' | 'entregado';
export type TipoAviso = 'donaciones' | 'urgencia' | 'necesidad' | 'entrega' | 'prueba';

export interface Aviso {
  id: string;
  tipo: TipoAviso;
  texto: string;
  zona?: Zona;
  accion: string;
  estado: 'pendiente' | 'hecho';
}

export interface Mision {
  id: string;
  zona: Zona;
  /** Segundos que quedan. */
  tiempo: number;
}

/** Semana del año (ISO): es el número del lote. */
export function semanaDelAno(fecha = new Date()): number {
  const d = new Date(Date.UTC(fecha.getFullYear(), fecha.getMonth(), fecha.getDate()));
  const dia = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dia);
  const inicio = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - inicio.getTime()) / 86400000 + 1) / 7);
}

export interface Estado {
  lote: number;
  inventario: Record<string, number>;
  descartados: { roto: number; vencido: number };
  necesidades: Record<Zona, EstadoZona>;
  avisos: Aviso[];
  misiones: Mision[];
  familiasAtendidas: number;
  escena: string;
}

export function estadoInicial(): Estado {
  return {
    lote: semanaDelAno(),
    inventario: {},
    descartados: { roto: 0, vencido: 0 },
    necesidades: {
      Norte: 'no_necesita',
      Sur: 'necesita',
      Oriente: 'necesita',
      Occidente: 'no_necesita',
      Centro: 'necesita',
    },
    avisos: [],
    misiones: [],
    familiasAtendidas: 0,
    escena: '',
  };
}
