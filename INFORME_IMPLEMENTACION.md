# Informe de implementación — Restaurantes by Apps Faro
Fecha: 15 de noviembre de 2026

## Veredicto
**Código implementado en la rama main, no desplegado como servicio comercial.** El trabajo no equivale a una aplicación validada en el proyecto Firebase real. El despliegue requiere configurar credenciales privadas, R2, hosting y hacer una prueba manual con dinero de prueba o sin transferencia.

## Funciones ya implementadas en código
- Panel Apps Faro: altas y suspensiones de negocios; renovaciones de suscripción registradas separadamente; indicadores de actividad con aviso de resultados parciales.
- Restaurante: marca y logo; datos bancarios; envío gratis, fijo o por zonas; horarios de cierre diferenciados por día; menú por fecha, platos normales y especiales; copia de semana anterior en borrador.
- Cliente: nombre, teléfono y PIN con hash protegido; reserva con monto calculado en servidor; reserva de 30 minutos antes de enviar la transferencia; comprobante JPG/PNG/WEBP/PDF.
- Pago de almuerzo: pedido, comprobante y registro financiero creados atómicamente en Firestore; deduplicación de archivo exacto; confirmación manual solo tras cotejar dinero y referencia real con banco; bloqueo de referencia bancaria repetida para un mismo negocio; rechazo, devolución pendiente y registro de devolución completa.
- Entrega: estado en preparación, en camino y entregado, repartidor identificado y código de recepción del cliente.
- Seguridad: roles y segregación de restaurantes en API, sesiones verificadas y revocadas al resetear PIN, recuperación supervisada por propietario, reglas Firestore cerradas a clientes.
- Almacenamiento: adaptador para bucket privado Cloudflare R2 con metadatos en Firestore. En producción se exige configurar R2.
- Despliegue: servidor Node en mismo origen (sin límite CPU Worker gratuito); blueprint de prueba Render Free; CSP para los scripts; archivo CONFIGURACION.md con pasos y secretos necesarios.
- Actualización: consulta periódica de estados con avisos de navegador mientras la app está abierta.
- Pruebas: GitHub Actions ejecuta sintaxis e integración simulada; verificar la ejecución más reciente en la pestaña Actions.

## Qué NO está verificado ni activado
1. Despliegue real del servidor y conexión con `restaurantes-81aa1` (no se configuraron sus credenciales).
2. Bucket R2 real, claves privadas, DNS, HTTPS del dominio comercial.
3. Confirmación bancaria automática (no hay integración bancaria). El dueño sigue comprobando las transferencias, y los reembolsos son manuales.
4. Envíos WhatsApp, SMS, correo, notificaciones cuando la web está cerrada y verificación de titularidad de teléfono.
5. Geolocalización/verificación automática de zonas, rutas optimizadas, límite de inventario simultáneo.
6. Volumen alto: las listas/estadísticas tienen límite de registros y requieren agregados paginados.
7. Revisión de seguridad independiente, aprobación de política de privacidad, retención y borrado de comprobantes.
8. Pruebas funcionales en navegador móvil real, banco y Firebase real.

## Enlaces
- Repositorio: https://github.com/Appsfaro/restaurante
- Configuración: https://github.com/Appsfaro/restaurante/blob/main/CONFIGURACION.md
- Pruebas: https://github.com/Appsfaro/restaurante/actions
- Demostración: https://appsfaro.github.io/restaurante/demo.html

## Próxima puesta en marcha
1. Crear cuenta de servicio Firebase de mínimo privilegio y almacenarla únicamente como secreto en el hosting.
2. Crear bucket privado R2 y configurar credenciales S3 restringidas.
3. Conectar Render al repositorio y lanzar el blueprint en Free solo para probar, sin habilitar cobros automáticos.
4. Crear usuario principal Apps Faro en instalación inicial, luego deshabilitar el token de instalación.
5. Probar dos negocios diferentes, un pedido, pago manual, rechazo, devolución y entrega con recepción.
6. Validar costos y política de privacidad, contratar alojamiento de producción solo cuando esté justificado y aprobado.
