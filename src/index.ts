// CaliDa RA · Centro de acopio — realidad aumentada para Meta Quest 3 (IWSDK).
import './guion/fuente-es.js'; // tildes y eñes en los paneles (antes de crear el mundo)
import { DepthSensingSystem, VisibilityState, World } from '@iwsdk/core';
import projectOptions from 'virtual:iwsdk-project';
import { OficinaSystem } from './oficina/juego.js';
import { MultiSystem } from './oficina/multi.js';
import { Red, type Rol } from './oficina/red.js';
import { comprobarWebXR } from './webxr.js';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const entrada = $<HTMLDivElement>('entrada');
const aviso = $<HTMLParagraphElement>('aviso');
const estadoWebXR = $<HTMLParagraphElement>('webxr');
const pasoModo = $<HTMLDivElement>('paso-modo');
const pasoMulti = $<HTMLDivElement>('paso-multi');
const botonSolo = $<HTMLButtonElement>('entrar');
const botonMulti = $<HTMLButtonElement>('multi');
const botonCrear = $<HTMLButtonElement>('crear');
const botonUnirse = $<HTMLButtonElement>('unirse');
const campoCodigo = $<HTMLInputElement>('codigo');
const estadoSala = $<HTMLParagraphElement>('estado-sala');
const botonEntrarMulti = $<HTMLButtonElement>('entrar-multi');
const botonVolver = $<HTMLButtonElement>('volver-modo');

const parametros = new URLSearchParams(window.location.search);

// Errores visibles en la pantalla de entrada (para reportarlos desde las gafas).
const mostrarError = (texto: string) => {
  estadoWebXR.textContent = `Error: ${texto}`;
  estadoWebXR.style.color = '#CC0100';
};
window.addEventListener('error', (e) => mostrarError(e.message));
window.addEventListener('unhandledrejection', (e) => mostrarError(String((e.reason as Error)?.message ?? e.reason)));
estadoWebXR.textContent = 'Cargando la experiencia…';
// ?prueba: recorrido con el mouse en el computador, sin la pantalla de entrada.
const enPrueba = parametros.has('prueba');

// La sala se puede crear o unir apenas abre la página (sin esperar al 3D).
const red = new Red();
if (enPrueba) {
  (window as unknown as Record<string, unknown>).red = red;
}

// Los letreros 3D se dibujan en lienzos: Roboto debe estar cargada antes de
// crear el mundo (si no, quedarían con otra letra). Máximo 4 s de espera.
const fuentes = Promise.race([
  Promise.all(['300', '400', '700', '900'].map((peso) => document.fonts.load(`${peso} 40px Roboto`))),
  new Promise((listo) => setTimeout(listo, 4000)),
]).catch(() => undefined);

const mundo = fuentes.then(() => World.create($<HTMLDivElement>('scene-container'), projectOptions));
mundo.catch((e: unknown) => mostrarError(`no se pudo cargar (${(e as Error)?.message ?? e}). Recarga la página.`));
mundo.then(async (world) => {
  // Foveación suave: los bordes de la vista (paneles laterales) se ven más nítidos.
  world.renderer.xr.setFoveation(0.4);
  if (enPrueba) {
    // Para revisar el estado desde la consola del navegador.
    (window as unknown as Record<string, unknown>).mundo = world;
  }
  // El sistema del juego se registra al elegir el modo.
  let registrado = false;
  const registrar = (sistema: 'solo' | 'multi') => {
    if (registrado) {
      return;
    }
    registrado = true;
    // Oclusión con la profundidad real (Quest 3). Por defecto la hace three.js:
    // cuando el visor da la profundidad (gpu-optimized), three escribe la
    // profundidad real en el búfer y lo real (las manos) tapa lo virtual a ras,
    // sin convertir unidades. La oclusión suave de IWSDK dejaba la escena
    // invisible en el Quest; se puede probar con ?oclusionsuave.
    if (parametros.has('oclusionsuave')) {
      world.registerSystem(DepthSensingSystem, {
        configData: { enableDepthTexture: true, enableOcclusion: true, useFloat32: true, blurRadius: 8 },
      });
    }
    world.registerSystem(sistema === 'multi' ? MultiSystem : OficinaSystem);
  };
  let puedeRA = false;

  // ---- Multijugador: sala con código de 4 dígitos ----
  (world.globals as Record<string, unknown>).red = red;
  let rolElegido: Rol = 'receptor';
  document.querySelectorAll<HTMLButtonElement>('.rol').forEach((b) => {
    b.addEventListener('click', () => {
      rolElegido = b.dataset.rol as Rol;
      document.querySelectorAll('.rol').forEach((x) => x.classList.toggle('activo', x === b));
    });
  });
  const nombreRol = (r: Rol) => (r === 'receptor' ? 'Receptor' : 'Despachador');
  red.alCambiar = (estado, detalle) => {
    if (estado === 'conectado') {
      estadoSala.textContent = `Conectados en la sala ${red.codigo}. Tu rol: ${nombreRol(red.rol)}. Ya pueden entrar.`;
      botonEntrarMulti.disabled = !puedeRA;
    } else if (estado === 'esperando') {
      estadoSala.textContent =
        detalle ?? `Sala ${red.codigo}. Eres ${nombreRol(red.rol)}. Comparte el código y espera al otro jugador.`;
    } else if (estado === 'reconectando') {
      estadoSala.textContent = detalle ?? 'Reconectando…';
    }
  };
  botonMulti.addEventListener('click', () => {
    pasoModo.hidden = true;
    pasoMulti.hidden = false;
  });
  botonVolver.addEventListener('click', () => {
    pasoModo.hidden = false;
    pasoMulti.hidden = true;
  });
  botonCrear.addEventListener('click', async () => {
    botonCrear.disabled = botonUnirse.disabled = true;
    estadoSala.textContent = 'Creando la sala…';
    try {
      await red.crearSala(rolElegido);
    } catch (e) {
      estadoSala.textContent = (e as Error).message;
      botonCrear.disabled = botonUnirse.disabled = false;
    }
  });
  botonUnirse.addEventListener('click', async () => {
    const codigo = campoCodigo.value.trim();
    if (!/^\d{4}$/.test(codigo)) {
      estadoSala.textContent = 'Escribe el código de 4 dígitos de la sala.';
      return;
    }
    botonCrear.disabled = botonUnirse.disabled = true;
    estadoSala.textContent = 'Conectando…';
    try {
      await red.unirse(codigo);
    } catch (e) {
      estadoSala.textContent = (e as Error).message;
      botonCrear.disabled = botonUnirse.disabled = false;
    }
  });
  botonEntrarMulti.addEventListener('click', () => {
    registrar('multi');
    world.launchXR();
  });
  botonSolo.addEventListener('click', () => {
    registrar('solo');
    world.launchXR();
  });

  // Pantalla de entrada (solo fuera de la sesión de realidad aumentada).
  world.visibilityState.subscribe((estado) => {
    entrada.hidden = enPrueba || estado !== VisibilityState.NonImmersive;
  });

  // Modo prueba en el computador: ?prueba (un jugador),
  // ?prueba&multi=crear&rol=despachador o ?prueba&multi=unir&sala=1234.
  if (enPrueba) {
    const multi = parametros.get('multi');
    if (multi) {
      await salaDePrueba;
      registrar('multi');
    } else {
      registrar('solo');
    }
  }

  // WebXR: ¿este navegador puede abrir una sesión de realidad aumentada?
  const soporte = await comprobarWebXR();
  puedeRA = soporte.realidadAumentada;
  if (puedeRA) {
    estadoWebXR.textContent = 'WebXR listo: realidad aumentada disponible.';
  } else {
    botonSolo.disabled = true;
    estadoWebXR.textContent = soporte.api
      ? 'WebXR: este equipo no ofrece realidad aumentada.'
      : 'Este navegador no tiene WebXR.';
    aviso.textContent =
      'Esta experiencia es solo para gafas Meta Quest: abre este enlace en el navegador de las gafas.';
  }
});

// Modo prueba: ?prueba&multi=crear&rol=despachador o ?prueba&multi=unir&sala=1234.
const salaDePrueba: Promise<unknown> = (() => {
  const multi = parametros.get('multi');
  if (!enPrueba || !multi) {
    return Promise.resolve();
  }
  if (multi === 'crear') {
    return red.crearSala((parametros.get('rol') as Rol) || 'despachador').then((codigo) => {
      (window as unknown as Record<string, unknown>).sala = codigo;
      document.title = `Sala ${codigo}`;
    });
  }
  return red.unirse(parametros.get('sala') ?? '');
})();
