-- ============================================================
-- ICAP Platform (English) — Seed Data
-- Creates database and inserts 4 English learning tasks
-- ============================================================

CREATE DATABASE IF NOT EXISTS icap_platform_english DEFAULT CHARSET utf8mb4;
USE icap_platform_english;

-- Tables
CREATE TABLE IF NOT EXISTS users (
  id VARCHAR(50) PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  grade VARCHAR(20),
  prior_experience VARCHAR(50),
  role VARCHAR(20) DEFAULT 'student',
  student_group VARCHAR(20) DEFAULT NULL,
  password_hash VARCHAR(200) DEFAULT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS tasks (
  id INT AUTO_INCREMENT PRIMARY KEY,
  title VARCHAR(200) NOT NULL,
  description TEXT,
  sort_order INT NOT NULL DEFAULT 0,
  content_json JSON,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS system_config (
  `key` VARCHAR(100) PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- -----------------------------------------------------------
-- Task 1: Simple if-else — Checking a score (pass / fail)
-- -----------------------------------------------------------
INSERT INTO tasks (title, description, sort_order, content_json) VALUES (
  'Task 1: Checking a Score',
  'Learn if-else conditional statements by checking whether a score is a pass or fail.',
  1,
  '{
    "p_stage": {
      "subtasks": [
        {
          "id": 1,
          "title": "Create a Variable",
          "blocks": [
            {
              "block_id": "variables_set",
              "block_type": "variable assignment",
              "python_code": "score = 85",
              "explanation": "Create a variable called score and store 85 in it. A variable is like a label you attach to a value so you can use it later.",
              "color": "orange"
            }
          ]
        },
        {
          "id": 2,
          "title": "Conditional Check",
          "blocks": [
            {
              "block_id": "controls_if",
              "block_type": "if-else statement",
              "python_code": "if score >= 60:\\n    print(''Pass'')\\nelse:\\n    print(''Fail'')",
              "explanation": "if is followed by a condition. If the condition is true, the code inside if runs. Otherwise, the code inside else runs. Don''t forget the colon and indentation!",
              "color": "blue"
            },
            {
              "block_id": "logic_compare",
              "block_type": "comparison operator",
              "python_code": "score >= 60",
              "explanation": ">= means greater than or equal to. The result of a comparison is either True or False.",
              "color": "orange"
            }
          ]
        },
        {
          "id": 3,
          "title": "Output the Result",
          "blocks": [
            {
              "block_id": "text_print",
              "block_type": "print output",
              "python_code": "print(''Pass'')",
              "explanation": "The print() function displays whatever is inside the parentheses on the screen. Text must be wrapped in quotation marks.",
              "color": "green"
            }
          ]
        }
      ]
    },
    "a_stage": {
      "python_code": "score = 85\\nif score >= 60:\\n    print(\\"Pass\\")\\nelse:\\n    print(\\"Fail\\")",
      "expected_blocks": "controls_if+logic_compare+variables_set+text_print"
    },
    "c_stage": {
      "title": "Check if Adult",
      "description": "Write a program that checks if a person is an adult (age >= 18).",
      "block_image": "if_age_block.svg",
      "code_skeleton": "age = ___\\nif ___:\\n    print(___)\\nelse:\\n    print(___)",
      "expected_output": "Adult"
    },
    "i_stage": {
      "summary_points": [
        "if-else lets you run different code depending on whether a condition is true or false",
        "Comparison operators (>=, >, <, <=, ==) return True or False",
        "Python uses indentation to define code blocks",
        "print() displays output on the screen"
      ],
      "question_prompts": [
        "What happens if you change the condition to score > 60 when the score is exactly 60?",
        "If two grade levels (pass/fail) aren''t enough, how would you create four levels like A/B/C/D?"
      ]
    }
  }'
);

-- -----------------------------------------------------------
-- Task 2: For loop — Repeating patterns
-- -----------------------------------------------------------
INSERT INTO tasks (title, description, sort_order, content_json) VALUES (
  'Task 2: Repeating Patterns',
  'Learn for loops to make the computer repeat the same action multiple times.',
  2,
  '{
    "p_stage": {
      "subtasks": [
        {
          "id": 1,
          "title": "For Loop Structure",
          "blocks": [
            {
              "block_id": "controls_repeat_ext",
              "block_type": "for loop",
              "python_code": "for i in range(5):\\n    print(''-'')",
              "explanation": "for i in range(5) means repeat 5 times. i counts from 0 to 4, and the indented code runs once each iteration.",
              "color": "blue"
            },
            {
              "block_id": "math_number",
              "block_type": "number",
              "python_code": "5",
              "explanation": "The 5 inside range(5) sets how many times the loop runs. Change it to range(10) to loop 10 times.",
              "color": "orange"
            }
          ]
        },
        {
          "id": 2,
          "title": "Print Inside a Loop",
          "blocks": [
            {
              "block_id": "text_print",
              "block_type": "print output",
              "python_code": "print(''-'')",
              "explanation": "This print is inside the loop (it is indented), so it runs 5 times. Five dashes appear on the screen.",
              "color": "green"
            }
          ]
        }
      ]
    },
    "a_stage": {
      "python_code": "for i in range(5):\\n    print(\\"-\\")",
      "expected_blocks": "controls_repeat_ext+text_print"
    },
    "c_stage": {
      "title": "Draw a Square",
      "description": "Use a loop to draw a 4x4 square (4 asterisks per row, 4 rows).",
      "block_image": "square_block.svg",
      "code_skeleton": "for i in range(___):\\n    print(___)",
      "expected_output": "****\\n****\\n****\\n****"
    },
    "i_stage": {
      "summary_points": [
        "A for loop makes the computer repeat code multiple times",
        "range(n) produces the sequence 0 to n-1, so the loop runs n times",
        "Indentation determines which code belongs inside the loop body",
        "print() automatically adds a newline after each call"
      ],
      "question_prompts": [
        "range(5) loops 5 times, but i goes from 0 to 4 instead of 1 to 5. Why?",
        "If you wanted to draw a filled triangle instead of a square, how would you change the loop?"
      ]
    }
  }'
);

-- -----------------------------------------------------------
-- Task 3: Input and variables — Getting user input
-- -----------------------------------------------------------
INSERT INTO tasks (title, description, sort_order, content_json) VALUES (
  'Task 3: Input and Variables',
  'Learn to use input() to get user input, store it in a variable, and use it in your program.',
  3,
  '{
    "p_stage": {
      "subtasks": [
        {
          "id": 1,
          "title": "Get Input",
          "blocks": [
            {
              "block_id": "sensing_ask",
              "block_type": "input",
              "python_code": "name = input(''Enter your name: '')",
              "explanation": "The input() function pauses the program and waits for the user to type something. The text inside the parentheses is the prompt message. Whatever the user types gets stored in the name variable.",
              "color": "green"
            }
          ]
        },
        {
          "id": 2,
          "title": "Store in a Variable",
          "blocks": [
            {
              "block_id": "variables_set",
              "block_type": "variable assignment",
              "python_code": "name = ...",
              "explanation": "name is the variable name. Whatever is on the right side of = (the result of input()) gets stored in name. Pick meaningful variable names!",
              "color": "orange"
            }
          ]
        },
        {
          "id": 3,
          "title": "Join and Output",
          "blocks": [
            {
              "block_id": "text_join",
              "block_type": "string concatenation",
              "python_code": "print(''Hello, '' + name)",
              "explanation": "Use the + symbol to join (concatenate) pieces of text together.",
              "color": "purple"
            }
          ]
        }
      ]
    },
    "a_stage": {
      "python_code": "name = input(\\"Enter your name: \\")\\nprint(\\"Hello, \\" + name)",
      "expected_blocks": "variables_set+text_print+text_join"
    },
    "c_stage": {
      "title": "Age Check from Input",
      "description": "Ask the user for their age, then output Adult if age >= 18, otherwise output Minor.",
      "block_image": "age_input_block.svg",
      "code_skeleton": "age = int(input(___))\\nif ___:\\n    print(___)\\nelse:\\n    print(___)",
      "expected_output": "Adult"
    },
    "i_stage": {
      "summary_points": [
        "input() lets your program receive user input — it always returns a string",
        "int() converts a string into an integer",
        "Variables store data so you can reuse it later",
        "The + symbol can join (concatenate) strings together"
      ],
      "question_prompts": [
        "What happens if the user types letters (like abc) instead of a number when using int()?",
        "input() always returns a string. How would you get a decimal number from the user?"
      ]
    }
  }'
);

-- -----------------------------------------------------------
-- Task 4: Combining concepts — Even/Odd with modulo
-- -----------------------------------------------------------
INSERT INTO tasks (title, description, sort_order, content_json) VALUES (
  'Task 4: Even or Odd',
  'Combine for loops, if statements, and the modulo operator to classify numbers as even or odd.',
  4,
  '{
    "p_stage": {
      "subtasks": [
        {
          "id": 1,
          "title": "The Modulo Operator",
          "blocks": [
            {
              "block_id": "math_modulo",
              "block_type": "modulo operator",
              "python_code": "number % 2",
              "explanation": "The % symbol is the modulo operator. It gives the remainder after division. number % 2 equals 0 if the number is even, and 1 if it is odd.",
              "color": "orange"
            }
          ]
        },
        {
          "id": 2,
          "title": "Loop Through a List",
          "blocks": [
            {
              "block_id": "controls_repeat_ext",
              "block_type": "for loop",
              "python_code": "numbers = [1, 2, 3, 4, 5]\\nfor num in numbers:",
              "explanation": "A list holds multiple values inside square brackets. A for loop can iterate over each item in the list one at a time.",
              "color": "blue"
            }
          ]
        },
        {
          "id": 3,
          "title": "Check Even or Odd",
          "blocks": [
            {
              "block_id": "controls_if",
              "block_type": "if-else statement",
              "python_code": "if num % 2 == 0:\\n    print(num, ''is even'')\\nelse:\\n    print(num, ''is odd'')",
              "explanation": "Inside the loop, we check each number. num % 2 == 0 means the number is even. Otherwise, it is odd. The loop runs once for every item in the list.",
              "color": "blue"
            },
            {
              "block_id": "text_print",
              "block_type": "print output",
              "python_code": "print(num, ''is even'')",
              "explanation": "print() can display multiple things by separating them with a comma. Here it prints the number and a label.",
              "color": "green"
            }
          ]
        }
      ]
    },
    "a_stage": {
      "python_code": "numbers = [1, 2, 3, 4, 5]\\nfor num in numbers:\\n    if num % 2 == 0:\\n        print(num, \\"is even\\")\\n    else:\\n        print(num, \\"is odd\\")",
      "expected_blocks": "controls_repeat_ext+controls_if+math_modulo+text_print"
    },
    "c_stage": {
      "title": "Count the Even Numbers",
      "description": "Given a list of numbers [3, 8, 5, 12, 7, 6, 10], write a program that counts how many are even. Print the final count.",
      "block_image": "count_even_block.svg",
      "code_skeleton": "numbers = [3, 8, 5, 12, 7, 6, 10]\\ncount = 0\\nfor num in numbers:\\n    if ___ % ___ == 0:\\n        ___ = ___ + 1\\nprint(\\"even numbers:\\", count)",
      "expected_output": "even numbers: 4"
    },
    "i_stage": {
      "summary_points": [
        "The modulo operator % gives the remainder of a division",
        "A number is even if number % 2 == 0 (no remainder)",
        "You can combine for loops with if statements to make decisions on each item",
        "A counter variable can keep track of how many items match a condition"
      ],
      "question_prompts": [
        "What would number % 3 == 0 check for? Can you think of a real-world use for %?",
        "How would you modify the program to also count how many numbers are odd?"
      ]
    }
  }'
);
