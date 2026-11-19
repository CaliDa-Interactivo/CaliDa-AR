// ============================================================
// red.ts — conexión entre dos Quest con PeerJS (WebRTC).
//
//  · El jugador A crea una sala con un código de 4 dígitos y es el
//    ANFITRIÓN: tiene el estado que manda (reloj del día, repisa
//    compartida, estados de las categorías, chat, resúmenes).
//  · El jugador B se une con el código. Cada uno tiene un rol:
//    receptor o despachador (el anfitrión elige; el otro recibe el
//    rol contrario).
//  · Mensajes JSON {type, payload}. Si se cae la conexión, se avisa y
//    se reintenta cada pocos segundos.
//
// PeerJS usa su servidor público de señalización (0.peerjs.com) solo
// para que los dos dispositivos se encuentren; los datos del juego
// van directo entre ellos. No se envían datos personales reales.
// ============================================================
import Peer, { type DataConnection } from 'peerjs';

export type Rol = 'receptor' | 'despachador';
export type EstadoRed = 'desconectado' | 'esperando' | 'conectando' | 'conectado' | 'reconectando';

export interface Mensaje {
  type: string;
  payload?: unknown;
}

const PREFIJO = 'calida-ra-sala-';

export const rolContrario = (r: Rol): Rol => (r === 'receptor' ? 'despachador' : 'receptor');

export class Red {
  anfitrion = false;
  codigo = '';
  rol: Rol = 'receptor';
  estado: EstadoRed = 'desconectado';
  alMensaje: (m: Mensaje) => void = () => undefined;
  alCambiar: (estado: EstadoRed, detalle?: string) => void = () => undefined;
  private peer: Peer | null = null;
  private conexion: DataConnection | null = null;
  private reintento = 0;

  get conectado(): boolean {
    return this.estado === 'conectado';
  }

  private fijar(estado: EstadoRed, detalle?: string): void {
    this.estado = estado;
    this.alCambiar(estado, detalle);
  }

  /** Crea la sala (anfitrión) con un código de 4 dígitos al azar. */
  crearSala(rol: Rol): Promise<string> {
    this.anfitrion = true;
    this.rol = rol;
    return new Promise((resolver, rechazar) => {
      const intentar = (vueltas: number) => {
        const codigo = String(1000 + Math.floor(Math.random() * 9000));
        const peer = new Peer(PREFIJO + codigo);
        peer.on('open', () => {
          this.peer = peer;
          this.codigo = codigo;
          this.fijar('esperando');
          resolver(codigo);
        });
        peer.on('connection', (c) => this.aceptar(c));
        peer.on('disconnected', () => {
          // Se perdió el servidor de señalización: reintenta sin perder la sala.
          if (!peer.destroyed) {
            setTimeout(() => peer.reconnect(), 2000);
          }
        });
        peer.on('error', (e: { type?: string }) => {
          if (e.type === 'unavailable-id' && vueltas < 5) {
            peer.destroy();
            intentar(vueltas + 1); // código ocupado: otro
          } else if (!this.peer) {
            rechazar(new Error(`No se pudo crear la sala (${e.type ?? 'error'})`));
          }
        });
      };
      intentar(0);
    });
  }

  private aceptar(c: DataConnection): void {
    // Solo un invitado a la vez: la conexión nueva reemplaza a la vieja.
    this.conexion?.close();
    this.conexion = c;
    c.on('open', () => {
      this.fijar('conectado');
      this.enviar({ type: 'rol', payload: rolContrario(this.rol) });
    });
    c.on('data', (d) => this.alMensaje(d as Mensaje));
    c.on('close', () => {
      if (this.conexion === c) {
        this.conexion = null;
        this.fijar('esperando', 'El otro jugador se desconectó. Esperando a que vuelva…');
      }
    });
  }

  /** Se une a una sala con su código (invitado). */
  unirse(codigo: string): Promise<Rol> {
    this.anfitrion = false;
    this.codigo = codigo;
    return new Promise((resolver, rechazar) => {
      const peer = new Peer();
      this.peer = peer;
      let resuelto = false;
      peer.on('open', () => this.conectarA(codigo, (rol) => {
        if (!resuelto) {
          resuelto = true;
          resolver(rol);
        }
      }));
      peer.on('error', (e: { type?: string }) => {
        if (e.type === 'peer-unavailable') {
          if (!resuelto) {
            resuelto = true;
            rechazar(new Error('No existe una sala con ese código.'));
          } else {
            this.reintentar();
          }
        } else if (!resuelto) {
          resuelto = true;
          rechazar(new Error(`No se pudo conectar (${e.type ?? 'error'})`));
        }
      });
    });
  }

  private conectarA(codigo: string, alRol: (rol: Rol) => void): void {
    if (!this.peer) {
      return;
    }
    this.fijar(this.estado === 'desconectado' ? 'conectando' : 'reconectando');
    const c = this.peer.connect(PREFIJO + codigo, { reliable: true });
    this.conexion = c;
    c.on('open', () => {
      this.reintento = 0;
      this.fijar('conectado');
    });
    c.on('data', (d) => {
      const m = d as Mensaje;
      if (m.type === 'rol') {
        this.rol = m.payload as Rol;
        alRol(this.rol);
      }
      this.alMensaje(m);
    });
    c.on('close', () => {
      if (this.conexion === c) {
        this.conexion = null;
        this.fijar('reconectando', 'Se perdió la conexión. Reintentando…');
        this.reintentar();
      }
    });
  }

  private reintentar(): void {
    if (this.anfitrion || !this.peer || this.peer.destroyed) {
      return;
    }
    this.reintento++;
    setTimeout(() => {
      if (this.peer?.disconnected) {
        this.peer.reconnect();
      }
      this.conectarA(this.codigo, () => undefined);
    }, Math.min(8000, 1500 * this.reintento));
  }

  enviar(m: Mensaje): void {
    if (this.conexion?.open) {
      this.conexion.send(m);
    }
  }

  cerrar(): void {
    this.conexion?.close();
    this.peer?.destroy();
    this.peer = null;
    this.conexion = null;
    this.fijar('desconectado');
  }
}
