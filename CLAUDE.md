# IWSDK project guidance

@AGENTS.md

## CaliDa RA: oclusión (no repetir el error de la escena invisible)

En el Quest 3, la oclusión por profundidad de IWSDK (`DepthSensingSystem` +
`DepthOccludable`, en cualquier modo) dejó TODA la escena virtual invisible, aunque
en el computador y en el emulador se veía bien. Por eso:

- Por defecto no se pide la profundidad ni se usa la oclusión de IWSDK; las manos
  tapan con `OclusorManos` (articulaciones de WebXR). Solo `?oclusionsuave` la activa.
- Las reglas están en `src/oficina/seguridad-oclusion.ts` y las vigila
  `npm run pruebas` (también en GitHub antes de publicar).
- No cambiar la oclusión, el formato de profundidad ni el render (escala del
  framebuffer) sin probar en las gafas.
