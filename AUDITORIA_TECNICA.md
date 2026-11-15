# Apps Faro / Restaurantes — Auditoría técnica del 15 de noviembre de 2026

**Veredicto:** NO APTO AÚN PARA USO COMERCIAL REAL. Análisis basado en código `main` y pruebas locales con Firestore simulado; no se dispone de acceso al entorno real Firebase ni al despliegue Cloudflare. No se ha confirmado ninguna transacción bancaria real.

## Correcciones realizadas

1. **Ruta Firestore `:runQuery`:** se corrigió la generación de `.../documents/:runQuery` a `.../documents:runQuery`. La prueba anterior era permisiva y aceptaba una ruta incorrecta.
2. **Duplicados concurrentes y guardado parcial:** la API ahora prepara dos escrituras `receipts/{proofHash}` y `orders/{orderId}` en un solo `documents:commit`, con precondición `exists:false`. Los comprobantes se identifican por hash exacto; los pedidos contienen `receiptId`. Se conserva lectura de comprobantes anteriores por ID de pedido. Dos cargas concurrentes idénticas en el simulador: una aceptada y otra rechazada.
3. **Aislamiento de permisos:** pruebas simuladas: un cliente no cambia pagos; el propietario de otro restaurante no lee ni modifica pedidos o comprobantes de otro negocio. No sustituyen pruebas contra datos reales.

## Hallazgos aún abiertos — bloqueantes

### P0. Infraestructura y autenticación

- La interfaz de GitHub Pages no opera directamente contra Firestore. Cloudflare Worker **no ha sido desplegado ni conectado** con credenciales privadas. La ruta `/api/health` solo indica si está presente `GOOGLE_SERVICE_ACCOUNT`, no realiza una consulta real.
- GitHub Pages no está autorizado como alojamiento de un SaaS comercial ni como servicio para capturar contraseñas/pagos; usar solo para exhibir la demo. Elegir alojamiento de producción compatible con el negocio.
- La autenticación hace PBKDF2-HMAC-SHA256 con 600.000 iteraciones. Es una elección defendible para proteger contraseñas, pero el Worker en plan gratuito limita CPU a 10 ms; la prueba local consumió aproximadamente 130 ms de CPU para una derivación, así que **necesita otro entorno o plan con CPU suficiente**. No reducir el costo criptográfico para esquivar el límite.
- PIN de 6 a 8 dígitos + registro de teléfono sin verificación: hay riesgo de suplantación. Incorporar verificación inicial del teléfono, límites centralizados de intentos y recuperación de acceso; sesiones con revocación.

### P0. Flujo de transferencia y cierre horario

- La pantalla de pago no recalcula de manera explícita el **total final** cuando cambian cantidad y zona; la transferencia puede hacerse por un importe incorrecto.
- El cierre de las 11:00 se verifica en el momento de **adjuntar y enviar** el comprobante. Un cliente que transfiera antes del cierre pero finalice la carga después puede quedar con dinero enviado y sin pedido. Solución: prepedido/reserva con precio cerrado, vencimiento y proceso de conciliación si el pago llega tarde.
- El sistema **no recibe confirmación del banco**: confirmar pago es una acción manual del dueño. No hay campo obligatorio de referencia bancaria, importe realmente recibido, fecha de acreditación ni conciliación contra extracto. No describirlo como verificación automática.
- No existe un registro financiero independiente para operaciones de pago, devoluciones, pagos rechazados o ajustes. Rechazar un pedido ya confirmado no implica reembolso. Definir estados distintos para pedido, pago, reembolso y entrega; registrar auditoría transaccional.
- Los comprobantes idénticos se detectan por hash de archivo, pero cambiar un píxel o recortar una captura evade el control. El bloqueo por huella no sustituye la revisión bancaria.

### P1. Almacenamiento y protección de archivos

- Actualmente `receipts.base64` se almacena **dentro de un documento Firestore**. Es factible solo para adjuntos pequeños, pero Firestore limita cada documento a 1 MiB, provoca índices grandes y dificulta políticas de conservación. Para producción, mover a almacenamiento **privado de objetos** (Cloud Storage for Firebase requiere Blaze; alternativa Cloudflare R2), guardar en Firestore solo ID, ruta, hash, MIME, tamaño, fecha y autorizaciones.
- Validar contenido real y MIME, antivirus/antimalware según solución elegida, límite de tamaño, descargas autenticadas, borrado programado y política de conservación.

### P1. Operación y notificaciones

- No hay avisos automáticos push/email/WhatsApp ni actualización en tiempo real de pedido, pago o entrega: depende de recargar la página.
- La hora de cierre es global por restaurante, no por día. No se configura horario de reparto, festivos, capacidad, porciones agotadas, ni agrupación/confirmación efectiva de rutas de repartidores.
- No se verifica que la dirección declarada pertenezca a la zona elegida: el cliente selecciona una zona y el servidor confía en esa selección para cobrar. Deben configurarse zonas comprobables o validación manual de dirección y precio antes de cobrar.
- Los menús se editan día a día con un bloque de texto; no existen opciones independientes de sopa/especiales ni copia semanal como se especificó.
- Las listas están limitadas a 250–300 registros sin paginación. Los indicadores del panel general son parciales y el sistema de pago de suscripciones SaaS todavía no existe.
- Se debe revisar accesibilidad, recuperación de contraseñas, consentimiento y privacidad, retención de comprobantes y registros de auditoría.

## Estructura recomendada en Firebase

- `restaurantes/{id}`: información, zona y modalidad de tarifa, cuenta bancaria, horario, estatus y suscripción.
- `menus/{id}`: fecha, opciones, variantes, precios y cupos.
- `customers/{id}` y `users/{id}`: perfiles, hash del PIN/contraseña, roles y verificación de teléfono.
- `orders/{id}`: cliente, restaurante, precio total inmutable, fecha, dirección, modo de reparto y estado.
- `payments/{id}`: pedido, importe debido, referencia declarada, método, comprobanteId, estado (`reported`, `under_review`, `confirmed`, `rejected`, `refunded`), fecha de confirmación, administrador y conciliación.
- `receipts/{id}`: metadatos del archivo; binario fuera de Firestore.
- `audit/{id}`: eventos inmutables de confirmación/rechazo, cambios y responsable.
- `subscriptions/{id}`: pagos y vencimientos comerciales de Apps Faro, **separados** de cobros de almuerzos.

**Nota:** Firebase por sí solo no verifica transferencias interbancarias. Para verificación automática se necesita proveedor de pagos con confirmaciones/webhooks o integración bancaria soportada; hasta entonces la conciliación es manual.

## Validaciones antes de lanzamiento

1. Crear y autenticar administradores en infraestructura de producción bajo HTTPS, con protección de intentos.
2. Verificar consultas y escrituras contra Firestore real con reglas cerradas y credenciales de servicio mínimas.
3. Hacer pedidos con envío gratis, fijo y por zonas; mostrar importe final ANTES de transferir.
4. Simular horario límite, transferencias enviadas al borde del cierre, duplicados concurrentes, errores de red y reintentos.
5. Confirmar pagos únicamente tras comprobar banco; validar rechazo, cancelación, reembolso y trazabilidad.
6. Confirmar bloqueo entre restaurantes y usuarios, pruebas de PIN, sesión caducada y actividad sospechosa.
7. Pruebas móviles, entrega real, actualización de estados y notificaciones.
8. Comprobar costos, disponibilidad, copias de seguridad y políticas de conservación.

## Fuentes oficiales

- Firebase Firestore REST runQuery: https://firebase.google.com/docs/firestore/reference/rest/v1/projects.databases.documents/runQuery
- Firebase Firestore REST commit: https://firebase.google.com/docs/firestore/reference/rest/v1/projects.databases.documents/commit
- Firestore cuotas: https://firebase.google.com/docs/firestore/quotas
- Cloud Storage billing: https://firebase.google.com/docs/storage/faqs-storage-changes-announced-sept-2024
- Cloudflare Workers limits: https://developers.cloudflare.com/workers/platform/limits/
- GitHub Pages limits: https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits
- OWASP Password Storage: https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html