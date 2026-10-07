const express = require('../backend/node_modules/express');
const multer = require('../backend/node_modules/multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const app = express();
const port = Number(process.env.PORT || process.argv[2]) || 40400;

const { v4: uuidv4 } = require('../backend/node_modules/uuid/dist-node/index.js');
const createDatabasePool = require('../backend/database');
const database = createDatabasePool(10);
const directorImatges = path.join(__dirname, 'imagenes', 'uploads');
fs.mkdirSync(directorImatges, { recursive: true });

const pujadorImatges = multer({
  storage: multer.diskStorage({
    destination: directorImatges,
    filename: (req, file, callback) => {
      const extensio = path.extname(file.originalname).toLowerCase();
      callback(null, `${crypto.randomUUID()}${extensio}`);
    }
  }),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter: (req, file, callback) => {
    const extensionsPerMime = {
      'image/jpeg': ['.jpg', '.jpeg'],
      'image/png': ['.png'],
      'image/webp': ['.webp']
    };
    const extensions = extensionsPerMime[file.mimetype];
    if (!extensions || !extensions.includes(path.extname(file.originalname).toLowerCase())) {
      return callback(new Error('La imatge ha de ser JPG, PNG o WebP.'));
    }
    callback(null, true);
  }
});

const sessions = new Map();

app.use(express.static(__dirname));
app.use(express.json());

function validarPregunta(body = {}) {
  const pregunta = typeof body.pregunta === 'string' ? body.pregunta.trim() : '';
  const opcions = Array.isArray(body.opcions)
    ? body.opcions.map(opcio => typeof opcio === 'string' ? opcio.trim() : '')
    : [];
  const respostaCorrecta = typeof body.resposta_correcta === 'string'
    ? body.resposta_correcta.trim()
    : '';
  const imatge = body.imatge == null ? null : body.imatge;

  if (!pregunta || opcions.length === 0 || new Set(opcions).size !== opcions.length ||
      opcions.some(opcio => !opcio) ||
      !respostaCorrecta || !opcions.includes(respostaCorrecta) ||
      (imatge !== null && typeof imatge !== 'string')) {
    return null;
  }

  return { pregunta, opcions, respostaCorrecta, imatge };
}

function obtenirCosPregunta(req) {
  if (typeof req.body.opcions !== 'string') return req.body;
  try {
    return { ...req.body, opcions: JSON.parse(req.body.opcions) };
  } catch {
    return {};
  }
}

async function imatgeEnviadaValida(file) {
  if (!file) return true;
  const contingut = await fs.promises.readFile(file.path);
  const esJpeg = contingut[0] === 0xff && contingut[1] === 0xd8 && contingut[2] === 0xff;
  const esPng = contingut.subarray(0, 8).equals(
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  );
  const esWebp = contingut.toString('ascii', 0, 4) === 'RIFF' &&
    contingut.toString('ascii', 8, 12) === 'WEBP';
  return esJpeg || esPng || esWebp;
}

function rutaImatgePujada(file) {
  return file ? `/imagenes/uploads/${file.filename}` : null;
}

async function eliminarImatgePujada(file) {
  if (file) await fs.promises.rm(file.path, { force: true });
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

app.post('/api/preguntes', pujadorImatges.single('imatge_file'), async (req, res) => {
  const cos = obtenirCosPregunta(req);
  const pregunta = validarPregunta({
    ...cos,
    imatge: rutaImatgePujada(req.file) || cos.imatge || null
  });
  if (!pregunta) {
    await eliminarImatgePujada(req.file);
    return res.status(400).json({
      error: 'Cal indicar pregunta, opcions i una resposta_correcta inclosa a opcions.'
    });
  }
  if (!(await imatgeEnviadaValida(req.file))) {
    await eliminarImatgePujada(req.file);
    return res.status(400).json({ error: 'El fitxer no és una imatge vàlida.' });
  }

  const connection = await database.getConnection();
  try {
    await connection.beginTransaction();
    const [result] = await connection.execute(
      'INSERT INTO preguntes (pregunta, imatge) VALUES (?, ?)',
      [pregunta.pregunta, pregunta.imatge]
    );
    await inserirOpcions(connection, result.insertId, pregunta);
    await connection.commit();
    const [creada] = await obtenirPreguntes(result.insertId);
    res.status(201).json(creada);
  } catch (error) {
    await connection.rollback();
    await eliminarImatgePujada(req.file);
    throw error;
  } finally {
    connection.release();
  }
});

app.put('/api/preguntes/:id', pujadorImatges.single('imatge_file'), async (req, res) => {
  const id = Number(req.params.id);
  const cos = obtenirCosPregunta(req);
  const pregunta = validarPregunta({
    ...cos,
    imatge: rutaImatgePujada(req.file) || cos.imatge || null
  });
  if (!Number.isSafeInteger(id) || id < 1) {
    await eliminarImatgePujada(req.file);
    return res.status(400).json({ error: 'L identificador no és vàlid.' });
  }
  if (!pregunta) {
    await eliminarImatgePujada(req.file);
    return res.status(400).json({
      error: 'Cal indicar pregunta, opcions i una resposta_correcta inclosa a opcions.'
    });
  }
  if (!(await imatgeEnviadaValida(req.file))) {
    await eliminarImatgePujada(req.file);
    return res.status(400).json({ error: 'El fitxer no és una imatge vàlida.' });
  }

  const connection = await database.getConnection();
  try {
    await connection.beginTransaction();
    const [existing] = await connection.execute(
      'SELECT id FROM preguntes WHERE id = ?',
      [id]
    );
    if (existing.length === 0) {
      await connection.rollback();
      await eliminarImatgePujada(req.file);
      return res.status(404).json({ error: 'Pregunta no trobada.' });
    }

    await connection.execute(
      'UPDATE preguntes SET pregunta = ?, imatge = ? WHERE id = ?',
      [pregunta.pregunta, pregunta.imatge, id]
    );
    await connection.execute('DELETE FROM opcions WHERE pregunta_id = ?', [id]);
    await inserirOpcions(connection, id, pregunta);
    await connection.commit();
    const [actualitzada] = await obtenirPreguntes(id);
    res.json(actualitzada);
  } catch (error) {
    await connection.rollback();
    await eliminarImatgePujada(req.file);
    throw error;
  } finally {
    connection.release();
  }
});

app.delete('/api/preguntes/:id', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id < 1) {
    return res.status(400).json({ error: 'L identificador no és vàlid.' });
  }

  const [result] = await database.execute('DELETE FROM preguntes WHERE id = ?', [id]);
  if (result.affectedRows === 0) {
    return res.status(404).json({ error: 'Pregunta no trobada.' });
  }
  res.status(204).end();
});

app.use((error, req, res, next) => {
  if (error instanceof multer.MulterError || error.message === 'La imatge ha de ser JPG, PNG o WebP.') {
    return res.status(400).json({ error: error.message });
  }
  next(error);
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