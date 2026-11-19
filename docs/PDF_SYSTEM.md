# Sistema de PDFs de Bolsillo Mágico

Norma para todo PDF que emite la app (avisos, informes, comprobantes). Complementa `docs/EMAIL_SYSTEM.md`: el correo es de la marca; el PDF es **del usuario**. Si el PDF se reenvía a un tercero (un arrendatario, una corredora, un contador), la marca debe sentirse como una firma, no como publicidad.

## De dónde sale la norma

Se revisaron dos PDFs reales que el usuario recibe de terceros:

- **Liquidación de sueldo (Buk).** Página blanca, título simple, logo chico arriba a la derecha (~12 % del ancho) y repetido diminuto con el dominio al pie. Tablas con encabezado en azul grisáceo muy suave. Sin bandas de color.
- **Aviso de reajuste de arriendo (corredora).** Página blanca, logo del emisor arriba a la izquierda, datos de contacto arriba a la derecha, etiqueta de mes en pastilla, reglas finas, pie con contacto y un logo diminuto del proveedor.

Lo común: **marca chica en una esquina arriba, una línea fina, texto chico abajo, y todo el peso visual en el contenido.** Una primera versión nuestra (banda azul a todo el ancho, logo de 40 pt, pie navy) era la excepción y se descartó por abrumadora.

## Reglas

**Página.** A4, fondo blanco, márgenes de 50 pt. Una página cuando se pueda.

**Marca (máximo dos apariciones).**
1. Encabezado: logo estándar (cuadrado azul + estrella dorada + copa blanca) de **20 pt** con el wordmark "Bolsillo" (navy) + "Mágico" (azul) al lado, arriba a la izquierda. A la derecha, la etiqueta del documento en mayúsculas, 8,5 pt, gris. Debajo, una regla de 0,8 pt.
2. Pie: regla fina, "Generado con Bolsillo Mágico" a la izquierda y `bolsillomagico.com` a la derecha, 8 pt, gris.

**No.** Bandas de color a todo el ancho; logos de más de 24 pt; el logo invertido (fondo blanco) sobre blanco; marca de agua; más de un bloque de color sólido; dorado fuera del ícono (el dorado no pasa contraste sobre blanco).

**Color.** El azul `#2B7CF6` es acento: la cifra principal y el logo. El navy `#0E2A52` es el texto y los títulos. Los fondos de bloque son tinte suave `#EEF4FF` con borde `#D5E6FF` (el mismo borde de las tarjetas de la app). Semáforo (mint/oro/coral) solo si el documento comunica una alerta, con las reglas de severidad de la app.

**Tipografía.** Helvetica estándar de PDF (sin fuentes que empaquetar; sirve igual en el cron). Título 19 pt bold, cuerpo 10 pt, notas 8,5 pt gris, etiquetas de tabla 8 pt bold gris en mayúsculas. Solo caracteres WinAnsi (tildes y ñ sí; flechas y símbolos raros no).

**Estructura.** Encabezado de marca → título + fecha de emisión → partes involucradas → cuerpo (tabla) → un solo bloque destacado con el resultado → notas de método y fuente → cláusula o respaldo legal si corresponde → pie.

**Contenido que genera confianza.** Todo número que dependa de un dato externo muestra su origen (fuente y período), y el método de cálculo en una frase. Cuando el documento puede reenviarse a un tercero, cita la cláusula del contrato que lo sustenta.

**Archivo.** Nombre `bolsillo-magico-{tipo}-{periodo}.pdf` (ej. `bolsillo-magico-reajuste-2026-12.pdf`). Metadatos: título descriptivo y autor "Bolsillo Mágico" (`setPdfMetadata`).

## Cómo se implementa

`lib/pdf-brand.ts` concentra la marca: `PDF` (medidas y paleta), `drawBrandMark`, `drawPdfHeader`, `drawPdfFooter` y `setPdfMetadata`. Todo se dibuja en vectores con `pdf-lib`, sin archivos de imagen. Un PDF nuevo solo escribe su contenido entre el encabezado y el pie; no dibuja marca por su cuenta. Ejemplo de referencia: `lib/rent-adjustment-pdf.ts`.

## Pendiente

Si algún día hay PDFs de varias páginas, el pie suma "página X de Y" a la derecha, antes del dominio.
