# Restaurantes Apps Faro — conexión real a Firebase

## Estado actual

La interfaz real está publicada desde `index.html` por GitHub Pages. No muestra datos ficticios y no admite pedidos sin un servidor auténtico. El servidor está implementado en `worker/src/index.js`, pero **no se publica automáticamente** hasta que se configuren las credenciales y se despliegue Cloudflare Worker.

## 1. Proteger Firestore

En Firebase `restaurantes-81aa1` > Firestore > Reglas, mantener la política inicial de cierre total a los clientes web:

```javascript
rules_version = '2';
service cloud.firestore {
 match /databases/{database}/documents {
  match /{document=**} { allow read, write: if false; }
 }
}
```

**No** cambiar a `allow read, write: if true`. El servidor accede mediante cuenta de servicio e impone permisos por restaurante. El código de esa cuenta nunca se guarda en el repositorio público.

## 2. Preparar un servidor seguro

1. Crea una cuenta gratuita en [Cloudflare](https://dash.cloudflare.com/) si aún no la tienes.
2. En Google Cloud del proyecto `restaurantes-81aa1`, crea una **cuenta de servicio exclusiva** con acceso mínimo a Firestore (Cloud Datastore User), y genera un JSON de clave privada. Guarda la clave con seguridad; no la envíes al chat ni la agregues a GitHub.
3. En Windows, con Node.js, clona el repositorio y entra a `worker`:

```powershell
git clone https://github.com/Appsfaro/restaurante.git
cd restaurante\worker
npx wrangler login
```

4. Configura los secretos con los siguientes comandos. Wrangler pedirá el valor de cada uno, sin publicarlo en GitHub. Para `GOOGLE_SERVICE_ACCOUNT` pega el JSON completo de la cuenta de servicio (una sola línea):

```powershell
npx wrangler secret put GOOGLE_SERVICE_ACCOUNT
npx wrangler secret put SESSION_SECRET
npx wrangler secret put PASSWORD_PEPPER
npx wrangler secret put BOOTSTRAP_TOKEN
```

Los tres últimos valores deben ser distintos, aleatorios y largos (32 caracteres o más). Para generar cada uno:

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

5. Despliega la API:

```powershell
npx wrangler deploy
```

La URL será similar a `https://appsfaro-restaurantes-api.<tu-cuenta>.workers.dev`. Comprueba `https://.../api/health`, que debe indicar `firestoreConfigured: true`.

**Nota de costos:** Cloudflare Workers Free tiene límites estrictos de tiempo de CPU (10 ms por petición a fecha de noviembre de 2026). El hashing PBKDF2-600000 puede superar este límite. Para acceso confiable en producción, se deberá evaluar Workers Paid u otro backend compatible, verificar los costos y configurar límites de facturación antes de habilitar pagos reales. La aplicación en GitHub Pages no utiliza por sí sola un backend. Nunca rebajes la seguridad del hashing como solución al límite de CPU.

## 3. Enlazar GitHub Pages con la API

1. Abre https://appsfaro.github.io/restaurante/
2. En la pantalla de configuración introduce la URL HTTPS de tu Worker. Esta es una URL pública, no una clave privada.
3. Comprueba que la conexión sea correcta.
4. Selecciona «Administrador general» y «Primera instalación».
5. Escribe el `BOOTSTRAP_TOKEN` guardado solo en Cloudflare y define tu usuario y contraseña robusta (mínimo 12 caracteres). La instalación solo puede ejecutarse una vez.
6. Entra a la administración general, crea el primer restaurante y asigna su vencimiento de suscripción.
7. El propietario ingresa a su panel, registra banco, horario y tarifa de envío, publica el menú y comparte su código de restaurante.
8. Cada cliente se registra con teléfono, nombre y PIN de 6 a 8 números, luego realiza un pedido con su comprobante y el dueño valida el ingreso bancario manualmente.

## 4. Enlaces

- Administración general: https://appsfaro.github.io/restaurante/#/faro/home
- Restaurante: https://appsfaro.github.io/restaurante/#/restaurante/home
- Cliente: https://appsfaro.github.io/restaurante/#/cliente/home
- Fuente de la API: `worker/src/index.js`.

## Alcance y advertencias de la primera versión

- El portal **sí** implementa operaciones reales de lectura/escritura en Firestore una vez desplegada y configurada la API. Antes de eso no hay operaciones persistentes.
- Los comprobantes JPEG, PNG, WEBP y PDF pequeños (máximo aproximadamente 400 KB) se almacenan en una colección privada de Firestore. Es una solución inicial que **no debe escalarse** sin almacenamiento privado de archivos (R2 o Firebase Storage), retención limitada y análisis de malware.
- Los pagos bancarios se verifican **manualmente**. No se confirma dinero por el hecho de subir un archivo.
- Un PIN con teléfono **sin validación del teléfono** no es adecuado para abrir acceso al público masivamente. Antes del lanzamiento general integrar verificación de teléfono, recuperación de credenciales, protección antibots, monitoreo, cumplimiento de protección de datos y procedimientos de reembolso.
- La autenticación usa PBKDF2-HMAC-SHA-256, 600 000 iteraciones y un secreto del servidor (pepper); el hash y la sal se guardan en Firestore, nunca la contraseña ni el PIN originales.
- Mantener permisos por restaurante, HTTPS, límites de intentos, tokens firmados y auditoría. La cuenta de servicio solo vive en Cloudflare Secrets.
- GitHub Pages puede servir de interfaz durante pruebas, pero sus condiciones de uso no permiten usarlo para alojar directamente un SaaS comercial. Antes del lanzamiento se migrará la interfaz a alojamiento apropiado.

## Verificación inicial

- Entrar en `.../api/health` y ver que el servidor informa que está configurado.
- Crear un restaurante con vencimiento futuro, entrar con su cuenta y guardar un menú publicado.
- Registrar un cliente, hacer pedido con comprobante y revisar el listado desde el propietario.
- Confirmar un pago solo después de verificar el banco, y avanzar a preparación, reparto y entrega.
- Verificar que otro restaurante no puede leer pedidos ni comprobantes ajenos.