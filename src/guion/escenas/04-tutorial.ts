// ============================================================
// Escena 4 · TUTORIAL
// La estantería del centro de acopio tiene un hueco punteado y
// hay una caja de práctica. (a) La persona agarra la caja y la
// pone en el hueco: brilla verde bosque. (b) Gira la palma
// izquierda hacia arriba, aparece la campana en la muñeca y la
// toca con el índice de la otra mano: el panel se abre con un
// aviso de prueba, que al confirmarlo pasa a "hecho".
// ============================================================
import {
  BoxGeometry,
  Mesh,
  MeshBasicMaterial,
  Vector3,
  type Entity,
} from '@iwsdk/core';
import { MUEBLE, crearCaja } from '../../modelos.js';
import { OCULTO, type Contexto, type Escena } from '../contexto.js';
import { ANCHO_ESTANTERIA, POS_CENTRO_ACOPIO } from '../maqueta.js';
import { sonidos } from '../sonidos.js';

const ESCALA_MUEBLE = ANCHO_ESTANTERIA / MUEBLE.ancho;
const ESCALA_CAJA = 0.5;

export function crearTutorial(): Escena {
  let caja: Entity | null = null;
  let hueco: Mesh;
  let material: MeshBasicMaterial;
  let paso: 'caja' | 'campana' | 'hecho' = 'caja';
  const inicio = new Vector3(-0.2, 0, 0.3);
  const destino = new Vector3();

  function armar(c: Contexto): void {
    // El hueco: en la repisa de abajo de la estantería (la de Construcción,
    // que el MVP no usa).
    const comp = MUEBLE.compartimientos.construccion;
    destino.set(
      POS_CENTRO_ACOPIO.x,
      comp.y0 * ESCALA_MUEBLE,
      POS_CENTRO_ACOPIO.z + MUEBLE.zProductos * ESCALA_MUEBLE,
    );
    material = new MeshBasicMaterial({ color: '#FFF6E6', wireframe: true, transparent: true, opacity: 0.9 });
    hueco = new Mesh(new BoxGeometry(0.15, 0.085, 0.11, 3, 2, 2), material);
    hueco.position.set(destino.x, destino.y + 0.045, destino.z);
    c.maqueta.raiz.add(hueco);
    const armada = crearCaja(false);
    armada.solapas.visible = false;
    armada.tapa.visible = true;
    caja = c.crear(armada.raiz, c.maquetaEnt);
    c.tocable(caja, 'practica', true);
  }

  function encajar(c: Contexto): void {
    paso = 'campana';
    sonidos.clic();
    c.anim.mover(caja!.object3D!, destino, 0.35, { arco: 0.05, escala: ESCALA_CAJA });
    // El hueco brilla verde bosque.
    material.color.set('#3E7A6C');
    material.wireframe = false;
    material.opacity = 0.45;
    c.gato.animar('aplaudir', 2, c.tiempo);
    c.gato.decir(
      'Así se agarra. Ahora gira la palma izquierda hacia arriba y toca la campana de tu muñeca con el otro índice.',
    );
    c.avisos.avisar({
      id: 'prueba',
      tipo: 'prueba',
      texto: 'Así te llegan las novedades del centro',
      accion: 'Entendido',
    });
  }

  return {
    nombre: 'TUTORIAL',

    entrar(c) {
      if (!caja) {
        armar(c);
      }
      paso = 'caja';
      material.color.set('#FFF6E6');
      material.wireframe = true;
      material.opacity = 0.9;
      hueco.visible = true;
      const obj = caja!.object3D!;
      obj.position.copy(inicio);
      obj.visible = true;
      obj.scale.setScalar(0.02);
      c.anim.mover(obj, null, 0.4, { escala: ESCALA_CAJA });
      c.gato.animar('quieto');
      c.gato.decir('Practiquemos. Agarra la caja y ponla en el hueco punteado de la estantería.');
    },

    actualizar(c) {
      if (paso === 'caja') {
        hueco.scale.setScalar(1 + Math.sin(c.tiempo * 4) * 0.04);
      } else if (paso === 'hecho' && c.tEscena > 3) {
        c.siguiente();
      }
    },

    alSoltar(c, id, entidad, toque) {
      if (id !== 'practica' || paso !== 'caja') {
        return;
      }
      const p = entidad.object3D!.position;
      const cerca =
        Math.abs(p.x - destino.x) < 0.32 && p.y < 0.3 && p.y > -0.1 && p.z < POS_CENTRO_ACOPIO.z + 0.35;
      if (toque || cerca) {
        encajar(c);
      } else {
        c.anim.mover(entidad.object3D!, inicio, 0.4, { arco: 0.08 });
      }
    },

    alAviso(c, aviso) {
      if (aviso.id === 'prueba' && paso === 'campana') {
        paso = 'hecho';
        c.tEscena = 0;
        c.avisos.resolver('prueba');
        c.gato.animar('aplaudir', 2.5, c.tiempo);
        c.gato.decir('¡Eso! Cuando suene la campana de tu muñeca, revísala: ahí te aviso todo.');
      }
    },

    salir(c) {
      hueco.visible = false;
      if (caja) {
        c.anim.cancelar(caja.object3D!);
        caja.object3D!.visible = false;
        caja.object3D!.scale.setScalar(OCULTO);
      }
    },
  };
}
