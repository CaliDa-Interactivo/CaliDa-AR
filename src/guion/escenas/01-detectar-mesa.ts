// ============================================================
// Escena 1 · DETECTAR_MESA
// La persona ve su cuarto real. Una retícula de puntos azul
// petróleo sigue su mirada sobre las superficies reales (hit-test
// de WebXR). Cuando lleva un momento sobre una mesa, la retícula
// se vuelve sólida y suena un "pop". El gato solo maúlla.
// Si no hay mesa a la vista, se trae una mesa virtual.
// ============================================================
import {
  BufferGeometry,
  CircleGeometry,
  EnvironmentRaycastTarget,
  Float32BufferAttribute,
  Group,
  Mesh,
  MeshBasicMaterial,
  Points,
  PointsMaterial,
  RaycastSpace,
  RingGeometry,
  Vector3,
  type Entity,
} from '@iwsdk/core';
import { COLOR } from '../../datos.js';
import { buscarMesa } from '../../webxr.js';
import { OCULTO, type Contexto, type Escena } from '../contexto.js';
import { sonidos } from '../sonidos.js';

// En el computador la mesa va más lejos para que quepa todo en la pantalla.
const DISTANCIA_PRUEBA = 1.45;
const TIEMPO_FIJO = 1.5; // segundos mirando la mesa
const TIEMPO_MAXIMO = 7; // después se usa un plano detectado o la mesa virtual

export function crearDetectarMesa(): Escena {
  let reticula: Entity | null = null;
  let puntos: Points;
  let solida: Group;
  let fijo = 0;
  let alto = -1;
  let lista = false;
  const punto = new Vector3();

  function armar(c: Contexto): Entity {
    // Puntos en una cuadrícula redonda, acostados sobre la superficie.
    const posiciones: number[] = [];
    for (let x = -4; x <= 4; x++) {
      for (let z = -4; z <= 4; z++) {
        if (x * x + z * z <= 17) {
          posiciones.push(x * 0.035, 0.002, z * 0.035);
        }
      }
    }
    const geometria = new BufferGeometry();
    geometria.setAttribute('position', new Float32BufferAttribute(posiciones, 3));
    puntos = new Points(
      geometria,
      new PointsMaterial({ color: COLOR.petroleo, size: 0.011, sizeAttenuation: true }),
    );
    // Versión sólida: disco con aro.
    const material = new MeshBasicMaterial({
      color: COLOR.petroleo,
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
    });
    const disco = new Mesh(new CircleGeometry(0.15, 40), material);
    const aro = new Mesh(new RingGeometry(0.15, 0.165, 48), new MeshBasicMaterial({ color: COLOR.petroleo }));
    disco.rotation.x = aro.rotation.x = -Math.PI / 2;
    disco.position.y = 0.002;
    aro.position.y = 0.003;
    solida = new Group();
    solida.add(disco, aro);
    const grupo = new Group();
    grupo.add(puntos, solida);
    return c.crearSuelto(grupo);
  }

  function superficieLista(c: Contexto, virtual: boolean): void {
    lista = true;
    c.superficie.copy(punto);
    c.mesaVirtual = virtual;
    const obj = reticula!.object3D!;
    if (reticula!.hasComponent(EnvironmentRaycastTarget)) {
      reticula!.removeComponent(EnvironmentRaycastTarget);
    }
    obj.position.copy(punto);
    obj.rotation.set(0, 0, 0);
    obj.visible = true;
    puntos.visible = false;
    solida.visible = true;
    if (virtual) {
      // Mesa virtual bajo la retícula, de frente a la persona.
      const mesa = c.mesa.object3D!;
      mesa.position.copy(punto);
      mesa.rotation.set(0, Math.atan2(c.cabeza.x - punto.x, c.cabeza.z - punto.z), 0);
      c.mesaArmada.patas.scale.y = Math.max(0.1, punto.y - 0.04);
      mesa.visible = true;
      mesa.scale.setScalar(0.02);
      c.anim.mover(mesa, null, 0.4, { escala: 1 });
      obj.position.y += 0.004;
    }
    sonidos.pop();
    c.tEscena = 0;
  }

  return {
    nombre: 'DETECTAR_MESA',

    entrar(c) {
      reticula ??= armar(c);
      fijo = 0;
      alto = -1;
      lista = false;
      const obj = reticula.object3D!;
      obj.scale.setScalar(1);
      obj.visible = true;
      puntos.visible = true;
      solida.visible = false;
      c.mostrar(c.mesa, false);
      // La retícula sigue la mirada sobre las superficies reales.
      if (c.enXR() && !reticula.hasComponent(EnvironmentRaycastTarget)) {
        reticula.addComponent(EnvironmentRaycastTarget, {
          space: RaycastSpace.Viewer,
          maxDistance: 3,
        });
      }
      sonidos.maullido();
    },

    actualizar(c, dt) {
      const obj = reticula!.object3D!;
      if (lista) {
        // Un instante con la retícula sólida y a la escena siguiente.
        solida.scale.setScalar(1 + Math.sin(Math.min(1, c.tEscena / 0.3) * Math.PI) * 0.15);
        if (c.tEscena > 0.9) {
          c.siguiente();
        }
        return;
      }
      // Los puntos "escanean": laten suave.
      (puntos.material as PointsMaterial).size = 0.011 + Math.sin(c.tiempo * 6) * 0.003;

      const conToque =
        reticula!.hasComponent(EnvironmentRaycastTarget) &&
        !!reticula!.getValue(EnvironmentRaycastTarget, 'xrHitTestResult');
      if (conToque) {
        const y = obj.position.y;
        const esMesa = y > 0.3 && y < 1.3;
        if (esMesa && Math.abs(y - alto) < 0.04) {
          fijo += dt;
        } else {
          fijo = 0;
          alto = y;
        }
        if (fijo >= TIEMPO_FIJO) {
          punto.copy(obj.position);
          superficieLista(c, false);
          return;
        }
      } else if (!c.enXR()) {
        // En el computador: la retícula va al frente, a la altura de una mesa.
        obj.position.copy(c.cabeza).addScaledVector(c.frente, c.enXR() ? 0.85 : DISTANCIA_PRUEBA);
        obj.position.y = 0.74;
      }

      const limite = c.enXR() ? TIEMPO_MAXIMO : 1.8;
      if (c.tEscena > limite) {
        // Plano de mesa que haya detectado el visor, o mesa virtual.
        const cuadro = c.mundo.xrFrame;
        const espacio = c.mundo.xrReferenceSpace;
        if (cuadro && espacio && buscarMesa(cuadro, espacio, c.cabeza, punto)) {
          superficieLista(c, false);
        } else {
          punto.copy(c.cabeza).addScaledVector(c.frente, c.enXR() ? 0.85 : DISTANCIA_PRUEBA);
          punto.y = 0.74;
          superficieLista(c, true);
        }
      }
    },

    salir() {
      const obj = reticula!.object3D!;
      obj.visible = false;
      obj.scale.setScalar(OCULTO);
    },
  };
}
