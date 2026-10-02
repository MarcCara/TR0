const mysql = require('mysql2/promise');

function createDatabasePool(connectionLimit) {
  const requiredVariables = ['DB_HOST', 'DB_USER', 'DB_PASSWORD', 'DB_NAME'];
  const missingVariables = requiredVariables.filter(variable => !process.env[variable]);

  if (missingVariables.length > 0) {
    throw new Error(`Falten variables de configuració de MySQL: ${missingVariables.join(', ')}`);
  }

  const port = Number(process.env.DB_PORT || 3306);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('DB_PORT ha de ser un port vàlid entre 1 i 65535.');
  }

  return mysql.createPool({
    host: process.env.DB_HOST,
    port,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit
  });
}

module.exports = createDatabasePool;
