# Restaurantes by Apps Faro

Aplicación web para vender **almuerzos con entrega a domicilio u oficina**: menús por día, zonas y tarifas de envío, pago por transferencia con comprobante, verificación manual, preparación y entrega. Incluye administración comercial de restaurantes y suscripciones de Apps Faro.

## Enlaces

- [Administrador general](https://appsfaro.github.io/restaurante/#/faro/home)
- [Administrador de restaurante](https://appsfaro.github.io/restaurante/#/restaurante/home)
- [Cliente del restaurante](https://appsfaro.github.io/restaurante/#/cliente/home)

## Componentes

- `index.html`: interfaz de operación real, responsive, sin información de prueba.
- `worker/src/index.js`: servidor seguro para autenticación propia y operaciones Firestore.
- `worker/wrangler.toml`: configuración de despliegue con Cloudflare Worker.
- `CONFIGURACION.md`: pasos exactos para conectar el servidor al proyecto Firebase `restaurantes-81aa1`.
- `demo.html`: prototipo visual anterior conservado como referencia de diseño, **no** operativo.

## Estado de conexión

El frontend ya puede cargar información persistente, pero la API necesita una **implantación independiente**. Sin esa API, GitHub Pages muestra una pantalla de conexión y no inventa negocios, pagos o pedidos. Consulta [CONFIGURACION.md](CONFIGURACION.md) para completar el despliegue.

No introducir tokens, contraseñas, cuentas de servicio ni claves privadas en este repositorio público.

## Seguridad y limitaciones

- Firestore mantiene bloqueado el acceso directo del cliente (`allow read, write: if false`).
- Usuarios y PIN: hash con sal, PBKDF2-600000 y secreto privado en el backend; límites de intentos y sesiones firmadas.
- Verificación del dinero siempre manual. Un comprobante nunca equivale automáticamente a pago recibido.
- Adjuntos pequeños limitados y privados; antes de producción ampliar a almacenamiento específico de archivos, verificación del teléfono, protección antibots y manejo de incidentes.
- Esta versión es una **base funcional de integración**, no un SaaS listo para clientes de pago hasta desplegar API, auditar seguridad y realizar pruebas con datos reales.