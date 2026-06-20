-- BigSper SQL sandbox — schema and seed data
-- Populate this file fully before the demo.

CREATE TABLE IF NOT EXISTS departments (
    id     INTEGER PRIMARY KEY,
    name   TEXT    NOT NULL,
    budget REAL
);

CREATE TABLE IF NOT EXISTS employees (
    id            INTEGER PRIMARY KEY,
    name          TEXT    NOT NULL,
    department_id INTEGER REFERENCES departments(id),
    salary        REAL,
    hire_date     TEXT    -- ISO-8601 (YYYY-MM-DD)
);

CREATE TABLE IF NOT EXISTS projects (
    id         INTEGER PRIMARY KEY,
    name       TEXT    NOT NULL,
    dept_id    INTEGER REFERENCES departments(id),
    start_date TEXT,
    end_date   TEXT,
    budget     REAL
);

CREATE TABLE IF NOT EXISTS employee_projects (
    employee_id INTEGER REFERENCES employees(id),
    project_id  INTEGER REFERENCES projects(id),
    role        TEXT,
    PRIMARY KEY (employee_id, project_id)
);

-- Seed data
INSERT OR IGNORE INTO departments VALUES
    (1, 'Engineering', 500000),
    (2, 'Marketing',   200000),
    (3, 'Sales',       300000);

INSERT OR IGNORE INTO employees VALUES
    (1, 'Alice',  1,    95000, '2020-03-01'),
    (2, 'Bob',    1,    88000, '2021-06-15'),
    (3, 'Carol',  2,    72000, '2019-11-20'),
    (4, 'David',  3,    65000, '2022-01-10'),
    (5, 'Eve',    1,   102000, '2018-07-04'),
    (6, 'Frank',  2,    68000, '2023-02-28'),
    (7, 'Grace',  3,    71000, '2021-09-01'),
    (8, 'Heidi',  NULL, 58000, '2023-05-15');

INSERT OR IGNORE INTO projects VALUES
    (1, 'Data Platform',   1, '2023-01-01', '2023-12-31', 150000),
    (2, 'Summer Campaign', 2, '2023-06-01', '2023-08-31',  40000),
    (3, 'CRM Rollout',     3, '2023-03-01', '2023-09-30',  80000);

INSERT OR IGNORE INTO employee_projects VALUES
    (1, 1, 'Lead'),
    (2, 1, 'Engineer'),
    (5, 1, 'Architect'),
    (3, 2, 'Manager'),
    (6, 2, 'Analyst'),
    (4, 3, 'Manager'),
    (7, 3, 'Engineer');
