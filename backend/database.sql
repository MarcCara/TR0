CREATE TABLE IF NOT EXISTS preguntes (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  pregunta TEXT NOT NULL,
  imatge VARCHAR(2048),
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS opcions (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  pregunta_id INT UNSIGNED NOT NULL,
  posicio TINYINT UNSIGNED NOT NULL,
  text_opcio VARCHAR(500) NOT NULL,
  es_correcta BOOLEAN NOT NULL DEFAULT FALSE,
  PRIMARY KEY (id),
  UNIQUE KEY uq_opcions_pregunta_posicio (pregunta_id, posicio),
  CONSTRAINT fk_opcions_preguntes
    FOREIGN KEY (pregunta_id) REFERENCES preguntes (id)
    ON DELETE CASCADE,
  CONSTRAINT chk_opcions_posicio CHECK (posicio > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;