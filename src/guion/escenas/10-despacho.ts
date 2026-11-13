// ============================================================
// Escena 10 · DESPACHO
// En el mapa, donde queda el centro de acopio ("CA"), espera un
// camión cargado; a su lado hay una palanca roja "Despachar".
// La persona dibuja con el dedo la ruta desde el CA hasta la zona
// (la calle inundada está bloqueada) y baja la palanca: el camión
// recorre la ruta dibujada.
//
// En el MVP no está la escena 9 (armar la caja a mano): el lote
// urgente se arma solo con agua y ropa de la estantería.
// Dibujar: con el dedo índice sobre el mapa, o apuntando y
// pellizcando (rayo de la mano, control o mouse).
// ============================================================
import {
  BoxGeometry,
  BufferGeometry,
  CylinderGeometry,
  Float32BufferAttribute,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  Points,
  PointsMaterial,
  SphereGeometry,
  Vector3,
  type Entity,
} from '@iwsdk/core';
import { COLOR } from '../../datos.js';
import { PLATAFORMA, crearCaja, crearCamion } from '../../modelos.js';
import { Etiqueta } from '../../texto.js';
import { OCULTO, type Contexto, type Escena } from '../contexto.js';
import { GROSOR_ZONA, POS_MAPA } from '../maqueta.js';
import { sonidos } from '../sonidos.js';

const MAX_PUNTOS = 260;
const ESCALA_CAMION = 0.26;
const VELOCIDAD = 0.09; // metros por segundo sobre el mapa
const Y_RUTA = GROSOR_ZONA + 0.012;

export function crearDespacho(): Escena {
  let camion: Entity | null = null;
  let palanca: Entity;
  let lienzo: Entity;
  let pin: Etiqueta;
  let pista: Etiqueta;
  let pistaEnt: Entity;
  let trazo: Points;
  let charco: Group;
  const ruta: Vector3[] = [];
  const ca = new Vector3();
  const bloqueo = new Vector3();
  const v = new Vector3();
  let dibujando = false;
  let enCamino = false;
  let tramo = 0;
  const baseAltoPalanca = 0.085;

  function armar(c: Contexto): void {
    const padre = c.maquetaEnt;
    const centro = c.maqueta.zonas.Centro.centro;
    const oriente = c.maqueta.zonas.Oriente.centro;
    // El centro de acopio en el mapa: un pin "CA" en la zona Centro.
    ca.set(centro.x - 0.035, Y_RUTA, centro.z + 0.045);
    pin = new Etiqueta(0.07);
    pin.escribir('CA', COLOR.azul);
    pin.malla.position.set(ca.x, GROSOR_ZONA + 0.05, ca.z);
    c.maqueta.raiz.add(pin.malla);

    // Camión con el lote ya cargado (una caja cerrada en la plataforma).
    const grupo = crearCamion();
    const caja = crearCaja(false);
    caja.solapas.visible = false;
    caja.tapa.visible = true;
    caja.raiz.scale.setScalar(0.95);
    caja.raiz.position.copy(PLATAFORMA);
    grupo.add(caja.raiz);
    camion = c.crear(grupo, padre);

    // Calle inundada entre el CA y Oriente: no se puede pasar por ahí.
    bloqueo.set((ca.x + oriente.x) / 2, Y_RUTA, (ca.z + oriente.z) / 2);
    charco = new Group();
    const agua = new Mesh(
      new CylinderGeometry(0.038, 0.038, 0.006, 28),
      new MeshStandardMaterial({ color: COLOR.petroleo, transparent: true, opacity: 0.75, roughness: 0.3 }),
    );
    const aviso = new Etiqueta(0.11);
    aviso.escribir('Inundada', COLOR.rojoProfundo);
    aviso.malla.position.y = 0.035;
    charco.add(agua, aviso.malla);
    charco.position.set(bloqueo.x, GROSOR_ZONA + 0.004, bloqueo.z);
    c.maqueta.raiz.add(charco);

    // La ruta dibujada: puntos rojos.
    const geometria = new BufferGeometry();
    geometria.setAttribute('position', new Float32BufferAttribute(new Float32Array(MAX_PUNTOS * 3), 3));
    geometria.setDrawRange(0, 0);
    trazo = new Points(geometria, new PointsMaterial({ color: COLOR.rojo, size: 0.012 }));
    trazo.frustumCulled = false;
    c.maqueta.raiz.add(trazo);

    // Lienzo invisible sobre el mapa: recibe el rayo (mano, control o mouse).
    const plano = new Mesh(
      new PlaneGeometry(0.66, 0.74),
      new MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }),
    );
    plano.rotation.x = -Math.PI / 2;
    const grupoLienzo = new Group();
    grupoLienzo.add(plano);
    lienzo = c.crear(grupoLienzo, padre);
    lienzo.object3D!.position.set(POS_MAPA.x, Y_RUTA, POS_MAPA.z);
    c.tocable(lienzo, 'lienzo');
    const alPunto = (evento: { point?: Vector3 }) => {
      if (dibujando && evento.point) {
        agregar(c, c.maquetaEnt.object3D!.worldToLocal(v.copy(evento.point)));
      }
    };
    const obj = lienzo.object3D! as unknown as {
      addEventListener(tipo: string, f: (e: { point?: Vector3 }) => void): void;
    };
    obj.addEventListener('pointerdown', (e) => {
      if (!enCamino) {
        dibujando = true;
        limpiar();
        alPunto(e);
      }
    });
    obj.addEventListener('pointermove', alPunto);
    obj.addEventListener('pointerup', () => (dibujando = false));

    // Palanca roja "Despachar lote".
    const grupoPalanca = new Group();
    const base = new Mesh(new BoxGeometry(0.07, 0.02, 0.05), new MeshStandardMaterial({ color: COLOR.carbon, roughness: 0.9 }));
    base.position.y = 0.01;
    const rojo = new MeshStandardMaterial({ color: COLOR.rojo, roughness: 0.8 });
    const brazo = new Mesh(new CylinderGeometry(0.007, 0.007, baseAltoPalanca, 12), rojo);
    brazo.position.y = 0.02 + baseAltoPalanca / 2;
    const pomo = new Mesh(new SphereGeometry(0.02, 16, 12), rojo);
    pomo.position.y = 0.02 + baseAltoPalanca;
    const zona = new Mesh(
      new BoxGeometry(0.09, 0.15, 0.08),
      new MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }),
    );
    zona.position.y = 0.07;
    const rotulo = new Etiqueta(0.15);
    rotulo.escribir('Despachar', COLOR.rojo);
    rotulo.malla.position.set(0, 0.006, 0.055);
    rotulo.malla.rotation.x = -Math.PI / 2;
    grupoPalanca.add(base, brazo, pomo, zona, rotulo.malla);
    palanca = c.crear(grupoPalanca, padre);
    c.tocable(palanca, 'palanca', true);

    pista = new Etiqueta(0.5);
    pistaEnt = c.crear(pista.malla, padre);
    pistaEnt.object3D!.position.set(POS_MAPA.x, 0.44, POS_MAPA.z - 0.1);
  }

  function limpiar(): void {
    ruta.length = 0;
    trazo.geometry.setDrawRange(0, 0);
  }

  function agregar(c: Contexto, punto: Vector3): void {
    if (ruta.length >= MAX_PUNTOS) {
      return;
    }
    punto.y = Y_RUTA;
    const ultimo = ruta[ruta.length - 1];
    if (ultimo && ultimo.distanceTo(punto) < 0.012) {
      return;
    }
    // La ruta tiene que salir del centro de acopio.
    if (!ultimo && punto.distanceTo(ca) > 0.08) {
      return;
    }
    ruta.push(punto.clone());
    const pos = trazo.geometry.getAttribute('position');
    pos.setXYZ(ruta.length - 1, punto.x, punto.y, punto.z);
    pos.needsUpdate = true;
    trazo.geometry.setDrawRange(0, ruta.length);
    void c;
  }

  function mostrarTodo(c: Contexto, visible: boolean): void {
    c.mostrar(camion!, visible);
    c.mostrar(palanca, visible);
    c.mostrar(lienzo, visible);
    c.mostrar(pistaEnt, visible);
    pin.malla.visible = visible;
    charco.visible = visible;
    trazo.visible = visible;
    if (visible) {
      camion!.object3D!.scale.setScalar(ESCALA_CAMION);
    }
  }

  /** Se bajó la palanca: revisa la ruta y, si sirve, sale el camión. */
  function despachar(c: Contexto): void {
    if (enCamino) {
      return;
    }
    const oriente = c.maqueta.zonas.Oriente.centro;
    const fin = ruta[ruta.length - 1];
    if (ruta.length < 4 || !fin) {
      sonidos.error();
      c.gato.decir('Primero dibuja la ruta: empieza en el CA y llévala hasta Oriente.');
      return;
    }
    if (ruta.some((p) => Math.hypot(p.x - bloqueo.x, p.z - bloqueo.z) < 0.042)) {
      sonidos.error();
      limpiar();
      c.gato.animar('triste', 2.5, c.tiempo);
      c.gato.decir('¡Esa calle está inundada, busca otra!');
      return;
    }
    if (Math.hypot(fin.x - oriente.x, fin.z - oriente.z) > 0.1) {
      sonidos.error();
      c.gato.decir('La ruta todavía no llega a Oriente. Dibújala hasta la zona.');
      return;
    }
    sonidos.logro();
    enCamino = true;
    tramo = 0;
    c.mostrar(lienzo, false);
    c.zonas.soloZona('Oriente');
    pista.escribir('El camión va en camino…', COLOR.petroleo);
    c.gato.decir('¡Lote despachado! El camión sigue la ruta que dibujaste.');
  }

  return {
    nombre: 'DESPACHO',

    entrar(c) {
      if (!camion) {
        armar(c);
      }
      enCamino = false;
      dibujando = false;
      limpiar();
      // Sin burbujas mientras se dibuja: taparían el mapa al apuntar.
      c.zonas.mostrar(false);
      mostrarTodo(c, true);
      const obj = camion!.object3D!;
      obj.position.set(ca.x, GROSOR_ZONA, ca.z);
      obj.rotation.set(0, 0, 0);
      const p = palanca.object3D!;
      p.position.set(POS_MAPA.x - 0.36, 0, POS_MAPA.z + 0.3);
      // El lote urgente sale de las repisas (bajan sus contadores).
      c.maquetaEnt.object3D!.updateWorldMatrix(true, false);
      c.llegadas.sacar('alimento-agua', obj.position);
      c.llegadas.sacar('ropa-ninos', obj.position);
      pista.escribir('Dibuja la ruta del CA a Oriente y baja la palanca', COLOR.petroleo);
      c.gato.decir('El lote ya está en el camión. Dibuja con el dedo la ruta del CA a Oriente y baja la palanca roja.');
    },

    actualizar(c, dt) {
      const pistaObj = pistaEnt.object3D!;
      c.mirar(pistaObj);
      c.mirar(pin.malla);
      const obj = camion!.object3D!;
      if (!enCamino) {
        // Dibujar tocando el mapa con la punta del índice.
        for (const mano of [c.manos.derecha, c.manos.izquierda]) {
          if (!mano.presente) {
            continue;
          }
          const local = c.maquetaEnt.object3D!.worldToLocal(v.copy(mano.indice));
          const sobreMapa =
            Math.abs(local.x - POS_MAPA.x) < 0.33 && Math.abs(local.z - POS_MAPA.z) < 0.37 && local.y < 0.07;
          if (sobreMapa) {
            if (ruta.length > 0 && c.tiempo - ultimoToque > 1.2) {
              limpiar(); // trazo nuevo
            }
            ultimoToque = c.tiempo;
            agregar(c, local);
          }
        }
        return;
      }
      // El camión recorre la ruta dibujada.
      let paso = VELOCIDAD * dt;
      while (paso > 0 && tramo < ruta.length) {
        const meta = ruta[tramo];
        const dx = meta.x - obj.position.x;
        const dz = meta.z - obj.position.z;
        const falta = Math.hypot(dx, dz);
        if (falta <= paso) {
          obj.position.set(meta.x, GROSOR_ZONA, meta.z);
          paso -= falta;
          tramo++;
          continue;
        }
        obj.position.x += (dx / falta) * paso;
        obj.position.z += (dz / falta) * paso;
        const giro = Math.atan2(-dz, dx);
        let diferencia = giro - obj.rotation.y;
        diferencia = Math.atan2(Math.sin(diferencia), Math.cos(diferencia));
        obj.rotation.y += diferencia * Math.min(1, dt * 9);
        paso = 0;
      }
      if (tramo >= ruta.length) {
        c.siguiente();
      }
    },

    alSoltar(c, id, entidad, toque) {
      if (id !== 'palanca') {
        return;
      }
      // Bajar la palanca (o tocarla): vuelve a su sitio y despacha.
      const p = entidad.object3D!.position;
      const bajo = p.y < -0.03;
      p.set(POS_MAPA.x - 0.36, 0, POS_MAPA.z + 0.3);
      if (toque || bajo) {
        despachar(c);
      }
    },

    salir(c) {
      // El camión se queda donde llegó; se quita lo de dibujar.
      c.mostrar(palanca, false);
      c.mostrar(lienzo, false);
      c.mostrar(pistaEnt, false);
      charco.visible = false;
      trazo.visible = false;
      if (camion && !enCamino) {
        mostrarTodo(c, false);
      }
    },
  };
}

let ultimoToque = 0;
