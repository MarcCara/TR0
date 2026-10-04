const express = require('../backend/node_modules/express');
const fs = require('fs');
const path = require('path');
const multer = require('../backend/node_modules/multer');
const app = express();
const port = Number(process.env.PORT || process.argv[2]) || 40400;

const { v4: uuidv4 } = require('../backend/node_modules/uuid/dist-node/index.js');
const createDatabasePool = require('../backend/database');
const database = createDatabasePool(10);

const sessions = new Map();
const uploadDirectory = path.join(__dirname, 'uploads', 'questions');
fs.mkdirSync(uploadDirectory, { recursive: true });

app.use(express.static(__dirname));
app.use(express.json());

const imageExtensions = new Map([
  ['image/jpeg', '.jpg'],
  ['image/png', '.png'],
  ['image/gif', '.gif'],
  ['image/webp', '.webp']
]);
const upload = multer({
  storage: multer.diskStorage({
    destination: uploadDirectory,
    filename: (req, file, callback) => {
      callback(null, `${uuidv4()}${imageExtensions.get(file.mimetype) || ''}`);
    }
  }),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter: (req, file, callback) => {
    if (!imageExtensions.has(file.mimetype)) {
      return callback(new Error('El fitxer ha de ser una imatge JPEG, PNG, GIF o WebP.'));
    }
    callback(null, true);
  }
});

function processarPujada(req, res, next) {
  upload.single('imatge')(req, res, error => {
    if (error instanceof multer.MulterError) {
      return res.status(400).json({ error: 'No s’ha pogut pujar la imatge. Comproveu-ne el format i la mida (màxim 5 MB).' });
    }
    if (error) return res.status(400).json({ error: error.message });
    next();
  });
}

async function eliminarFitxer(filePath, context) {
  try {
    await fs.promises.unlink(filePath);
  } catch (error) {
    if (error.code !== 'ENOENT') {
      console.error(`${context}:`, error.message);
    }
  }
}

function obtenirFitxerImatge(imatge) {
  const prefix = '/uploads/questions/';
  if (typeof imatge !== 'string' || !imatge.startsWith(prefix)) return null;

  const filename = imatge.slice(prefix.length);
  if (!filename || path.basename(filename) !== filename) return null;
  return path.join(uploadDirectory, filename);
}

async function eliminarPujada(file) {
  if (file) await eliminarFitxer(file.path, 'No s’ha pogut eliminar la imatge pujada');
}

async function eliminarImatgeDesada(imatge) {
  const filePath = obtenirFitxerImatge(imatge);
  if (filePath) await eliminarFitxer(filePath, 'No s’ha pogut eliminar la imatge de la pregunta');
}

function validarPregunta(body = {}, uploadedFile, existingImage = null) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) body = {};
  const pregunta = typeof body.pregunta === 'string' ? body.pregunta.trim() : '';
  let rawOptions = body.opcions;
  if (typeof rawOptions === 'string') {
    try {
      rawOptions = JSON.parse(rawOptions);
    } catch {
      rawOptions = null;
    }
  }
  const opcions = Array.isArray(rawOptions)
    ? rawOptions.map(opcio => typeof opcio === 'string' ? opcio.trim() : '')
    : [];
  const respostaCorrecta = typeof body.resposta_correcta === 'string'
    ? body.resposta_correcta.trim()
    : '';
  const imatge = uploadedFile
    ? `/uploads/questions/${uploadedFile.filename}`
    : body.remove_image === 'true' || body.remove_image === true
      ? null
      : Object.hasOwn(body, 'imatge')
        ? body.imatge || null
        : existingImage;

  if (!pregunta || Buffer.byteLength(pregunta, 'utf8') > 65535 ||
      opcions.length < 2 || opcions.length > 255 || new Set(opcions).size !== opcions.length ||
      opcions.some(opcio => Buffer.byteLength(opcio, 'utf8') > 500) ||
      opcions.some(opcio => !opcio) ||
      !respostaCorrecta || !opcions.includes(respostaCorrecta) ||
      (imatge !== null && typeof imatge !== 'string')) {
    return null;
  }

  return { pregunta, opcions, respostaCorrecta, imatge };
}

async function obtenirPreguntes(id) {
  const sql = `
    SELECT p.id, p.pregunta, p.imatge, o.text_opcio, o.es_correcta
    FROM preguntes p
    LEFT JOIN opcions o ON o.pregunta_id = p.id
    ${id === undefined ? '' : 'WHERE p.id = ?'}
    ORDER BY p.id, o.posicio
  `;
  const [files] = id === undefined
    ? await database.query(sql)
    : await database.execute(sql, [id]);
  const preguntesPerId = new Map();

  for (const fila of files) {
    if (!preguntesPerId.has(fila.id)) {
      preguntesPerId.set(fila.id, {
        id: fila.id,
        pregunta: fila.pregunta,
        imatge: fila.imatge,
        opcions: [],
        resposta_correcta: null
      });
    }
    if (fila.text_opcio !== null) {
      const pregunta = preguntesPerId.get(fila.id);
      pregunta.opcions.push(fila.text_opcio);
      if (fila.es_correcta) pregunta.resposta_correcta = fila.text_opcio;
    }
  }

  return [...preguntesPerId.values()];
}

async function inserirOpcions(connection, preguntaId, pregunta) {
  const values = pregunta.opcions.map((opcio, index) => [
    preguntaId,
    index + 1,
    opcio,
    opcio === pregunta.respostaCorrecta
  ]);
  const placeholders = values.map(() => '(?, ?, ?, ?)').join(', ');
  await connection.execute(
    `INSERT INTO opcions (pregunta_id, posicio, text_opcio, es_correcta)
     VALUES ${placeholders}`,
    values.flat()
  );
}

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/api/preguntes', async (req, res) => {
  res.json(await obtenirPreguntes());
});

app.get('/api/preguntes/:id', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id < 1) {
    return res.status(400).json({ error: 'L identificador no és vàlid.' });
  }

  const [pregunta] = await obtenirPreguntes(id);
  if (!pregunta) return res.status(404).json({ error: 'Pregunta no trobada.' });
  res.json(pregunta);
});

app.post('/api/preguntes', processarPujada, async (req, res) => {
  const pregunta = validarPregunta(req.body, req.file);
  if (!pregunta) {
    await eliminarPujada(req.file);
    return res.status(400).json({
      error: 'Cal indicar pregunta, opcions i una resposta_correcta inclosa a opcions.'
    });
  }

  let connection;
  let committed = false;
  try {
    connection = await database.getConnection();
    await connection.beginTransaction();
    const [result] = await connection.execute(
      'INSERT INTO preguntes (pregunta, imatge) VALUES (?, ?)',
      [pregunta.pregunta, pregunta.imatge]
    );
    await inserirOpcions(connection, result.insertId, pregunta);
    await connection.commit();
    committed = true;
    const [creada] = await obtenirPreguntes(result.insertId);
    res.status(201).json(creada);
  } catch (error) {
    if (connection && !committed) await connection.rollback();
    if (!committed) await eliminarPujada(req.file);
    throw error;
  } finally {
    if (connection) connection.release();
  }
});

app.put('/api/preguntes/:id', processarPujada, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id < 1) {
    await eliminarPujada(req.file);
    return res.status(400).json({ error: 'L identificador no és vàlid.' });
  }

  let connection;
  let committed = false;
  try {
    connection = await database.getConnection();
    await connection.beginTransaction();
    const [existing] = await connection.execute(
      'SELECT imatge FROM preguntes WHERE id = ? FOR UPDATE',
      [id]
    );
    if (existing.length === 0) {
      await connection.rollback();
      await eliminarPujada(req.file);
      return res.status(404).json({ error: 'Pregunta no trobada.' });
    }

    const pregunta = validarPregunta(req.body, req.file, existing[0].imatge);
    if (!pregunta) {
      await connection.rollback();
      await eliminarPujada(req.file);
      return res.status(400).json({
        error: 'Cal indicar pregunta, opcions i una resposta_correcta inclosa a opcions.'
      });
    }

    await connection.execute(
      'UPDATE preguntes SET pregunta = ?, imatge = ? WHERE id = ?',
      [pregunta.pregunta, pregunta.imatge, id]
    );
    await connection.execute('DELETE FROM opcions WHERE pregunta_id = ?', [id]);
    await inserirOpcions(connection, id, pregunta);
    await connection.commit();
    committed = true;
    if (existing[0].imatge !== pregunta.imatge) {
      await eliminarImatgeDesada(existing[0].imatge);
    }
    const [actualitzada] = await obtenirPreguntes(id);
    res.json(actualitzada);
  } catch (error) {
    if (connection && !committed) await connection.rollback();
    if (!committed) await eliminarPujada(req.file);
    throw error;
  } finally {
    if (connection) connection.release();
  }
});

app.delete('/api/preguntes/:id', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id < 1) {
    return res.status(400).json({ error: 'L identificador no és vàlid.' });
  }

  let connection;
  let imatgeEliminada;
  let committed = false;
  try {
    connection = await database.getConnection();
    await connection.beginTransaction();
    const [existing] = await connection.execute(
      'SELECT imatge FROM preguntes WHERE id = ? FOR UPDATE',
      [id]
    );
    if (existing.length === 0) {
      await connection.rollback();
      return res.status(404).json({ error: 'Pregunta no trobada.' });
    }

    const [result] = await connection.execute('DELETE FROM preguntes WHERE id = ?', [id]);
    if (result.affectedRows === 0) {
      await connection.rollback();
      return res.status(404).json({ error: 'Pregunta no trobada.' });
    }
    imatgeEliminada = existing[0].imatge;
    await connection.commit();
    committed = true;
  } catch (error) {
    if (connection && !committed) await connection.rollback();
    throw error;
  } finally {
    if (connection) connection.release();
  }

  await eliminarImatgeDesada(imatgeEliminada);
  res.status(204).end();
});

app.get('/preguntes', async (req, res) => {
  //Genera la partida
  const sessionId = uuidv4();
  console.log(`Partida Iniciada ID de la sessió: ${sessionId}`);

  //Barajar las preguntas
  const totesLesPreguntes = await obtenirPreguntes();
  const preguntesMezclades = [...totesLesPreguntes].sort(() => Math.random() - 0.5);
  
  //Se seleccionan 10 preguntas
  const preguntesSeleccionades = preguntesMezclades.slice(0, 10);

  //Usamos .map() para recorrer el array y quedarnos solo el id de las 10 preguntas.
  const idsSeleccionats = preguntesSeleccionades.map(p => p.id);

  //Guardem la sessió al map
  sessions.set(sessionId, {
    questions: idsSeleccionats
  });

  // Mostramos por consola que se ha guardado correctamente
  if (sessions.has(sessionId)) {
    console.log("Sessió guardada correctament al servidor:", sessions.get(sessionId));
  }

  //Por seguridad filtraremos las preguntas para que solo se envien los campos permitidos
  const clientQuestions = preguntesSeleccionades.map(q => ({
    id: q.id,
    pregunta: q.pregunta,
    opcions: q.opcions,
    imatge: q.imatge
  }));

  //Se envian las preguntas y la ID de la sesion
  res.json({
    sessionId: sessionId,
    questions: clientQuestions  
  });
});

app.get('/respostes', async (req, res) => {
  const preguntes = await obtenirPreguntes();
  const solucions = preguntes
    .filter(pregunta => pregunta.resposta_correcta !== null)
    .map(({ id, resposta_correcta }) => ({ id, resposta_correcta }));
  res.json({ solucions_servidor: solucions });
});

app.use((error, req, res, next) => {
  console.error('Error en la petició:', error);
  if (res.headersSent) return next(error);
  if (error.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'El cos JSON de la petició no és vàlid.' });
  }
  res.status(500).json({ error: 'S’ha produït un error intern del servidor.' });
});

database.query('SELECT 1')
  .then(() => {
    app.listen(port, () => {
      console.log(`Servidor funcionant al port ${port}`);
    });
  })
  .catch(error => {
    console.error('No s’ha pogut connectar a MySQL:', error.message);
    process.exitCode = 1;
  });