const fs = require('fs');
const createDatabasePool = require('./database');

const preguntes = require('./preguntes.json').preguntes_client;
const solucions = require('./respuestas.json').solucions_servidor;
const solucionsPerId = new Map(solucions.map(solucio => [solucio.id, solucio.resposta_correcta]));

const database = createDatabasePool(1);

async function migrate() {
  const connection = await database.getConnection();

  try {
    for (const pregunta of preguntes) {
      const respostaCorrecta = solucionsPerId.get(pregunta.id);
      if (!respostaCorrecta || !pregunta.opcions.includes(respostaCorrecta)) {
        throw new Error(`No s'ha trobat una resposta correcta vàlida per a la pregunta ${pregunta.id}`);
      }
    }

    await connection.beginTransaction();

    for (const pregunta of preguntes) {
      await connection.execute(
        `INSERT INTO preguntes (id, pregunta, imatge)
         VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE pregunta = VALUES(pregunta), imatge = VALUES(imatge)`,
        [pregunta.id, pregunta.pregunta, pregunta.imatge || null]
      );

      await connection.execute('DELETE FROM opcions WHERE pregunta_id = ?', [pregunta.id]);

      const valorsOpcions = pregunta.opcions.map((opcio, index) => [
        pregunta.id,
        index + 1,
        opcio,
        opcio === solucionsPerId.get(pregunta.id)
      ]);
      const placeholders = valorsOpcions.map(() => '(?, ?, ?, ?)').join(', ');
      await connection.execute(
        `INSERT INTO opcions (pregunta_id, posicio, text_opcio, es_correcta)
         VALUES ${placeholders}`,
        valorsOpcions.flat()
      );
    }

    await connection.commit();
    console.log(`Migrades ${preguntes.length} preguntes correctament.`);
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
    await database.end();
  }
}

migrate().catch(error => {
  console.error('Error durant la migració:', error.message);
  process.exitCode = 1;
});