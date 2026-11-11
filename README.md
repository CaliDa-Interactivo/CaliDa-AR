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

## Dónde está cada cosa

| Archivo | Qué tiene |
| --- | --- |
| `iwsdk.config.json` | Sesión de RA, manos, detección de planos, agarre |
| `src/experiencia.ts` | El flujo completo (fases, mesa real o virtual, caja, camión, mapa, carpa) |
| `src/datos.ts` | Productos, refugios y sus necesidades, textos de las situaciones, paleta |
| `src/modelos.ts` | Modelos: los `.glb` del equipo y los hechos en código (caja, camión, mesa, carpa, mapa) |
| `src/texto.ts` | Globo del gato, botón y etiquetas (Roboto) |
| `src/assets.ts` | Catálogo de modelos (`public/models/*.glb`, copiados de la página) |

Antes de probar un cambio: `npm run typecheck`.
