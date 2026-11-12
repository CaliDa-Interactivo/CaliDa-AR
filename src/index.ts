// CaliDa — experiencia de realidad aumentada para Meta Quest (IWSDK).
import { VisibilityState, World } from '@iwsdk/core';
import projectOptions from 'virtual:iwsdk-project';
import { ExperienciaSystem } from './experiencia.js';
import { GuionSystem } from './guion/maquina.js';
import { comprobarWebXR } from './webxr.js';

const entrada = document.getElementById('entrada') as HTMLDivElement;
const botonEntrar = document.getElementById('entrar') as HTMLButtonElement;
const aviso = document.getElementById('aviso') as HTMLParagraphElement;
const estadoWebXR = document.getElementById('webxr') as HTMLParagraphElement;
// ?prueba: recorrido con el mouse en el computador, sin la pantalla de entrada.
const enPrueba = new URLSearchParams(window.location.search).has('prueba');
const conGuion = new URLSearchParams(window.location.search).has('guion');

World.create(
  document.getElementById('scene-container') as HTMLDivElement,
  projectOptions,
).then(async (world) => {
  // ?guion: el guion nuevo "Cali en tu mesa" (en construcción, escena por
  // escena). Sin eso se abre el recorrido anterior, que sigue completo.
  if (conGuion) {
    world.registerSystem(GuionSystem);
  } else {
    world.registerSystem(ExperienciaSystem);
  }
  if (enPrueba) {
    // Para revisar el estado desde la consola del navegador.
    (window as unknown as Record<string, unknown>).mundo = world;
  }

  // Pantalla de entrada (solo fuera de la sesión de realidad aumentada).
  botonEntrar.addEventListener('click', () => world.launchXR());
  world.visibilityState.subscribe((estado) => {
    entrada.hidden = enPrueba || estado !== VisibilityState.NonImmersive;
  });
  // WebXR: ¿este navegador puede abrir una sesión de realidad aumentada?
  const soporte = await comprobarWebXR();
  if (soporte.realidadAumentada) {
    estadoWebXR.textContent = 'WebXR listo: realidad aumentada disponible.';
  } else {
    botonEntrar.disabled = true;
    estadoWebXR.textContent = soporte.api
      ? 'WebXR: este equipo no ofrece realidad aumentada.'
      : 'Este navegador no tiene WebXR.';
    aviso.textContent =
      'Esta experiencia es solo para gafas Meta Quest: abre este enlace en el navegador de las gafas.';
  }
});
