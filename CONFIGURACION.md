# Instalación real de Restaurantes — Apps Faro

## Estado
El repositorio contiene **código de la aplicación y del servidor**, pero no es una instalación productiva hasta que se despliegue y configure la infraestructura. No hay pagos automáticos ni confirmación bancaria automática.

- Sitio estático de demostración: https://appsfaro.github.io/restaurante/demo.html
- Repositorio: https://github.com/Appsfaro/restaurante
- Producción prevista: \`https://restaurante.appsfaro.com\` (NO configurada)
- Firebase existente: proyecto \`restaurantes-81aa1\`, Firestore predeterminado.
- Backend: Node.js ≥22, servido conjuntamente con la app; puede usar Render u otro hosting con CPU suficiente.
- Adjuntos: Cloudflare R2 u otro almacén privado compatible. **Obligatorio** para operar en producción.

## 1. Mantén Firestore protegido
En Firebase → Cloud Firestore → Reglas:
\`\`\`
rules_version = '2';
service cloud.firestore {
 match /databases/{database}/documents {
  match /{document=**} { allow read, write: if false; }
 }
}
\`\`\`
No habilites reglas abiertas. La API usa **credenciales privadas de servidor** y verifica los permisos por restaurante. Firestore Admin/IAM no aplica estas reglas del cliente.

## 2. Cuenta de servicio de Firebase
En Firebase → Configuración del proyecto → Cuentas de servicio, genera una clave privada del proyecto solo para uso de servidor. Idealmente utiliza una cuenta de servicio dedicada con permisos mínimos (por ejemplo Cloud Datastore User/roles/datastore.user). Nunca subas ese archivo a GitHub, no lo pegues en chats y no lo compartas con clientes.

En el proveedor de hosting, configura un secreto \`GOOGLE_SERVICE_ACCOUNT\` con el JSON completo de esa cuenta.
El código comprueba que \`project_id\` sea \`restaurantes-81aa1\`.

## 3. Crear almacenamiento privado de comprobantes (R2)
En Cloudflare → R2, crea un bucket privado. Genera un token S3 API con permisos de lectura/escritura **solo sobre ese bucket**; no habilites enlaces públicos del bucket.

Configura las siguientes variables privadas del servicio:
- \`R2_ENDPOINT\`: URL S3 del R2 de tu cuenta, incluyendo https
- \`R2_BUCKET\`: nombre exacto del bucket
- \`R2_ACCESS_KEY_ID\`: ID secreto S3
- \`R2_SECRET_ACCESS_KEY\`: clave secreta S3
- \`REQUIRE_OBJECT_STORAGE=true\`

La API registra el hash del archivo en Firestore y lo guarda físicamente en R2. Los comprobantes se leen solo mediante un endpoint autenticado y autorizado. Si falta R2, la versión de producción rechaza guardar un comprobante en lugar de exponerlo.

## 4. Desplegar en Render (alternativa)
1. Abre https://dashboard.render.com/ y conecta GitHub con acceso al repositorio \`Appsfaro/restaurante\`.
2. Selecciona **New → Blueprint**, elige este repo y el archivo \`render.yaml\`.
3. El blueprint establece una instancia **Free únicamente para pruebas**. Render advierte que las instancias Free se suspenden por inactividad y no deben utilizarse para servicios comerciales de producción. Antes de lanzar a clientes, cambia a un plan con recursos y disponibilidad adecuados, revisando su costo y dando tu aprobación.
4. Completa los secretos privados mencionados arriba.
5. \`SESSION_SECRET\`, \`PASSWORD_PEPPER\` y \`BOOTSTRAP_TOKEN\` deben ser valores aleatorios independientes y largos. El blueprint puede generar valores por defecto; guarda el \`BOOTSTRAP_TOKEN\` de forma privada para crear la primera cuenta, y elimínalo del entorno cuando hayas completado la instalación.
6. Una vez desplegado, entra en la URL HTTPS que Render te asigne. La web y la API estarán bajo el **mismo origen**: los clientes no deben configurar URL de API.
7. En el primer acceso crea el administrador Apps Faro usando el token de instalación y una contraseña robusta.

**Nunca introduzcas claves de cuenta de servicio, tokens de R2 o contraseñas de clientes en archivos del repositorio.**

## 5. Vincular el subdominio
Una vez probada la aplicación en su URL HTTPS temporal, configura un dominio personalizado en el hosting y los registros DNS que el proveedor indique:
\`restaurante.appsfaro.com\`.

No reemplaces el dominio principal \`appsfaro.com\`, que continúa como página comercial.

## 6. Flujo verificado de negocios, compras y pagos

### Administrador Apps Faro
- Crea restaurante, propietario y suscripción.
- Registra renovaciones manuales con monto, referencia y nueva fecha; \`subscription_payments\` guarda el historial.
- Suspende/restablece restaurantes.
- Los pagos de suscripciones Apps Faro y las transferencias de clientes del restaurante son **completamente diferentes**.

### Propietario
- Guarda identidad, cuenta bancaria, tarifas de envío gratis/fija/zonas y cierre por día.
- Publica menús con segundos y especiales; puede copiar en borrador la semana anterior.
- Ve pagos declarados. Solo confirma después de comprobar en el banco **referencia real e importe exacto**. El servidor impide repetir la misma referencia verificada para dos pedidos del mismo restaurante.
- Rechaza comprobantes, solicita devolución para pedidos confirmados e informa la referencia del reintegro cuando realmente devolvió el dinero.
- Registra nombre del repartidor y confirma entrega con código de 6 dígitos facilitado por el cliente.

### Cliente
- Se registra con nombre, teléfono y PIN (este primer prototipo NO valida que sea dueño de ese teléfono).
- Selecciona fecha, plato, cantidad, sector y dirección.
- La API calcula el **total exacto**, genera reserva de 30 minutos y **solo entonces** muestra el banco para transferir.
- Sube imagen/PDF del comprobante. Archivo duplicado exacto se rechaza.
- El restaurante verifica manualmente la transferencia. El pedido cambia de estado y se actualiza periódicamente en la app mientras esté abierta.
- Si la reserva ha vencido después de que el cliente transfirió, **no debe pagar dos veces**: el restaurante conciliará el movimiento directamente. Ese caso requiere atención manual.

## 7. Limitaciones que deben quedar resueltas antes de abrir a clientes reales
- **No hay integración bancaria ni pasarela de cobro**: las referencias y cantidades son confirmadas manualmente por el dueño. Capturas/PDF no prueban recepción de fondos.
- No hay recuperación del PIN mediante SMS ni validación automática del teléfono: el propietario puede regenerarlo después de verificar la identidad del cliente fuera de la app.
- No hay envío de WhatsApp, correo o push remoto cuando la app está cerrada; los cambios se consultan cada 30 segundos mientras esté abierta.
- Envíos por zonas usan selección del cliente; las direcciones deben cotejarse para evitar sectores incorrectos. No hay geocodificación ni ruteo automático.
- No hay conexión bancaria para reembolsos: registrar \`refunded\` exige una devolución real realizada externamente.
- No se ha auditado la solución por un especialista independiente ni probado contra el Firestore real del proyecto. Antes del lanzamiento deben añadirse monitoreo, protección antiabuso escalable, copias de seguridad y política de privacidad válida para Ecuador.

## 8. Comprobación técnica antes del lanzamiento
En GitHub → Actions → **Verificar Restaurantes**, las pruebas automáticas deben estar en verde. Las pruebas utilizan Firestore simulado y no sustituyen comprobaciones reales.

Realiza pruebas autorizadas contra Firebase con dos restaurantes y dos clientes:
1. alta/renovación/suspensión de restaurante;
2. menú publicado y cerrado, incluyendo horario del día;
3. precio exacto en envío gratuito/fijo/zona;
4. reserva antes del cierre + comprobante después, y expiración de reserva;
5. comprobantes idénticos y pedidos simultáneos;
6. confirmación bancaria con importe distinto y referencia duplicada;
7. rechazo y reintegro;
8. repartidor, código de entrega, cambios de estado;
9. comprobación de separación entre restaurantes;
10. restaurar PIN y revocar sesiones.

## Costos
Firestore tiene cuota gratuita bajo Spark. El blueprint de Render usa Free para validar pero no es alojamiento recomendable para producción; elegir plan de pago se hará solo con autorización. R2 tiene una cuota gratuita, pero los excesos pueden facturarse conforme a la cuenta. No se han habilitado servicios de pago en esta entrega.
