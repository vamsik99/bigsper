# DML — INSERT, UPDATE, DELETE

Data Manipulation Language (DML) statements modify the data in tables. The three core DML statements are INSERT, UPDATE, and DELETE.

## INSERT

INSERT adds new rows to a table.

**Single row:**

```sql
INSERT INTO departments (name, budget)
VALUES ('Marketing', 90000);
```

The column list is optional if you supply values in the same order as the table definition, but specifying columns explicitly is safer and more readable.

**Multiple rows in one statement:**

```sql
INSERT INTO employees (name, dept_id, salary, hire_date)
VALUES
  ('Alice', 1, 75000, '2022-03-01'),
  ('Bob',   2, 68000, '2021-07-15');
```

**INSERT from a SELECT:**

```sql
INSERT INTO departments (name, budget)
SELECT 'Copy of ' || name, budget * 0.5
FROM departments
WHERE dept_id = 1;
```

## UPDATE

UPDATE modifies existing rows. Always include a WHERE clause unless you intend to update every row:

```sql
UPDATE employees
SET salary = salary * 1.10
WHERE dept_id = 1;
```

Multiple columns can be updated in one statement:

```sql
UPDATE employees
SET salary = 80000, dept_id = 2
WHERE emp_id = 5;
```

## DELETE

DELETE removes rows matching the WHERE condition. Without WHERE, all rows are deleted:

```sql
-- Remove one employee
DELETE FROM employees WHERE emp_id = 7;

-- Remove all employees from department 3
DELETE FROM employees WHERE dept_id = 3;

-- Danger: deletes every row
DELETE FROM employees;
```

## ON CONFLICT (UPSERT)

SQLite supports ON CONFLICT to handle constraint violations gracefully:

```sql
-- Insert or update (upsert) based on primary key
INSERT INTO employees (emp_id, name, salary)
VALUES (1, 'Alice Updated', 80000)
ON CONFLICT(emp_id) DO UPDATE SET
  name = excluded.name,
  salary = excluded.salary;
```

`excluded` refers to the values that would have been inserted. The same syntax is available in PostgreSQL.

Alternatives:
- `ON CONFLICT DO NOTHING` — silently skips the conflicting row.
- `INSERT OR REPLACE` (SQLite) — deletes the conflicting row and inserts the new one.

## RETURNING

Some databases (SQLite 3.35+, PostgreSQL) support a RETURNING clause to get back the affected rows:

```sql
INSERT INTO departments (name, budget)
VALUES ('Legal', 120000)
RETURNING dept_id, name;

DELETE FROM employees WHERE emp_id = 5
RETURNING name, salary;
```

This avoids a separate SELECT to discover auto-generated IDs.

## Referential Integrity

In our database, employees.dept_id references departments.dept_id. Without FOREIGN KEY enforcement (SQLite requires `PRAGMA foreign_keys = ON`), you can insert invalid dept_id values. With enforcement on, INSERT or UPDATE with a non-existent dept_id raises a constraint error, and DELETE of a department that has employees raises a foreign key violation.

Key rules:
- Always use WHERE in UPDATE and DELETE unless modifying the whole table.
- ON CONFLICT (UPSERT) prevents duplicate-key errors.
- RETURNING retrieves auto-generated values without a second query.
- Enable `PRAGMA foreign_keys = ON` in SQLite to enforce referential integrity.
