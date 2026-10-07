# Quiz: instalación y puesta en marcha en Hestia

Esta guía describe cómo iniciar la aplicación en el servidor, conectarla con MySQL de Hestia y mantenerla ejecutándose al cerrar SSH usando `screen`.

## Requisitos previos

- La base de datos y el usuario ya están creados en Hestia, y las tablas se han creado ejecutando [`backend/database.sql`](backend/database.sql) en phpMyAdmin.
- Node.js y npm están disponibles en el servidor.
- MySQL acepta conexiones desde el servidor donde se ejecuta Node.
- Tienes el host MySQL y la contraseña del usuario de base de datos.

La base y el usuario indicados para este proyecto son `a24marcarmon_TestAuto` y `a24marcarmon_admin`. Sustituye el host de ejemplo por el host real indicado por Hestia. No guardes la contraseña en este repositorio.

## Primera instalación

Conéctate por SSH y ve a la carpeta del proyecto:

```bash
cd ~/web/a24marcarmon.daw.inspedralbes.cat/private/TRs/TR0
```

Comprueba que Node, npm y `screen` están disponibles:

```bash
node -v
npm -v
screen --version
```

Instala las dependencias del backend:

```bash
npm install --prefix backend
```

## Configurar y cargar datos en MySQL

Inicia una sesión persistente:

```bash
screen -S quiz
```

Los siguientes comandos se ejecutan **dentro de `screen`**. Configura los datos de conexión. Si Hestia indica que Node y MySQL están en el mismo servidor, normalmente el host será `localhost`; en caso contrario, usa el host proporcionado:

```bash
export DB_HOST='localhost'
export DB_PORT='3306'
export DB_USER='a24marcarmon_admin'
export DB_NAME='a24marcarmon_TestAuto'
read -rsp 'Contraseña MySQL: ' DB_PASSWORD; echo
export DB_PASSWORD
```

La contraseña no se muestra mientras la escribes. No la compartas ni la pongas en un comando literal.

Si todavía no has importado las preguntas del proyecto en esta base de datos, ejecútalo una vez:

```bash
npm run --prefix backend migrate
```

Este comando importa las preguntas y respuestas que vienen en los archivos JSON del proyecto; no copia automáticamente datos añadidos a otra base de datos.

## Iniciar el servidor

En la misma sesión de `screen`, desde la carpeta raíz del proyecto, inicia Node:

```bash
node frontend/server.js
```

El servidor prueba la conexión a MySQL antes de iniciar. Si no se especifica `PORT`, escucha en el puerto `40400`. Déjalo ejecutándose y pulsa **Ctrl+A** y luego **D** para separar la sesión sin detener Node.

Comprueba que la sesión sigue activa:

```bash
screen -ls
```

Para consultar la página, abre en el navegador:

```text
http://TU-DOMINIO:40400/
```

Y para comprobar la API:

```text
http://TU-DOMINIO:40400/api/preguntes
```

Sustituye `TU-DOMINIO` por el dominio público real. Si el sitio ya funciona con otro puerto o una URL configurada por el proveedor, usa esa dirección. Si desde el propio servidor responde pero desde Internet no, el proveedor debe permitir el puerto o configurar un proxy del dominio hacia el puerto de Node.

## Volver a la sesión y detener el servidor

Para volver a la sesión separada:

```bash
screen -r quiz
```

Para detener Node, vuelve a la sesión y pulsa **Ctrl+C**. Para cerrar después la sesión de `screen`, escribe:

```bash
exit
```

Si el servidor se detuvo pero la sesión `quiz` sigue abierta, puedes volver con `screen -r quiz` y ejecutar de nuevo `node frontend/server.js`. Si necesitas crear la sesión otra vez, repite los pasos de configuración de las variables antes de iniciar Node.

`screen` permite que Node siga ejecutándose al cerrar SSH, pero no garantiza que se reinicie si el servidor se reinicia. Consulta al proveedor si necesitas inicio automático tras un reinicio. No expongas MySQL públicamente para hacer accesible la aplicación.
