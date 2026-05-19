import pool from "./database";

const createTables = async () => {
  const connection = await pool.getConnection();
  try {
    await connection.query(`
      CREATE TABLE IF NOT EXISTS users (
        id VARCHAR(50) PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        grade VARCHAR(20),
        prior_experience VARCHAR(50),
        role VARCHAR(20) DEFAULT 'student',
        student_group VARCHAR(20) DEFAULT NULL,
        password_hash VARCHAR(200) DEFAULT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    await connection.query(`
      CREATE TABLE IF NOT EXISTS tasks (
        id INT AUTO_INCREMENT PRIMARY KEY,
        title VARCHAR(200) NOT NULL,
        description TEXT,
        sort_order INT NOT NULL DEFAULT 0,
        content_json JSON,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    await connection.query(`
      CREATE TABLE IF NOT EXISTS user_progress (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id VARCHAR(50) NOT NULL,
        task_id INT NOT NULL,
        current_stage VARCHAR(10) DEFAULT 'P',
        status ENUM('not_started','in_progress','completed') DEFAULT 'not_started',
        started_at DATETIME,
        completed_at DATETIME,
        FOREIGN KEY (user_id) REFERENCES users(id),
        FOREIGN KEY (task_id) REFERENCES tasks(id),
        UNIQUE KEY uk_user_task (user_id, task_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    await connection.query(`
      CREATE TABLE IF NOT EXISTS user_actions (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id VARCHAR(50) NOT NULL,
        session_id VARCHAR(50) NOT NULL,
        task_id INT,
        stage VARCHAR(10),
        action_type VARCHAR(50) NOT NULL,
        action_detail JSON,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        duration_ms INT DEFAULT 0,
        FOREIGN KEY (user_id) REFERENCES users(id),
        INDEX idx_user_session (user_id, session_id),
        INDEX idx_task_stage (task_id, stage)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    await connection.query(`
      CREATE TABLE IF NOT EXISTS system_config (
        \`key\` VARCHAR(100) PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    console.log("Database tables initialized.");
  } catch (err) {
    console.error("Failed to init database:", err);
  } finally {
    connection.release();
  }
};

export default createTables;
