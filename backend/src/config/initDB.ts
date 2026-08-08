import pool from "./database";
import { CURRICULUM_VERSION, curriculumTasks } from "../tasks/curriculum";

async function ensureColumn(
  connection: Awaited<ReturnType<typeof pool.getConnection>>,
  table: string,
  column: string,
  definition: string
) {
  const [rows] = await connection.query<any[]>(
    `SELECT COUNT(*) AS count
     FROM information_schema.columns
     WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ?`,
    [table, column]
  );
  if (Number(rows[0]?.count || 0) === 0) {
    await connection.query(`ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${definition}`);
  }
}

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
        id INT PRIMARY KEY,
        title VARCHAR(200) NOT NULL,
        description TEXT,
        sort_order INT NOT NULL DEFAULT 0,
        content_json JSON,
        version VARCHAR(50) NOT NULL DEFAULT '${CURRICULUM_VERSION}',
        suggested_lessons TINYINT NOT NULL DEFAULT 1,
        source_key VARCHAR(80) NOT NULL DEFAULT '',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    await connection.query(`
      CREATE TABLE IF NOT EXISTS sessions (
        id VARCHAR(50) PRIMARY KEY,
        user_id VARCHAR(50) NOT NULL,
        role VARCHAR(20) NOT NULL,
        name VARCHAR(100) NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        expires_at DATETIME NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        INDEX idx_session_expiry (expires_at),
        INDEX idx_session_user (user_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    await ensureColumn(connection, "tasks", "version", `VARCHAR(50) NOT NULL DEFAULT '${CURRICULUM_VERSION}'`);
    await ensureColumn(connection, "tasks", "suggested_lessons", "TINYINT NOT NULL DEFAULT 1");
    await ensureColumn(connection, "tasks", "source_key", "VARCHAR(80) NOT NULL DEFAULT ''");
    await ensureColumn(
      connection,
      "tasks",
      "updated_at",
      "DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP"
    );

    await connection.query(`
      CREATE TABLE IF NOT EXISTS user_actions (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        user_id VARCHAR(50) NOT NULL,
        session_id VARCHAR(50) NOT NULL,
        task_id INT,
        stage VARCHAR(10),
        action_type VARCHAR(50) NOT NULL,
        action_detail JSON,
        prompt_version VARCHAR(80),
        timestamp DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
        duration_ms INT DEFAULT 0,
        FOREIGN KEY (user_id) REFERENCES users(id),
        INDEX idx_user_session (user_id, session_id),
        INDEX idx_task_stage (task_id, stage),
        INDEX idx_action_time (action_type, timestamp)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    await ensureColumn(connection, "user_actions", "prompt_version", "VARCHAR(80) NULL");
    await ensureColumn(connection, "user_actions", "event_id", "VARCHAR(50) NULL");
    const [eventIndexRows] = await connection.query<any[]>(
      `SELECT COUNT(*) AS count
       FROM information_schema.statistics
       WHERE table_schema = DATABASE()
         AND table_name = 'user_actions'
         AND index_name = 'uniq_action_event'`
    );
    if (Number(eventIndexRows[0]?.count || 0) === 0) {
      await connection.query(
        "CREATE UNIQUE INDEX uniq_action_event ON user_actions (event_id)"
      );
    }

    await connection.query(`
      CREATE TABLE IF NOT EXISTS chat_messages (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        user_id VARCHAR(50) NOT NULL,
        session_id VARCHAR(50) NOT NULL,
        task_id INT NOT NULL,
        stage VARCHAR(10) NOT NULL,
        role ENUM('user','assistant') NOT NULL,
        content TEXT NOT NULL,
        message_type VARCHAR(30) NOT NULL DEFAULT 'dialogue',
        prompt_version VARCHAR(80),
        request_id VARCHAR(50),
        artifact_token VARCHAR(80),
        created_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
        FOREIGN KEY (user_id) REFERENCES users(id),
        FOREIGN KEY (task_id) REFERENCES tasks(id),
        INDEX idx_chat_student_task (user_id, task_id, stage, created_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    await ensureColumn(connection, "chat_messages", "request_id", "VARCHAR(50) NULL");
    await ensureColumn(connection, "chat_messages", "artifact_token", "VARCHAR(80) NULL");
    const [chatRequestIndexRows] = await connection.query<any[]>(
      `SELECT COUNT(*) AS count
       FROM information_schema.statistics
       WHERE table_schema = DATABASE()
         AND table_name = 'chat_messages'
         AND index_name = 'uniq_chat_request_role'`
    );
    if (Number(chatRequestIndexRows[0]?.count || 0) === 0) {
      await connection.query(
        "CREATE UNIQUE INDEX uniq_chat_request_role ON chat_messages (user_id, request_id, role)"
      );
    }

    await connection.query(`
      CREATE TABLE IF NOT EXISTS artifact_snapshots (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        snapshot_id VARCHAR(50) NOT NULL,
        user_id VARCHAR(50) NOT NULL,
        session_id VARCHAR(50) NOT NULL,
        task_id INT NOT NULL,
        stage VARCHAR(10) NOT NULL,
        artifact_type ENUM('blockly','python') NOT NULL,
        artifact_version INT NOT NULL,
        content_hash CHAR(64) NOT NULL,
        content MEDIUMTEXT NOT NULL,
        generated_code MEDIUMTEXT,
        semantic_features JSON,
        diagnostics JSON,
        source_action VARCHAR(50) NOT NULL DEFAULT 'stable_edit',
        created_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
        FOREIGN KEY (user_id) REFERENCES users(id),
        FOREIGN KEY (task_id) REFERENCES tasks(id),
        UNIQUE KEY uniq_snapshot_id (snapshot_id),
        INDEX idx_artifact_hash (user_id, task_id, stage, artifact_type, content_hash),
        INDEX idx_artifact_latest (user_id, task_id, stage, artifact_version)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    const [artifactHashIndexRows] = await connection.query<any[]>(
      `SELECT INDEX_NAME AS index_name, NON_UNIQUE AS non_unique
       FROM information_schema.statistics
       WHERE table_schema = DATABASE()
         AND table_name = 'artifact_snapshots'
         AND index_name IN ('uniq_artifact_hash', 'idx_artifact_hash')`
    );
    if (artifactHashIndexRows.some((row) => row.index_name === "uniq_artifact_hash")) {
      await connection.query("ALTER TABLE artifact_snapshots DROP INDEX uniq_artifact_hash");
    }
    if (!artifactHashIndexRows.some((row) => row.index_name === "idx_artifact_hash")) {
      await connection.query(
        "CREATE INDEX idx_artifact_hash ON artifact_snapshots (user_id, task_id, stage, artifact_type, content_hash)"
      );
    }

    await connection.query(`
      CREATE TABLE IF NOT EXISTS learner_states (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        user_id VARCHAR(50) NOT NULL,
        knowledge_component VARCHAR(80) NOT NULL,
        state ENUM('not_observed','needs_support','emerging','stable') NOT NULL DEFAULT 'not_observed',
        success_count INT NOT NULL DEFAULT 0,
        error_count INT NOT NULL DEFAULT 0,
        independent_success_count INT NOT NULL DEFAULT 0,
        last_evidence_id VARCHAR(50),
        last_task_id INT,
        last_stage VARCHAR(10),
        last_diagnosis VARCHAR(80),
        evidence_json JSON,
        updated_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        UNIQUE KEY uniq_student_knowledge (user_id, knowledge_component),
        INDEX idx_learner_state (user_id, state, updated_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    await connection.query(`
      CREATE TABLE IF NOT EXISTS agent_interventions (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        intervention_id VARCHAR(50) NOT NULL,
        user_id VARCHAR(50) NOT NULL,
        session_id VARCHAR(50) NOT NULL,
        task_id INT NOT NULL,
        stage VARCHAR(10) NOT NULL,
        trigger_type VARCHAR(50) NOT NULL,
        diagnosis_code VARCHAR(80) NOT NULL,
        support_level TINYINT NOT NULL DEFAULT 1,
        artifact_version INT NOT NULL DEFAULT 0,
        evidence_json JSON,
        message TEXT,
        question TEXT,
        block_id VARCHAR(100),
        code_line INT,
        prompt_version VARCHAR(80),
        outcome ENUM('pending','adopted','partially_adopted','ignored','not_observed') NOT NULL DEFAULT 'pending',
        followup_edits INT NOT NULL DEFAULT 0,
        created_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
        resolved_at DATETIME(3),
        FOREIGN KEY (user_id) REFERENCES users(id),
        FOREIGN KEY (task_id) REFERENCES tasks(id),
        UNIQUE KEY uniq_intervention_id (intervention_id),
        INDEX idx_intervention_student (user_id, task_id, stage, created_at),
        INDEX idx_intervention_outcome (user_id, outcome, created_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    await connection.query(`
      CREATE TABLE IF NOT EXISTS operation_requests (
        user_id VARCHAR(50) NOT NULL,
        operation_type VARCHAR(20) NOT NULL,
        operation_id VARCHAR(80) NOT NULL,
        status ENUM('processing','completed') NOT NULL DEFAULT 'processing',
        status_code INT DEFAULT 200,
        response_json JSON,
        created_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
        updated_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        PRIMARY KEY (user_id, operation_type, operation_id),
        INDEX idx_operation_updated (updated_at),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    await connection.query(`
      CREATE TABLE IF NOT EXISTS student_task_states (
        user_id VARCHAR(50) NOT NULL,
        task_id INT NOT NULL,
        last_stage ENUM('P','A','C','I') NOT NULL DEFAULT 'P',
        a_completed_at DATETIME(3) NULL,
        c_completed_at DATETIME(3) NULL,
        a_reference_hidden TINYINT(1) NOT NULL DEFAULT 0,
        a_snapshot_id VARCHAR(50) NULL,
        c_snapshot_id VARCHAR(50) NULL,
        i_snapshot_id VARCHAR(50) NULL,
        history_initialized TINYINT(1) NOT NULL DEFAULT 0,
        created_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
        updated_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        PRIMARY KEY (user_id, task_id),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
        INDEX idx_student_task_updated (user_id, updated_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    await connection.query(`
      CREATE TABLE IF NOT EXISTS teacher_evidence_reports (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        report_id VARCHAR(50) NOT NULL,
        student_id VARCHAR(50) NOT NULL,
        task_id INT NOT NULL,
        evidence_hash CHAR(64) NOT NULL,
        evidence_updated_at DATETIME(3) NULL,
        report_json JSON NOT NULL,
        model_name VARCHAR(80) NULL,
        prompt_version VARCHAR(80) NULL,
        created_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
        FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
        UNIQUE KEY uniq_teacher_report_id (report_id),
        INDEX idx_teacher_report_latest (student_id, task_id, created_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    await connection.query(`
      CREATE TABLE IF NOT EXISTS learning_summaries (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        summary_id VARCHAR(50) NOT NULL,
        user_id VARCHAR(50) NOT NULL,
        scope ENUM('stage','task','course') NOT NULL,
        summary_key VARCHAR(80) NOT NULL,
        task_id INT NULL,
        stage ENUM('P','A','C','I') NULL,
        version INT NOT NULL DEFAULT 1,
        evidence_hash CHAR(64) NOT NULL,
        evidence_json JSON NOT NULL,
        summary_json JSON NOT NULL,
        model_name VARCHAR(80) NULL,
        prompt_version VARCHAR(80) NOT NULL,
        is_stale TINYINT(1) NOT NULL DEFAULT 0,
        created_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
        UNIQUE KEY uniq_learning_summary_id (summary_id),
        UNIQUE KEY uniq_learning_summary_version (user_id, summary_key, version),
        INDEX idx_learning_summary_latest (user_id, scope, task_id, stage, is_stale, created_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    await connection.query(`
      CREATE TABLE IF NOT EXISTS i_dialogue_states (
        user_id VARCHAR(50) NOT NULL,
        task_id INT NOT NULL,
        phase ENUM('review','explain','challenge','revise','reflect','summary') NOT NULL DEFAULT 'review',
        focus_json JSON NOT NULL,
        discussed_json JSON NOT NULL,
        resolved_json JSON NOT NULL,
        student_decisions_json JSON NOT NULL,
        current_question TEXT NULL,
        current_question_key VARCHAR(120) NULL,
        latest_run_evidence_id VARCHAR(50) NULL,
        evidence_hash CHAR(64) NULL,
        turn_count INT NOT NULL DEFAULT 0,
        updated_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        PRIMARY KEY (user_id, task_id),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    await connection.query("DROP TABLE IF EXISTS user_progress");
    await connection.query("DROP TABLE IF EXISTS system_config");

    await connection.beginTransaction();
    try {
      for (const item of curriculumTasks) {
        await connection.query(
          `INSERT INTO tasks
            (id, title, description, sort_order, content_json, version, suggested_lessons, source_key)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE
             title = VALUES(title),
             description = VALUES(description),
             sort_order = VALUES(sort_order),
             content_json = VALUES(content_json),
             version = VALUES(version),
             suggested_lessons = VALUES(suggested_lessons),
             source_key = VALUES(source_key)`,
          [
            item.id,
            item.title,
            item.description,
            item.sort_order,
            JSON.stringify(item.content_json),
            item.version,
            item.suggested_lessons,
            `curriculum-task-${item.id}`,
          ]
        );
      }

      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    }

    console.log(
      `Database initialized with ${curriculumTasks.length} curriculum tasks (${CURRICULUM_VERSION}).`
    );
    await connection.query("DELETE FROM sessions WHERE expires_at <= NOW()");
  } catch (err) {
    console.error("Failed to init database:", err);
    throw err;
  } finally {
    connection.release();
  }
};

export default createTables;
