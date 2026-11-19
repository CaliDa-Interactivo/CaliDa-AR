// ============================================================
// multi.ts — CaliDa RA en modo multijugador (2 Quest).
//
// Extiende el juego de un jugador con dos roles:
//
//  RECEPTOR (storyboard 3): llega un donante con su tarjeta (nombre,
//  cédula, donación). Se digita a mano en el computador y se
//  registra: su caja aparece en la pila. Si la fila está llena, se
//  rechaza. Si se acaba la paciencia del donante, se va y la
//  donación se pierde. Abre cajas, clasifica y surte la repisa como
//  en un jugador. A la derecha, el panel de estado de cada
//  categoría (se necesita / no se necesita / urgente).
//
//  DESPACHADOR (storyboard 2): ve los pedidos con su reloj en el
//  computador, elige el municipio, llena la caja vacía (infinita)
//  desde la repisa, la pone en el camión y empuja el botón.
//
//  COMPARTIDO: la repisa (lo que el receptor guarda aparece donde el
//  despachador, y lo que este saca baja el contador del receptor),
//  el estado de las categorías, el chat, el reloj y los resúmenes.
//  El anfitrión (quien creó la sala) tiene el estado que manda y lo
//  envía 4 veces por segundo.
// ============================================================
import { Vector3, type Object3D } from '@iwsdk/core';
import { sonidos } from '../guion/sonidos.js';
import {
  CATEGORIAS,
  COLOR,
  DIAS,
  INVENTARIO_INICIAL,
  JORNADAS,
  TOPE,
  indiceCategoria,
  type Evento,
  type IdCategoria,
} from './datos.js';
import { ANGULO, ESCALA_GATO, mirarAlCentro } from './escena.js';
import type { Agarrable } from './interaccion.js';
import { OficinaSystem, cuentaNueva, type Cuenta } from './juego.js';
import {
  Chat,
  Donante,
  PUNTO_ESTADO,
  Formulario,
  NOMBRES,
  PanelEstado,
  Teclado,
  normalizar,
  type EstadoCat,
  type MensajeChat,
} from './multi-ui.js';
import type { Mensaje, Red, Rol } from './red.js';
import { miniatura } from './miniaturas.js';
import { aplicarOp, estadoInicial, sumar, vistaRepisa, type Compartido, type Op } from './compartido.js';

/** Azar con semilla: cada día sale igual en los dos dispositivos. */
function azar(semilla: number): () => number {
  let s = semilla >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

export class MultiSystem extends OficinaSystem {
  protected red!: Red;
  protected rol: Rol = 'receptor';
  protected comp: Compartido = estadoInicial();
  /** Numera los cambios de repisa del invitado (parte de la hora: sirve aunque recargue). */
  private seq = Date.now();
  private tListo = 0;
  private pendientes: Extract<Op, { tipo: 'repisa' }>[] = [];
  private tEnvio = 0;
  private colocado = false;
  private ultimoChat = -1;
  private cuentaInvitado: Cuenta | null = null;
  private esperaResumen = 0;
  private avisoRed = '';

  // Piezas de los roles
  private chat!: Chat;
  private teclado = new Teclado();
  private formulario: Formulario | null = null;
  private panelEstado: PanelEstado | null = null;
  // Fila de donantes (receptor)
  private agenda: { en: number; n: number }[] = [];
  private fila: Donante[] = [];
  private nDonante = 0;
  private tarjetaAg: Agarrable | null = null;

  init(): void {
    this.red = (this.world.globals as Record<string, unknown>).red as Red;
    this.rol = this.red.rol;
    super.init();
    this.armarRol();
    this.red.alMensaje = (m) => this.recibir(m);
    this.red.alCambiar = (estado, detalle) => {
      this.avisoRed = estado === 'conectado' ? '' : (detalle ?? 'Sin conexión con el otro jugador…');
      if (detalle) {
        this.gato.decir(detalle);
      }
    };
  }

  // ---- Montaje de cada rol -------------------------------------------

  private armarRol(): void {
    const e = this.escena;
    this.tutorial = false;
    e.panel.saltar.activo = false;
    // Mensajes encima del computador de la izquierda: solo con botones.
    this.chat = new Chat(this.rol, 0.4, (cat) => miniatura(this.world.renderer, cat));
    this.chat.alEnviar = (texto, extra) => this.op({ tipo: 'chat', de: this.rol, texto, ...extra, hora: this.hora() });
    this.inter.botones.push(...this.chat.botones);
    // Los mensajes a la izquierda del panel, a la altura de la vista.
    e.sobre.add(this.chat.grupo);
    e.ubicar(this.chat.grupo, ANGULO.mensajes);

    if (this.rol === 'receptor') {
      // Izquierda: el formulario de registro en lugar del panel de avisos.
      e.panel.grupo.visible = false;
      this.formulario = new Formulario(0.44);
      e.sobre.add(this.formulario.grupo);
      e.ubicar(this.formulario.grupo, ANGULO.panel);
      // El teclado solo sirve para el formulario (nombre, cédula, cantidad).
      this.teclado.grupo.position.set(-0.66, 0.012, -0.13);
      mirarAlCentro(this.teclado.grupo);
      this.teclado.grupo.rotation.x = -1.15;
      e.sobre.add(this.teclado.grupo);
      this.teclado.alTecla = (letra) => this.formulario?.tecla(letra);
      this.teclado.alBorrar = () => this.formulario?.borrar();
      this.inter.botones.push(...this.teclado.teclas);
      this.formulario.registrar.alPresionar = () => this.registrar();
      this.formulario.rechazar.alPresionar = () => this.rechazarDonante();
      this.inter.botones.push(...this.formulario.botones);
      // "Mover oficina" pasa al formulario (el panel de avisos no se usa).
      this.formulario.grupo.add(e.panel.mover.grupo, e.panel.recalibrar.grupo);
      // Derecha: panel de estado del centro (sin camión ni despacho).
      for (const o of [e.camion, e.botonDespacho.grupo, e.letreroDespacho.malla, e.pedestal, this.cajaPedido.raiz, e.letreroPedido.malla]) {
        o.visible = false;
      }
      e.botonDespacho.activo = false;
      this.panelEstado = new PanelEstado(0.44);
      e.sobre.add(this.panelEstado.grupo);
      e.ubicar(this.panelEstado.grupo, ANGULO.derecha);
      this.panelEstado.alCambiar = (i, valor) => this.op({ tipo: 'estado', i, valor });
      this.inter.botones.push(...this.panelEstado.botones.flat());
    } else {
      // Despachador: chat encima del computador de necesidades.

      this.cajaInfinita = true;
      // Sin caneca: el despachador no clasifica donaciones.
      this.conCaneca = false;
      e.caneca.visible = false;
    }
  }

  protected reiniciar(): void {
    super.reiniciar();
    this.tutorial = false;
    this.colocado = false;
    this.comp = estadoInicial();
    this.pendientes = [];
    this.limpiarFila();
    this.gato.decir(
      this.rol === 'receptor'
        ? 'Eres el RECEPTOR: atiendes a los donantes, registras su donación y ordenas la repisa. Mira al frente y empuja "Colocar aquí".'
        : 'Eres el DESPACHADOR: atiendes los pedidos de los municipios y los despachas en el camión. Mira al frente y empuja "Colocar aquí".',
      `Sala ${this.red.codigo}`,
    );
  }

  protected trasColocar(): void {
    this.colocado = true;
    this.fase = 'espera';
    this.gato.decir('Listo. Esperando a que tu compañero arme su oficina…');
    this.op({ tipo: 'listo' });
  }

  // ---- Red: operaciones y estado compartido ----------------------------

  /** Una acción: el anfitrión la aplica; el invitado se la manda. */
  private op(o: Op): void {
    if (this.red.anfitrion) {
      this.aplicar(o, true);
    } else {
      this.red.enviar({ type: 'op', payload: o });
    }
  }

  /** (Solo anfitrión) Aplica una acción al estado compartido. */
  private aplicar(o: Op, mia: boolean): void {
    const r = aplicarOp(this.comp, o, mia);
    this.comp = r.comp;
    if (r.cuentaInvitado) {
      this.cuentaInvitado = r.cuentaInvitado;
    }
    this.tEnvio = 0; // enviar ya
  }

  private recibir(m: Mensaje): void {
    if (this.red.anfitrion && m.type === 'op') {
      this.aplicar(m.payload as Op, false);
    } else if (!this.red.anfitrion && m.type === 'estado') {
      const s = m.payload as Compartido;
      this.pendientes = this.pendientes.filter((p) => p.seq > s.ack);
      this.comp = s;
    } else if (m.type === 'hola' && this.red.anfitrion) {
      this.tEnvio = 0;
    }
  }

  /** Lo que se ve de la repisa: lo del anfitrión más lo propio aún sin confirmar. */
  private repisaVista(): { cantidades: number[]; danados: number[] } {
    return vistaRepisa(this.comp, this.red.anfitrion ? [] : this.pendientes);
  }

  protected filaLlena(i: number): boolean {
    return this.repisaVista().cantidades[i] >= TOPE;
  }

  protected repisaAgregar(i: number, danado: boolean, sub = -1): boolean {
    if (this.filaLlena(i)) {
      return false;
    }
    if (sub >= 0) {
      this.escena.repisa.preferir(i, sub);
    }
    this.cambioRepisa(i, 1, danado);
    return true;
  }

  protected repisaQuitar(i: number, sub = -1): { danado: boolean; sub: number } | null {
    const vista = this.repisaVista();
    if (vista.cantidades[i] <= 0) {
      return null;
    }
    const danado = vista.danados[i] > 0 && Math.random() < vista.danados[i] / vista.cantidades[i];
    // Se saca de la columna tocada (así no cambia el producto que se ve).
    const sacado = this.escena.repisa.quitar(i, sub);
    this.cambioRepisa(i, -1, danado);
    return { danado, sub: sacado?.sub ?? sub };
  }

  private cambioRepisa(i: number, d: 1 | -1, danado: boolean): void {
    const o: Extract<Op, { tipo: 'repisa' }> = { tipo: 'repisa', seq: ++this.seq, i, d, danado };
    if (this.red.anfitrion) {
      this.aplicar(o, true);
    } else {
      this.pendientes.push(o);
      this.red.enviar({ type: 'op', payload: o });
    }
    const v = this.repisaVista();
    this.escena.repisa.fijarExacto(v.cantidades, v.danados);
  }

  // ---- Jornada sincronizada ----------------------------------------

  protected empezarJornada(): void {
    super.empezarJornada();
    this.tutorial = false;
    this.escena.panel.saltar.activo = false;
    if (this.rol === 'receptor') {
      this.cuenta.pedidos = 0;
      this.prepararDonantes();
    }
    this.gato.decir(
      this.rol === 'receptor'
        ? `${DIAS[this.dia]}: llegan donantes a la fila. Registra cada uno antes de que se le acabe la paciencia.`
        : `${DIAS[this.dia]}: revisa los pedidos en tu computador. Si falta algo en la estantería, pídeselo al receptor con los botones de mensajes.`,
      DIAS[this.dia],
    );
  }

  protected avanzarReloj(dt: number): void {
    if (this.red.anfitrion) {
      this.comp.tDia += dt;
      this.tDia = this.comp.tDia;
    } else {
      // Entre mensajes del anfitrión el reloj sigue solo.
      this.tDia = Math.max(this.tDia + dt, this.comp.tDia);
    }
    this.dispararEventos();
    if (this.rol === 'receptor') {
      this.avanzarDonantes(dt);
    }
  }

  protected evento(e: Evento): void {
    // Las cajas del receptor las traen los donantes; los pedidos son del despachador.
    if (e.tipo === 'pedido' && this.rol === 'despachador') {
      super.evento(e);
    }
  }

  protected debeTerminar(): boolean {
    if (this.red.anfitrion && this.comp.fase === 'jornada' && this.comp.tDia >= JORNADAS[this.comp.dia].duracion) {
      this.comp.fase = 'resumen';
      this.cuentaInvitado = null;
      this.esperaResumen = 0;
      this.tEnvio = 0;
    }
    return false; // la sincronización decide
  }

  /** Sigue al estado compartido: empieza el día, muestra resúmenes. */
  private sincronizar(dt: number): void {
    const c = this.comp;
    // La repisa y los estados siempre como manda el compartido.
    const v = this.repisaVista();
    this.escena.repisa.fijarExacto(v.cantidades, v.danados);
    this.escena.repisa.fijarEstados(c.estados.map((e) => PUNTO_ESTADO[e]));
    // Mensaje nuevo del compañero: suena.
    const ultimo = c.chat[c.chat.length - 1];
    if (this.ultimoChat < 0) {
      // Lo que ya estaba al conectarse no suena.
      this.ultimoChat = ultimo?.id ?? 0;
    }
    if (ultimo && ultimo.id > this.ultimoChat) {
      if (ultimo.de !== this.rol) {
        sonidos.campana();
        this.manos.lista.forEach((m) => m.vibrar(0.4, 60));
      }
      this.ultimoChat = ultimo.id;
    }
    if (!this.colocado || this.fase === 'colocar') {
      return;
    }
    if (c.fase === 'espera' && this.fase === 'semana') {
      // El otro (o yo) eligió volver al inicio.
      this.volverAlInicio();
      return;
    }
    if (c.fase === 'jornada' && (this.fase === 'espera' || this.fase === 'resumen' || this.fase === 'semana' || this.dia !== c.dia)) {
      if (this.fase === 'semana') {
        this.cuentas = [];
        this.escena.puestoGato(this.gato.objeto.position);
        this.gato.objeto.scale.setScalar(ESCALA_GATO);
      }
      this.dia = c.dia;
      this.tDia = c.tDia;
      this.empezarJornada();
      this.tDia = c.tDia;
    } else if (c.fase === 'resumen' && this.fase === 'jornada') {
      this.terminarLocal();
    } else if (c.fase === 'semana' && this.fase !== 'semana') {
      this.cuentas = c.cuentas.map((x) => x ?? cuentaNueva());
      this.verSemana();
    }
    // Anfitrión: arma el resumen combinado cuando llega la cuenta del otro.
    if (this.red.anfitrion && c.fase === 'resumen' && !c.cuentas[c.dia]) {
      this.esperaResumen += dt;
      if (this.cuentaInvitado || this.esperaResumen > 5 || !this.red.conectado) {
        c.cuentas[c.dia] = sumar(this.cuenta, this.cuentaInvitado);
        this.tEnvio = 0;
      }
    }
    if (this.fase === 'resumen' && c.cuentas[this.dia] && this.resumenPintado !== this.dia) {
      this.resumenPintado = this.dia;
      this.pintarResumenDia(c.cuentas[this.dia]!, `${DIAS[this.dia]} · Resumen del equipo`);
    }
  }

  private terminarLocal(): void {
    const cuenta = this.cuenta;
    for (const p of this.pedidos) {
      if (p.estado !== 'entregado') {
        cuenta.sinEntregar++;
      }
    }
    cuenta.perdidas += this.fila.length + this.agenda.length; // donantes sin atender
    this.limpiarFila();
    this.inter.soltarTodo();
    this.fase = 'resumen';
    this.resumenPintado = -1;
    sonidos.fin();
    this.escena.resumen.visible = true;
    this.escena.botonesResumen(this.modoResumen());
    const l = this.escena.lienzoResumen;
    l.limpiar();
    l.ctx.fillStyle = COLOR.crema;
    l.ctx.fillRect(0, 0, l.ancho, l.alto);
    l.ctx.fillStyle = COLOR.azul;
    l.ctx.font = '700 48px Roboto, Arial, sans-serif';
    l.ctx.textAlign = 'center';
    l.ctx.fillText('Juntando el resumen del equipo…', l.ancho / 2, l.alto / 2);
    l.listo();
    if (this.red.anfitrion) {
      // Su propia cuenta ya la tiene; espera la del invitado.
    } else {
      this.op({ tipo: 'cuenta', dia: this.dia, cuenta });
    }
    this.gato.animar('aplaudir', 2.5, this.tiempo);
    this.gato.decir(`¡Terminó el ${DIAS[this.dia].toLowerCase()}! Este es el resumen de los dos.`);
  }

  protected filasResumen(c: Cuenta): [string, string][] {
    return [
      ['Pedidos entregados a tiempo', `${c.aTiempo} / ${c.pedidos}`],
      ['Entregados tarde · sin entregar', `${c.tarde} · ${c.sinEntregar}`],
      ['Donantes atendidos', String(c.atendidos)],
      ['Donaciones perdidas (paciencia)', String(c.perdidas)],
      ['Rechazadas (categoría llena)', String(c.rechazadas)],
      ['Errores de clasificación', String(c.errores)],
      ['Quejas por objetos dañados', String(c.quejas)],
      ['Familias ayudadas', String(c.familias)],
      ['Puntos del equipo', String(c.puntos)],
    ];
  }

  // ---- Donantes (receptor) -------------------------------------------

  private prepararDonantes(): void {
    this.limpiarFila();
    this.agenda = [];
    const eventos = JORNADAS[this.dia].eventos;
    let n = 0;
    for (const e of eventos) {
      if (e.tipo === 'cajas') {
        for (let k = 0; k < e.cantidad; k++) {
          this.agenda.push({ en: e.en + k * 16, n: n++ });
        }
      }
    }
  }

  private limpiarFila(): void {
    for (const d of this.fila) {
      d.grupo.removeFromParent();
      d.tarjeta.removeFromParent();
    }
    this.fila = [];
    if (this.tarjetaAg) {
      const i = this.inter.agarrables.indexOf(this.tarjetaAg);
      if (i >= 0) {
        this.inter.agarrables.splice(i, 1);
      }
      this.tarjetaAg = null;
    }
    this.formulario?.limpiar();
  }

  /** Datos del donante n del día (iguales cada vez: azar con semilla). */
  private datosDonante(n: number): Donante['datos'] {
    const r = azar(this.dia * 1000 + n * 37 + 11);
    // Lo que la gente trae depende del panel de estado (menos de lo que no se necesita).
    const peso = (e: EstadoCat) => (e === 'urgente' ? 2.2 : e === 'necesita' ? 1 : 0.3);
    const total = this.comp.estados.reduce((s, e) => s + peso(e), 0);
    let x = r() * total;
    let cat: IdCategoria = CATEGORIAS[0].id;
    for (let i = 0; i < CATEGORIAS.length; i++) {
      x -= peso(this.comp.estados[i]);
      if (x <= 0) {
        cat = CATEGORIAS[i].id;
        break;
      }
    }
    const [min, max] = JORNADAS[this.dia].porCaja;
    return {
      nombre: NOMBRES[Math.floor(r() * NOMBRES.length)],
      cedula: String(10000000 + Math.floor(r() * 89999999)),
      cat,
      cantidad: min + Math.floor(r() * (max - min + 1)) - 2,
    };
  }

  private avanzarDonantes(dt: number): void {
    while (this.agenda.length && this.tDia >= this.agenda[0].en) {
      const { n } = this.agenda.shift()!;
      const paciencia = Math.max(35, 80 - this.dia * 10);
      const d = new Donante(this.datosDonante(n), paciencia, this.nDonante++);
      this.escena.raiz.add(d.grupo);
      this.fila.push(d);
      d.grupo.position.set(-1.7, 0, -0.9);
      this.colocarFila();
      if (this.fila.length === 1) {
        this.alFrente();
      }
    }
    // Paciencia: el de adelante la gasta toda; los de atrás, más despacio.
    for (let i = this.fila.length - 1; i >= 0; i--) {
      const d = this.fila[i];
      d.paciencia -= dt * (i === 0 ? 1 : 0.4);
      d.pintarBarra();
      d.grupo.lookAt(this.cabeza.x, 0, this.cabeza.z);
      if (d.paciencia <= 0) {
        this.cuenta.perdidas++;
        sonidos.error();
        this.gato.decir(`${d.datos.nombre} se cansó de esperar y se fue. Su donación se perdió.`);
        this.despedir(i);
      }
    }
    // Pista: si la fila está llena, avisa.
    const f = this.formulario;
    if (f && this.fila[0]) {
      const i = indiceCategoria(this.fila[0].datos.cat);
      if (this.filaLlena(i) && !f.mensaje.startsWith('No se puede')) {
        f.mensaje = `No se puede recibir: ${CATEGORIAS[i].corto.toLowerCase()} está llena. Rechaza la donación.`;
        f.colorMensaje = COLOR.rojo;
      }
    }
  }

  /** La fila de donantes, afuera del ala izquierda (en el piso). */
  private colocarFila(): void {
    this.fila.forEach((d, i) => {
      const destino = new Vector3(-1.2 - i * 0.42, 0, -0.62 - i * 0.12);
      this.anim.mover(d.grupo, destino, 0.9);
    });
  }

  /** El donante de adelante deja su tarjeta en la mesa. */
  private alFrente(): void {
    const d = this.fila[0];
    const f = this.formulario;
    if (!d || !f) {
      return;
    }
    f.limpiar();
    f.mensaje = `Llegó ${d.datos.nombre}. Copia los datos de su tarjeta y empuja Registrar.`;
    f.colorMensaje = COLOR.carbon;
    const tarjeta = d.tarjeta;
    tarjeta.position.set(-0.5, 0.06, -0.56);
    tarjeta.rotation.set(-0.9, 0, 0);
    mirarAlCentro(tarjeta);
    tarjeta.rotation.x = -0.9;
    this.escena.sobre.add(tarjeta);
    tarjeta.scale.setScalar(0.02);
    this.anim.mover(tarjeta, null, 0.4, { escala: 1 });
    sonidos.burbuja();
    // Se puede agarrar con la mano para acercarla al teclado.
    this.tarjetaAg = {
      obj: tarjeta,
      activo: () => this.fase === 'jornada',
      tomar: () => tarjeta,
      soltar: (obj: Object3D) => {
        if (obj.position.y < -0.02) {
          obj.position.set(-0.5, 0.06, -0.56);
        }
      },
    };
    this.inter.agarrables.push(this.tarjetaAg);
  }

  private despedir(i: number): void {
    const d = this.fila[i];
    this.fila.splice(i, 1);
    if (i === 0) {
      if (this.tarjetaAg) {
        const k = this.inter.agarrables.indexOf(this.tarjetaAg);
        if (k >= 0) {
          this.inter.agarrables.splice(k, 1);
        }
        this.tarjetaAg = null;
      }
      d.tarjeta.removeFromParent();
    }
    // Se va caminando hacia afuera.
    this.anim.mover(d.grupo, new Vector3(-2.4, 0, -0.4), 1.4, {
      escala: 0.02,
      fin: () => d.grupo.removeFromParent(),
    });
    this.colocarFila();
    if (i === 0) {
      this.alFrente();
    }
  }

  private registrar(): void {
    const d = this.fila[0];
    const f = this.formulario;
    if (!d || !f) {
      return;
    }
    const i = indiceCategoria(d.datos.cat);
    if (this.filaLlena(i)) {
      sonidos.error();
      f.mensaje = `No se puede recibir: ${CATEGORIAS[i].corto.toLowerCase()} está llena. Rechaza la donación.`;
      f.colorMensaje = COLOR.rojo;
      f.errores.add('categoria');
      return;
    }
    f.errores.clear();
    if (normalizar(f.valores.nombre) !== normalizar(d.datos.nombre)) {
      f.errores.add('nombre');
    }
    if (f.valores.cedula !== d.datos.cedula) {
      f.errores.add('cedula');
    }
    if (f.categoria !== d.datos.cat) {
      f.errores.add('categoria');
    }
    if (Number(f.valores.cantidad) !== d.datos.cantidad) {
      f.errores.add('cantidad');
    }
    if (f.errores.size) {
      sonidos.error();
      f.mensaje = 'Revisa los campos en rojo: no coinciden con la tarjeta.';
      f.colorMensaje = COLOR.rojo;
      return;
    }
    // Aceptada: su caja llega a la pila.
    sonidos.logro();
    this.cuenta.atendidos++;
    this.cuenta.puntos += 20;
    const danados = JORNADAS[this.dia].danados;
    const r = azar(this.dia * 77 + this.nDonante * 13);
    this.nuevaCaja(Array.from({ length: d.datos.cantidad }, () => ({ cat: d.datos.cat, danado: r() < danados })));
    this.gato.decir(`¡Registrada! La caja de ${d.datos.nombre} está en la pila.`);
    this.despedir(0);
  }

  private rechazarDonante(): void {
    const d = this.fila[0];
    if (!d) {
      return;
    }
    const i = indiceCategoria(d.datos.cat);
    this.cuenta.rechazadas++;
    if (this.filaLlena(i)) {
      sonidos.clic();
      this.op({ tipo: 'chat', de: this.rol, texto: `${CATEGORIAS[i].corto}: categoría llena`, clave: 'llena', hora: this.hora() });
      this.gato.decir('Bien: esa fila estaba llena. Le avisé al despachador con un mensaje.');
    } else {
      this.cuenta.errores++;
      sonidos.error();
      this.gato.decir(`Esa donación sí se podía recibir: ${CATEGORIAS[i].corto.toLowerCase()} tenía espacio.`);
    }
    this.despedir(0);
  }

  // ---- Cada cuadro ---------------------------------------------------

  update(delta: number): void {
    const dt = Math.min(delta, 0.05);
    this.sincronizar(dt);
    super.update(delta);
    // El anfitrión envía el estado 4 veces por segundo.
    if (this.red.anfitrion) {
      this.tEnvio -= dt;
      if (this.tEnvio <= 0 && this.red.conectado) {
        this.tEnvio = 0.25;
        this.red.enviar({ type: 'estado', payload: this.comp });
      }
    }
    // Chat, formulario y panel de estado (unas 5 veces por segundo).
    this.tPintarMulti -= dt;
    if (this.tPintarMulti <= 0) {
      this.tPintarMulti = 0.2;
      this.chat.pintar(this.comp.chat, this.red.conectado);
      this.formulario?.pintar(this.fila.length > 0, this.tiempo);
      this.panelEstado?.pintar(this.comp.estados);
    }
    // El invitado repite "listo" hasta que el anfitrión lo confirme (por si se perdió).
    if (this.fase === 'espera' && this.colocado && !this.red.anfitrion && !this.comp.listos.invitado && this.tiempo - this.tListo > 2) {
      this.tListo = this.tiempo;
      this.op({ tipo: 'listo' });
    }
    if (this.fase === 'espera' && this.colocado && this.tiempo - this.tEspera > 8) {
      this.tEspera = this.tiempo;
      this.gato.decir(this.red.conectado ? 'Esperando a que tu compañero empuje "Colocar aquí"…' : this.avisoRed || 'Esperando la conexión…');
    }
  }

  private tPintarMulti = 0;
  private resumenPintado = -1;
  private tEspera = 0;

  // ---- Botones que cambian en multijugador ---------------------------

  protected conectarBotones(): void {
    super.conectarBotones();
    this.escena.siguiente.alPresionar = () => {
      if ((this.fase === 'resumen' && this.dia < JORNADAS.length - 1) || this.fase === 'semana') {
        this.op({ tipo: 'siguiente' });
      }
    };
    this.escena.finalizar.alPresionar = () => {
      if (this.fase === 'resumen') {
        this.op({ tipo: 'finalizar' });
      }
    };
  }
}

