// ============================================================
// compartido.ts — el estado que comparten los dos jugadores y sus
// reglas (sin three.js ni red: se puede probar por fuera).
//   · El anfitrión aplica cada acción (op) con aplicarOp().
//   · El invitado ve la repisa como la manda el anfitrión más sus
//     cambios aún sin confirmar (vistaRepisa()).
// ============================================================
import { CATEGORIAS, INVENTARIO_INICIAL, JORNADAS, TOPE, type IdCategoria } from './datos.js';
import { cuentaNueva, estrellasDe, type Cuenta } from './modelo.js';
import type { EstadoCat, MensajeChat } from './multi-ui.js';
import type { Rol } from './red.js';

export interface Compartido {
  fase: 'espera' | 'jornada' | 'resumen' | 'semana';
  dia: number;
  tDia: number;
  cantidades: number[];
  danados: number[];
  estados: EstadoCat[];
  chat: MensajeChat[];
  /** Resumen combinado de cada día (cuando ya está). */
  cuentas: (Cuenta | null)[];
  listos: { anfitrion: boolean; invitado: boolean };
  /** Último cambio de repisa del invitado que el anfitrión ya aplicó. */
  ack: number;
}

export type Op =
  | { tipo: 'repisa'; seq: number; i: number; d: 1 | -1; danado: boolean }
  | { tipo: 'estado'; i: number; valor: EstadoCat }
  | { tipo: 'chat'; de: Rol; texto: string; cat?: IdCategoria }
  | { tipo: 'listo' }
  | { tipo: 'cuenta'; dia: number; cuenta: Cuenta }
  | { tipo: 'siguiente' };

export const estadoInicial = (): Compartido => ({
  fase: 'espera',
  dia: 0,
  tDia: 0,
  cantidades: CATEGORIAS.map((c) => INVENTARIO_INICIAL[c.id]),
  danados: CATEGORIAS.map(() => 0),
  estados: CATEGORIAS.map((c) => (c.id === 'ropa' ? 'no' : c.id === 'cobijas' ? 'urgente' : 'necesita')),
  chat: [],
  cuentas: [],
  listos: { anfitrion: false, invitado: false },
  ack: 0,
});

export type OpRepisa = Extract<Op, { tipo: 'repisa' }>;

/** Suma las cuentas de los dos roles. */
export function sumar(a: Cuenta, b: Cuenta | null): Cuenta {
  const c = cuentaNueva();
  for (const k of Object.keys(c) as (keyof Cuenta)[]) {
    c[k] = a[k] + (b?.[k] ?? 0);
  }
  c.estrellas = estrellasDe(c);
  return c;
}

/**
 * (Anfitrión) Aplica una acción. Devuelve el estado (puede ser uno nuevo
 * al volver a jugar) y, si llegó, la cuenta del invitado para el resumen.
 */
export function aplicarOp(c: Compartido, o: Op, mia: boolean): { comp: Compartido; cuentaInvitado?: Cuenta } {
  if (o.tipo === 'repisa') {
    if (o.d > 0 && c.cantidades[o.i] < TOPE) {
      c.cantidades[o.i]++;
      if (o.danado) {
        c.danados[o.i]++;
      }
    } else if (o.d < 0 && c.cantidades[o.i] > 0) {
      c.cantidades[o.i]--;
      if (o.danado && c.danados[o.i] > 0) {
        c.danados[o.i]--;
      }
    }
    if (!mia) {
      c.ack = Math.max(c.ack, o.seq);
    }
  } else if (o.tipo === 'estado') {
    c.estados[o.i] = o.valor;
  } else if (o.tipo === 'chat') {
    c.chat.push({ id: (c.chat[c.chat.length - 1]?.id ?? 0) + 1, de: o.de, texto: o.texto, ...(o.cat ? { cat: o.cat } : {}) });
    c.chat = c.chat.slice(-30);
  } else if (o.tipo === 'listo') {
    c.listos[mia ? 'anfitrion' : 'invitado'] = true;
    if (c.listos.anfitrion && c.listos.invitado && c.fase === 'espera') {
      c.fase = 'jornada';
      c.tDia = 0;
    }
  } else if (o.tipo === 'cuenta') {
    if (!mia && o.dia === c.dia) {
      return { comp: c, cuentaInvitado: o.cuenta };
    }
  } else if (o.tipo === 'siguiente') {
    if (c.fase === 'resumen') {
      if (c.dia < JORNADAS.length - 1) {
        c.dia++;
        c.tDia = 0;
        c.fase = 'jornada';
      } else {
        c.fase = 'semana';
      }
    } else if (c.fase === 'semana') {
      const nuevo = estadoInicial();
      nuevo.listos = { anfitrion: true, invitado: true };
      nuevo.fase = 'jornada';
      nuevo.chat = c.chat;
      return { comp: nuevo };
    }
  }
  return { comp: c };
}

/** La repisa como se ve: la del anfitrión más los cambios propios sin confirmar. */
export function vistaRepisa(c: Compartido, pendientes: OpRepisa[]): { cantidades: number[]; danados: number[] } {
  const cantidades = [...c.cantidades];
  const danados = [...c.danados];
  for (const p of pendientes) {
    if (p.seq <= c.ack) {
      continue;
    }
    cantidades[p.i] = Math.max(0, Math.min(TOPE, cantidades[p.i] + p.d));
    if (p.danado) {
      danados[p.i] = Math.max(0, danados[p.i] + p.d);
    }
  }
  return { cantidades, danados };
}
