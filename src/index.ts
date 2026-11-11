// CaliDa — experiencia de realidad aumentada para Meta Quest (IWSDK).
import { VisibilityState, World } from '@iwsdk/core';
import projectOptions from 'virtual:iwsdk-project';
import { ExperienciaSystem } from './experiencia.js';

const entrada = document.getElementById('entrada') as HTMLDivElement;
const botonEntrar = document.getElementById('entrar') as HTMLButtonElement;
const aviso = document.getElementById('aviso') as HTMLParagraphElement;
// ?prueba: recorrido con el mouse en el computador, sin la pantalla de entrada.
const enPrueba = new URLSearchParams(window.location.search).has('prueba');

World.create(
  document.getElementById('scene-container') as HTMLDivElement,
  projectOptions,
).then(async (world) => {
  world.registerSystem(ExperienciaSystem);
  if (enPrueba) {
    // Para revisar el estado desde la consola del navegador.
    (window as unknown as Record<string, unknown>).mundo = world;
  }

  // Pantalla de entrada (solo fuera de la sesión de realidad aumentada).
  botonEntrar.addEventListener('click', () => world.launchXR());
  world.visibilityState.subscribe((estado) => {
    entrada.hidden = enPrueba || estado !== VisibilityState.NonImmersive;
  });
  const conRA = await navigator.xr
    ?.isSessionSupported('immersive-ar')
    .catch(() => false);
  if (!conRA) {
    botonEntrar.disabled = true;
    aviso.textContent =
      'Esta experiencia es solo para gafas Meta Quest: abre este enlace en el navegador de las gafas.';
  }
});
