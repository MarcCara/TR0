# Base de dades del QUIZ

## Prova local amb Docker

Des de la carpeta `TR0`, inicieu MySQL:

```powershell
docker compose up -d --wait
```

Docker crearà la base de dades `quiz` i les taules a partir de `backend/database.sql`. Després, des de `TR0/backend`, importeu les preguntes i respostes:

```powershell
$env:DB_HOST = '127.0.0.1'
$env:DB_PORT = '3306'
$env:DB_USER = 'quiz'
$env:DB_PASSWORD = 'quiz_local_password'
$env:DB_NAME = 'quiz'
npm run migrate
```

Amb aquestes variables encara definides, inicieu el servidor des de `TR0` amb `node frontend/server.js` i comproveu `http://localhost:40400/api/preguntes`. Hauria de retornar les preguntes desades a MySQL. En acabar, atureu el contenidor amb `docker compose down`; les dades es conserven al volum `mysql_data`. Per reiniciar la base de dades des de zero, elimineu el volum amb `docker compose down -v`.

Les contrasenyes del fitxer `compose.yaml` són només per a aquesta prova local; no les feu servir al servidor.

## Desplegament

1. Creeu una base de dades i un usuari per a ella des de HestiaCP. Anoteu el nom complet de la base de dades, que pot incloure un prefix.
2. Obriu phpMyAdmin des de HestiaCP, seleccioneu aquesta base de dades, obriu la pestanya SQL i executeu el contingut de `database.sql` per crear les taules.
3. Configureu aquestes variables d'entorn al procés Node de producció (al panell d'aplicacions o servei que l'inicia) amb les dades de HestiaCP. Feu-ho tant per a la migració com per al servidor; no les deseu al repositori:

   - `DB_HOST`: host de MySQL indicat pel proveïdor de Hestia; `localhost` només si Node s'executa al mateix servidor.
   - `DB_PORT`: port MySQL (normalment `3306`; es pot ometre).
   - `DB_USER`: usuari de base de dades creat a HestiaCP.
   - `DB_PASSWORD`: contrasenya d'aquest usuari.
   - `DB_NAME`: nom complet de la base de dades creada a HestiaCP.

4. Assegureu-vos que MySQL a Hestia accepta connexions des de l'equip on s'executa Node. Si Node és al mateix servidor, feu servir el host local indicat per Hestia. Des de `TR0/backend`, executeu `npm run migrate` per importar les preguntes i respostes dels fitxers JSON. Aquest pas només cal repetir-lo quan vulgueu tornar a importar aquestes dades.
5. Des de `TR0`, inicieu el servidor amb `node frontend/server.js`. El servidor comprova la connexió amb MySQL abans d'acceptar peticions. Si Hestia assigna un port a través de `PORT`, aquest s'utilitza; altrament, el port per defecte és `40400`.

`compose.yaml` és només per al desenvolupament local. En producció, la base de dades de Hestia és l'única base de dades que s'ha de configurar per a Node; el servidor no assumeix cap connexió local si falten les variables requerides.

L'esquema desa les preguntes a `preguntes` i les opcions a `opcions`. Cada opció pertany a una pregunta i `es_correcta` identifica la resposta vàlida. Les rutes mantenen els formats JSON existents.

La pàgina `frontend/admin.html` permet administrar preguntes i carregar imatges JPG, PNG o WebP de fins a 5 MB. Els fitxers es desen a `frontend/imagenes/uploads` i a la base de dades només se'n desa la ruta.