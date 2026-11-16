# Restaurantes by Apps Faro

Aplicación web para gestión de almuerzos con entrega exclusiva a domicilio/oficina. Código en `main`.

## Funciones implementadas
- Administrador Apps Faro: alta y suspensión de negocios, registro manual de renovaciones de suscripción.
- Administrador restaurante: identidad, banco, menús semanales, platos especiales, tarifas y horarios por día, pedidos, conciliación bancaria manual, devoluciones y confirmación de reparto.
- Cliente: cuenta con PIN protegido, total previo al pago, reserva de 30 minutos, comprobante, pedidos e información de entrega.
- Firestore en servidor y almacenamiento privado opcional R2 (obligatorio en producción).
- Pruebas automáticas en GitHub Actions.

## Estado actual
**El código está implementado y las pruebas automáticas no equivalen a servicio desplegado.** Para funcionar con clientes reales falta configurar secretos privados y desplegar servidor Node + almacenamiento privado. No hay pasarela bancaria automática ni SMS.

## Enlaces
- [Demostración de pantallas en GitHub Pages](https://appsfaro.github.io/restaurante/demo.html)
- [Repositorio](https://github.com/Appsfaro/restaurante)
- [Guía completa de puesta en marcha](CONFIGURACION.md)
- [Auditoría técnica inicial](AUDITORIA_TECNICA.md)
- [Pruebas en GitHub Actions](https://github.com/Appsfaro/restaurante/actions)

## Iniciar localmente (Node 22+)
```bash
npm install
npm test
npm start
```
Usa variables de entorno en tu sistema o hosting, no un archivo versionado. El backend no puede leer Firestore real si no dispone de cuenta de servicio privada. Para evitar exposición de pagos, GitHub Pages queda dedicado a la **demostración estática**: la versión comercial debe alojarse en un servicio apropiado.
