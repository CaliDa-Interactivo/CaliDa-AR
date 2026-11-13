# CaliDa · Realidad aumentada (Meta Quest)

Experiencia de realidad aumentada de CaliDa, hecha con **IWSDK** (Immersive Web SDK de Meta)
y pensada **solo para gafas Meta Quest**. Es un proyecto aparte de la página interactiva
(`CaliDa-Interactivo/CaliDa`): no se publica con su mismo enlace.

## Flujo (diagrama del equipo)

1. **Bienvenida**: el gato guía saluda sobre su tarima.
2. **Rol donante**: las gafas reconocen el espacio y buscan una superficie plana.
   - Si hay una mesa real, se usa; si no, aparece una **mesa virtual**.
3. Aparecen la **estantería y la caja**: se toman productos y se llevan a la caja (caben 6).
4. Se cierra la caja y se sube al **camión** con la mano.
5. **Mapa de Cali** con refugios (casa roja = urgente, amarilla = desabastecido) y lo que necesita cada uno.
6. El camión viaja al refugio elegido → **cambio de perspectiva**.
7. **Rol beneficiario**: una carpa aparece sobre la persona; vive tres situaciones y usa lo que llegó.
   - Si los recursos no alcanzan → vuelve a la selección para completar la donación.
8. El gato cierra la experiencia.

## Guion "Cali en tu mesa" (experiencia principal)

La persona **es un centro de acopio** durante una semana (un lote). En la mesa aparecen dos cosas
separadas: su puesto (estantería de madera "CA" y el panel con las opciones para gestionar las
donaciones) y, aparte, el mapa de Cali con las cinco zonas (los mismos contornos y colores del mapa
de la página, sin casas) para enviar lo que tiene. Se abre directo; con `?prueba` se recorre con el
mouse y con `?anterior` se abre el primer recorrido (donante → beneficiario).

| Escena | Estado |
| --- | --- |
| 1 DETECTAR_MESA · 2 COLOCAR_MAQUETA · 3 MISION | hechas |
| Campana de avisos · 5 NOTIFICACION_CAJAS · 6 RESTOCK_MANUAL | hechas |
| 7 NECESIDADES · 8 URGENCIA · 10 DESPACHO · 11 FAMILIA (entrega) | hechas (MVP completo) |
| 4 TUTORIAL · 9 ARMAR_CAJA · 12 CIERRE | pendientes |

Archivos en `src/guion/`: `maquina.ts` (máquina de estados), `contexto.ts` (lo que comparten las
escenas), `estado.ts`, `manos.ts` (gestos con WebXR), `gato.ts`, `maqueta.ts`, `zonas-cali.ts`,
`notificaciones.ts` (campana, panel y gestor de eventos), `eventos.ts` (línea de tiempo por día),
`llegadas.ts` (cajas y objetos), `zonas.ts` (burbujas, lluvia y misión), `sonidos.ts`,
`animador.ts` y `escenas/NN-nombre.ts` (una por escena).

## Herramientas del proyecto (comprobadas)

| Herramienta | Dónde está en este proyecto |
| --- | --- |
| **WebXR** | Sesión `immersive-ar` de las Quest. Uso directo en `src/webxr.ts` (soporte, planos, anclas) y `src/guion/manos.ts` (articulaciones de la mano) |
| **IWSDK** | `@iwsdk/core` 1.1.0-rc.2; `iwsdk.config.json` manda sobre la sesión y las funciones |
| **Three.js** | Viene dentro de IWSDK (super-three 0.185): siempre se importa de `@iwsdk/core`, nunca de `three` |
| **IWER** | Emulador de Quest 3 (`iwer` 2.8, con `@iwsdk/vite-plugin-dev`): se abre con `npm run dev` |
| **ECS** | Componentes en `src/componentes-calida.ts` y sistemas en `src/guion/maquina.ts` y `src/experiencia.ts` |
| **UIKitML** | Panel del centro de acopio: `public/ui/centro-acopio.uikitml` (función `spatialUI`) |
| Scene Understanding | `sceneUnderstanding: true` + planos y mallas: encontrar la mesa real |
| Environment Raycast | `environmentRaycast: true` + `hitTest`: la retícula de la escena 1 sigue la mirada sobre superficies reales |

Los paneles UIKitML usan una Roboto propia (`public/ui/fonts/`) y `src/guion/fuente-es.ts` le agrega
las tildes y la eñe, que la fuente incluida en IWSDK no trae.

## Cómo abrirlo

Hace falta Node 20.19 o más nuevo.

```bash
npm install
npm run dev
```

- **En las gafas**: con el computador y las Quest en la misma red wifi, abre en el navegador de
  las gafas la dirección de red que muestra `npx @iwsdk/cli dev status` (por ejemplo
  `https://192.168.x.x:8081/`), acepta el aviso del certificado local y toca
  "Entrar en realidad aumentada". Para que encuentre mesas reales, las gafas deben tener hecha la
  configuración del espacio (Ajustes → Entorno → Configuración del espacio).
- **En el computador**: `npm run dev` abre un navegador con el emulador de Quest de IWSDK.
- **Recorrido rápido con el mouse** (sin sesión de RA): agrega `?prueba` a la dirección.

Manos: se apunta con la mano y se **junta el pulgar con el índice** para tocar y agarrar
(también funciona con los controles: gatillo).

## WebXR

WebXR es la API del navegador de las gafas que da acceso a la sesión inmersiva; IWSDK funciona
encima de ella. Además de lo que IWSDK hace por dentro, `src/webxr.ts` la usa directamente:

- `navigator.xr.isSessionSupported('immersive-ar')`: la pantalla de entrada avisa si el equipo
  puede abrir la sesión de realidad aumentada.
- `XRFrame.detectedPlanes`: se recorren los planos que detecta el visor para encontrar una mesa real.
- `XRFrame.createAnchor`: la estación de trabajo queda anclada al mundo real y sigue a su ancla.
- `XRSession.enabledFeatures`: al entrar, la consola muestra qué funciones concedió el visor.

Las funciones que se piden a la sesión están en `iwsdk.config.json` (`world.xr.features`).

## Dónde está cada cosa

| Archivo | Qué tiene |
| --- | --- |
| `iwsdk.config.json` | Sesión de RA, manos, detección de planos, agarre |
| `src/experiencia.ts` | El flujo completo (fases, mesa real o virtual, caja, camión, mapa, carpa) |
| `src/datos.ts` | Productos, refugios y sus necesidades, textos de las situaciones, paleta |
| `src/modelos.ts` | Modelos: los `.glb` del equipo y los hechos en código (caja, camión, mesa, carpa, mapa) |
| `src/webxr.ts` | Uso directo de WebXR: soporte, planos detectados y anclas |
| `src/texto.ts` | Globo del gato, botón y etiquetas (Roboto) |
| `src/assets.ts` | Catálogo de modelos (`public/models/*.glb`, copiados de la página) |

Antes de probar un cambio: `npm run typecheck`.
