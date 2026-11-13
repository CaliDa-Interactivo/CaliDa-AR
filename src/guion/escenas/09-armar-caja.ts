// ============================================================
// Escena 9 · ARMAR_CAJA
// Junto a la estantería hay una caja abierta con espacio limitado
// (cuatro puestos, en cuadrícula). La persona saca objetos de las
// repisas (bajan sus contadores) y los acomoda en la caja: encajan
// con un "clic". Si un objeto no es lo que la zona necesita, la
// caja lo expulsa. Se cierra juntando las dos manos (o con el
// botón "Cerrar caja").
// ============================================================
import { Vector3, type Entity } from '@iwsdk/core';
import { PRODUCTOS } from '../../datos.js';
import { crearCaja, type CajaArmada } from '../../modelos.js';
import { PastillaBoton } from '../../texto.js';
import { OCULTO, type Contexto, type Escena } from '../contexto.js';
import type { Objeto } from '../llegadas.js';
import { sonidos } from '../sonidos.js';

const CUPO = 4;
const POS_CAJA = new Vector3(-0.01, 0, 0.24);
const ESCALA_CAJA = 0.95;

/** ¿Este objeto le sirve a Oriente en la urgencia? (ropa y agua) */
const sirve = (o: Objeto): boolean =>
  o.categoria === 'ropa' || PRODUCTOS[o.producto].id === 'alimento-agua';

export function crearArmarCaja(): Escena {
  let caja: Entity | null = null;
  let armada: CajaArmada;
  let cerrar: Entity;
  let dentro: Objeto[] = [];
  let cerrada = false;
  let manosAbiertas = false;
  const v = new Vector3();

  function puesto(i: number, salida: Vector3): Vector3 {
    return salida.set(
      POS_CAJA.x + (i % 2 === 0 ? -0.058 : 0.058),
      0.052,
      POS_CAJA.z + (i < 2 ? -0.04 : 0.042),
    );
  }

  function intentarCerrar(c: Contexto): void {
    if (cerrada) {
      return;
    }
    const hayAgua = dentro.some((o) => PRODUCTOS[o.producto].id === 'alimento-agua');
    const hayRopa = dentro.some((o) => o.categoria === 'ropa');
    if (!hayAgua || !hayRopa) {
      sonidos.error();
      c.gato.decir(
        `Todavía falta ${!hayAgua && !hayRopa ? 'agua y ropa' : !hayAgua ? 'agua' : 'ropa'}. Primero lo urgente.`,
      );
      return;
    }
    cerrada = true;
    c.tEscena = 0;
    sonidos.logro();
    armada.solapas.visible = false;
    armada.tapa.visible = true;
    c.mostrar(cerrar, false);
    for (const objeto of dentro) {
      const obj = objeto.entidad.object3D!;
      obj.visible = false;
      obj.scale.setScalar(OCULTO);
    }
    c.gato.animar('aplaudir', 2.5, c.tiempo);
    c.gato.decir('¡Caja lista! Va para el camión.');
  }

  return {
    nombre: 'ARMAR_CAJA',

    entrar(c) {
      if (!caja) {
        armada = crearCaja(false);
        caja = c.crear(armada.raiz, c.maquetaEnt);
        const boton = new PastillaBoton();
        boton.escribir('Cerrar caja');
        boton.malla.scale.setScalar(0.55);
        cerrar = c.crear(boton.malla, c.maquetaEnt);
        cerrar.object3D!.position.set(POS_CAJA.x, 0.3, POS_CAJA.z);
        c.tocable(cerrar, 'cerrar-lote');
        void document.fonts?.load('700 40px Roboto').then(() => boton.dibujar()).catch(() => undefined);
      }
      dentro = [];
      cerrada = false;
      manosAbiertas = false;
      armada.solapas.visible = true;
      armada.tapa.visible = false;
      const obj = caja.object3D!;
      obj.position.copy(POS_CAJA);
      obj.visible = true;
      obj.scale.setScalar(0.02);
      c.anim.mover(obj, null, 0.4, { escala: ESCALA_CAJA });
      c.mostrar(cerrar, true);
      c.gato.animar('quieto');
      c.gato.decir(
        'Arma la caja para Oriente: saca de las repisas agua y ropa y ponlas en la caja. Primero lo urgente. ¿Cabe algo más?',
      );
    },

    actualizar(c) {
      c.mirar(cerrar.object3D!);
      if (cerrada) {
        if (c.tEscena > 2.5) {
          c.siguiente();
        }
        return;
      }
      // Juntar las dos manos (después de tenerlas separadas) cierra la caja.
      const m = c.manos;
      if (m.izquierda.presente && m.derecha.presente) {
        const d = m.izquierda.muneca.distanceTo(m.derecha.muneca);
        if (d > 0.3) {
          manosAbiertas = true;
        } else if (manosAbiertas && d < 0.14) {
          manosAbiertas = false;
          intentarCerrar(c);
        }
      }
    },

    alTocar(c, id) {
      if (id === 'cerrar-lote') {
        intentarCerrar(c);
      }
    },

    alSoltar(c, id, _entidad, toque) {
      if (cerrada || !id.startsWith('objeto:')) {
        return;
      }
      const llegadas = c.llegadas;
      const objeto = llegadas.objetos[Number(id.slice(7))];
      const obj = objeto.entidad.object3D!;
      const dato = PRODUCTOS[objeto.producto];
      const sobreCaja = Math.hypot(obj.position.x - POS_CAJA.x, obj.position.z - POS_CAJA.z) < 0.15;

      if (objeto.lugar === 'lote') {
        // Sacarlo de la caja: vuelve a su repisa.
        if (toque || !sobreCaja) {
          dentro = dentro.filter((o) => o !== objeto);
          llegadas.devolver(objeto);
          dentro.forEach((o, i) => c.anim.mover(o.entidad.object3D!, puesto(i, v), 0.25));
        } else {
          c.anim.mover(obj, puesto(dentro.indexOf(objeto), v), 0.25);
        }
        return;
      }
      if (objeto.lugar !== 'repisa') {
        return;
      }
      if (!toque && !sobreCaja) {
        llegadas.rebotar(objeto);
        return;
      }
      if (!sirve(objeto)) {
        // La caja expulsa lo que la zona no necesita.
        sonidos.error();
        llegadas.rebotar(objeto);
        c.gato.decir(`${dato.nombre} no es lo que Oriente necesita ahora: pide ropa y agua.`);
        return;
      }
      if (dentro.length >= CUPO) {
        sonidos.error();
        llegadas.rebotar(objeto);
        c.gato.decir('La caja está llena. Ciérrala juntando las manos.');
        return;
      }
      sonidos.clic();
      llegadas.alLote(objeto);
      dentro.push(objeto);
      c.anim.mover(obj, puesto(dentro.length - 1, v), 0.35, { arco: 0.1, escala: 0.8 });
    },

    salir(c) {
      if (caja) {
        c.mostrar(caja, false);
        c.mostrar(cerrar, false);
      }
    },
  };
}
