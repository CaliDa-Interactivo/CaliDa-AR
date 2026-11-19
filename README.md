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

## CaliDa RA · Centro de acopio (experiencia principal, desde el 18 nov 2026)

Juego de gestión con presión de tiempo: la persona maneja un centro de acopio de la Cruz Roja en
Cali durante una semana (lunes a viernes, cada día más difícil). La oficina se arma en U a su
alrededor: izquierda, el panel de avisos; frente, la repisa de 6 categorías (tope de 30 cada una),
la pila de cajas, la zona de trabajo, la caja del pedido y la caneca de descarte; derecha, el camión
y el botón "Despachar".

- **Estética de la página:** la estantería es `estanteria.glb` de la página con sus placas (borde
  de madera, crema, clavos, Roboto 700, contador `n/30` y punto de estado); los productos son los
  modelos de la página simplificados (`public/models/ra/`); los botones son píldoras 3D con los
  colores del administrador (principal azul #1F5490, secundario crema, peligro rojo).
- **Ergonomía (calibración de pie al colocar):** estatura ≈ altura de los ojos / 0,93. Mesa a la
  altura del codo (0,63 × estatura) menos 7,5 cm; la estantería se achica si hace falta para que
  sus filas queden entre la cadera y los hombros (nunca sobre los ojos); paneles a 70 cm con el
  centro 12,5° bajo los ojos, mirando a la persona; lo que se agarra a 35–60 cm del pecho. Botón
  "Recalibrar altura" en el menú bajo el panel (`ajustarErgonomia` en `escena.ts`).
- **Fin de cada jornada:** "Continuar" (siguiente día) o "Finalizar experiencia" (resumen total y
  "Volver al inicio", donde está el gato). El viernes solo "Finalizar experiencia".
- **Espacio:** la mesa flota (sin patas). El piso se
  busca con los planos del visor y, si no hay, con hit-test (`SondaPiso` en `webxr.ts`); si nada
  responde se usa el piso del espacio de referencia. Mientras se escoge el lugar, el gato y
  "Colocar aquí" siguen la mirada. Al colocarla se fija con un ancla de WebXR.
- **Manos sin pellizco:** la palma de canto (vertical) junto a un objeto lo resalta y al cerrar el
  puño se agarra (cierra < 4,5 cm, abre > 6,5 cm). Lo que se lleva va en la palma, un poco afuera
  de los nudillos, con el giro con que se tomó, sigue la muñeca suavizado (~50 ms), se achica si es
  grande y siempre se ve encima de la mano. Sonidos: "pop" al agarrar, acierto o error al soltar en
  un puesto. Botones con la punta del índice. Rayos y pellizco de IWSDK apagados. Con controles:
  gatillo lateral. En el computador (`?prueba`): arrastrar y hacer clic con el mouse.
- **Oclusión:** con Depth Sensing (Quest 3) lo real tapa lo virtual con borde suave
  (`DepthSensingSystem` + `oclusion.ts`, que también parcha los objetos que aparecen después); sin
  él, la malla de la mano se vuelve un oclusor invisible. La mano dibujada no se ve.
- **Flujo:** llegan cajas → abrir con la tapa → revisar cada objeto a mano (contorno rojo = dañado;
  el gato lo explica, ya no hay pregunta Sí / No) → a su fila o a la caneca → llega un pedido con reloj → elegir el municipio del Valle del Cauca →
  armar la caja desde la repisa → al camión → botón. Resumen diario con estrellas y resumen de la semana.
- **Código:** `src/oficina/` (`juego.ts` es el sistema; `escena.ts`, `repisa.ts`, `panel.ts`,
  `interaccion.ts`, `manos.ts`, `objetos.ts`, `datos.ts` con las jornadas y municipios).
- **Multijugador (2 Quest):** en la pantalla de inicio, "Multijugador" → quien crea la sala elige su
  rol y recibe un código de 4 dígitos; el otro lo escribe y queda con el rol contrario. Conexión con
  PeerJS (WebRTC; el servidor público de PeerJS solo los presenta). El anfitrión manda el reloj, la
  repisa compartida, el estado de las categorías, el chat y los resúmenes.
  - **Receptor:** donantes en fila con barra de paciencia y tarjeta (nombres y cédulas inventados);
    se digita nombre, cédula, categoría y cantidad en el teclado virtual y se registra; si la fila
    está llena se rechaza. Abre cajas, clasifica a mano y surte la repisa. A la derecha, el panel de estado.
  - **Despachador:** pedidos con reloj en su computador, caja vacía infinita, camión y botón. Sin
    caneca (no clasifica) y sin teclado.
  - **Mensajes** a la izquierda del panel, solo con botones (sin texto libre): uno por categoría con
    la foto de su producto (el otro recibe "Necesito [ícono] [categoría]") y cuatro fijos: "¡Hola!",
    "Pedido urgente", "Categoría llena" y "Listo, enviado". Se ven los últimos 5, con ícono, sonido
    de notificación y la hora del reloj del juego.
  - Archivos: `red.ts` (PeerJS), `compartido.ts` (estado y reglas, sin three.js), `multi.ts`
    (sistema), `multi-ui.ts` (teclado, chat, formulario, panel de estado, donantes).
  - Prueba en el computador: `?prueba&multi=crear&rol=despachador` en una pestaña (el código
    queda en el título) y `?prueba&multi=unir&sala=CÓDIGO` en otra.

Otros recorridos que se conservan: `?guion` ("Cali en tu mesa") y `?anterior` (donante → beneficiario).

## Guion "Cali en tu mesa" (se abre con ?guion)

La persona **es un centro de acopio** durante una semana (un lote). En la mesa aparecen dos cosas
separadas: su puesto (estantería de madera "CA" y el panel con las opciones para gestionar las
donaciones) y, aparte, el mapa de Cali con las cinco zonas (los mismos contornos y colores del mapa
de la página, sin casas) para enviar lo que tiene. Se abre directo; con `?prueba` se recorre con el
mouse y con `?anterior` se abre el primer recorrido (donante → beneficiario).

| Escena | Estado |
| --- | --- |
| 1 DETECTAR_MESA · 2 COLOCAR_MAQUETA · 3 MISION | hechas |
| Campana de avisos · 5 NOTIFICACION_CAJAS · 6 RESTOCK_MANUAL | hechas |
| 7 NECESIDADES · 8 URGENCIA · 10 DESPACHO · 11 FAMILIA (entrega) | hechas |
| 4 TUTORIAL · 9 ARMAR_CAJA · 12 CIERRE | hechas (guion completo) |

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
