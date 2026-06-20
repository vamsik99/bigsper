# Schema Design — Keys and Referential Integrity

Schema design covers how tables are structured, how rows are uniquely identified, and how relationships between tables are enforced.

## Primary Keys

A primary key uniquely identifies each row in a table. It cannot be NULL and must be unique:

```sql
CREATE TABLE departments (
  dept_id   INTEGER PRIMARY KEY,
  name      TEXT NOT NULL,
  budget    NUMERIC
);
```

In SQLite, `INTEGER PRIMARY KEY` automatically becomes an alias for the internal rowid, which is auto-incremented if no value is inserted.

## Foreign Keys

A foreign key creates a link from one table to another's primary key:

```sql
CREATE TABLE employees (
  emp_id    INTEGER PRIMARY KEY,
  name      TEXT NOT NULL,
  dept_id   INTEGER REFERENCES departments(dept_id),
  salary    NUMERIC,
  hire_date TEXT
);
```

`dept_id` in employees references `dept_id` in departments. A foreign key enforces referential integrity — you cannot insert an emp row with a dept_id that does not exist in departments (when enforcement is enabled).

## Enabling Foreign Keys in SQLite

SQLite does not enforce foreign keys by default. Enable them per connection:

```sql
PRAGMA foreign_keys = ON;
```

Without this pragma, SQLite accepts any dept_id value without checking.

## ON DELETE and ON UPDATE Actions

These clauses define what happens when a referenced row is deleted or its key is updated:

```sql
dept_id INTEGER REFERENCES departments(dept_id)
  ON DELETE SET NULL
  ON UPDATE CASCADE
```

Actions:
- **CASCADE** — propagate the change to child rows (delete or update them too).
- **SET NULL** — set the foreign key column to NULL in child rows.
- **SET DEFAULT** — set to the column's default value.
- **RESTRICT** — prevent the parent row from being deleted/updated if children exist.
- **NO ACTION** (default) — same as RESTRICT but deferred until end of transaction in some databases.

## Composite Primary Keys

Some tables use multiple columns as the primary key:

```sql
CREATE TABLE employee_projects (
  emp_id     INTEGER REFERENCES employees(emp_id),
  project_id INTEGER REFERENCES projects(project_id),
  role       TEXT,
  PRIMARY KEY (emp_id, project_id)
);
```

This prevents the same employee from being assigned to the same project twice.

## Unique Constraints

UNIQUE ensures no two rows have the same value(s) in the specified column(s), but unlike PRIMARY KEY, allows NULLs (each NULL is considered distinct):

```sql
ALTER TABLE departments ADD CONSTRAINT uq_dept_name UNIQUE (name);
```

## NOT NULL Constraint

```sql
name TEXT NOT NULL
```

Prevents NULL values from being inserted in the column. This should be used on columns where a missing value would be meaningless (employee name, department name).

## Practical Example: Our Sample Schema

```sql
CREATE TABLE departments (
  dept_id INTEGER PRIMARY KEY,
  name    TEXT NOT NULL UNIQUE,
  budget  NUMERIC
);

CREATE TABLE employees (
  emp_id    INTEGER PRIMARY KEY,
  name      TEXT NOT NULL,
  dept_id   INTEGER REFERENCES departments(dept_id) ON DELETE SET NULL,
  salary    NUMERIC,
  hire_date TEXT
);
```

Key rules:
- Every table should have a primary key.
- Use FOREIGN KEY constraints and enable `PRAGMA foreign_keys = ON` in SQLite.
- Choose ON DELETE/UPDATE actions based on business rules (CASCADE for dependent data, SET NULL for optional relationships).
- NOT NULL on columns that should never be empty.
