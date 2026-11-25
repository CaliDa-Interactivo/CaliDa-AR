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
// van directo entre ellos (WebRTC). No se envían datos personales reales.
//
// Fallas típicas y qué se le dice a la persona:
//  · No responde el servidor de salas (sin internet o 0.peerjs.com caído).
//  · Se encuentran, pero la red no deja conectar directo (redes de
//    universidad u oficina que aíslan los dispositivos o bloquean UDP):
//    la conexión ICE falla. Solución práctica: los dos en la misma red
//    sin aislamiento, p. ej. el hotspot de un celular.
//  · Nada responde en 20 s: se avisa en vez de quedarse "conectando".
// ============================================================
import Peer, { type DataConnection } from 'peerjs';

export type Rol = 'receptor' | 'despachador';
export type EstadoRed = 'desconectado' | 'esperando' | 'conectando' | 'conectado' | 'reconectando';

export interface Mensaje {
  type: string;
  payload?: unknown;
}

const PREFIJO = 'calida-ra-sala-';
/** Segundos para conectarse antes de avisar que algo falla. */
const ESPERA_CONEXION = 20;

/** Mensaje cuando la red no deja que las gafas se conecten directo. */
export const MENSAJE_RED_BLOQUEADA =
  'Las gafas se encontraron, pero esta red no deja que se conecten entre ellas (pasa en redes de universidad u oficina). Conecten las dos gafas al hotspot de un celular y vuelvan a intentar.';

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
            rechazar(new Error(explicarError(e.type)));
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
    this.vigilarRed(c);
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
      let servidor = false;
      // Si nada responde a tiempo, se dice en qué paso se quedó.
      const limite = setTimeout(() => {
        if (!resuelto) {
          resuelto = true;
          rechazar(
            new Error(
              servidor
                ? MENSAJE_RED_BLOQUEADA
                : 'No responde el servidor de salas. Revisen que las gafas tengan internet y vuelvan a intentar.',
            ),
          );
        }
      }, ESPERA_CONEXION * 1000);
      peer.on('open', () => {
        servidor = true;
        this.conectarA(codigo, (rol) => {
          if (!resuelto) {
            resuelto = true;
            clearTimeout(limite);
            resolver(rol);
          }
        });
      });
      peer.on('error', (e: { type?: string }) => {
        if (e.type === 'peer-unavailable') {
          if (!resuelto) {
            resuelto = true;
            clearTimeout(limite);
            rechazar(new Error('No existe una sala con ese código (revisen el código o que la otra persona siga en la pantalla de la sala).'));
          } else {
            this.reintentar();
          }
        } else if (!resuelto) {
          resuelto = true;
          clearTimeout(limite);
          rechazar(new Error(explicarError(e.type)));
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
    this.vigilarRed(c);
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

  /** Avisa si la red no deja conectar directo (ICE falló). */
  private vigilarRed(c: DataConnection): void {
    const pc = (c as unknown as { peerConnection?: RTCPeerConnection }).peerConnection;
    if (!pc) {
      return;
    }
    pc.addEventListener('iceconnectionstatechange', () => {
      if (pc.iceConnectionState === 'failed' && this.conexion === c) {
        this.fijar(this.anfitrion ? 'esperando' : 'reconectando', MENSAJE_RED_BLOQUEADA);
      }
    });
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

/** Explica en palabras un error de PeerJS. */
function explicarError(tipo?: string): string {
  switch (tipo) {
    case 'network':
    case 'server-error':
    case 'socket-error':
    case 'socket-closed':
      return 'No responde el servidor de salas. Revisen que las gafas tengan internet y vuelvan a intentar.';
    case 'webrtc':
    case 'negotiation-failed':
      return MENSAJE_RED_BLOQUEADA;
    case 'browser-incompatible':
      return 'Este navegador no permite el multijugador (WebRTC).';
    default:
      return `No se pudo conectar (${tipo ?? 'error'}). Vuelvan a intentar.`;
  }
}
