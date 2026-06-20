# INNER JOIN

An INNER JOIN combines rows from two tables where a matching condition is true. Rows with no match in either table are excluded.

## Syntax

```sql
SELECT e.name, d.name AS department
FROM employees e
INNER JOIN departments d ON e.dept_id = d.dept_id;
```

The ON clause specifies the join condition. Here it matches the dept_id foreign key in employees to the primary key in departments.

INNER JOIN is the default — `JOIN` without a qualifier means INNER JOIN.

## Table Aliases

Table aliases (e, d above) shorten long table names and are required when both tables share a column name:

```sql
FROM employees AS e
INNER JOIN departments AS d ON e.dept_id = d.dept_id
```

The AS keyword is optional: `employees e` works too.

## What INNER JOIN Excludes

Heidi (emp_id = 7) has dept_id = NULL, so she matches no department row. She is excluded from an INNER JOIN result. Similarly, any department with no employees is excluded.

## Multi-Table Joins

Chain multiple JOINs to connect more than two tables:

```sql
SELECT e.name, d.name AS dept, p.name AS project
FROM employees e
INNER JOIN departments d ON e.dept_id = d.dept_id
INNER JOIN employee_projects ep ON e.emp_id = ep.emp_id
INNER JOIN projects p ON ep.project_id = p.project_id;
```

Each JOIN adds one table. The order matters for readability but not for the result in most cases — the query optimiser reorders joins for efficiency.

## Equi-Join Condition

The most common join condition is equality (equi-join). You can also join on expressions:

```sql
-- Non-equi join: employees whose salary exceeds department budget / headcount
FROM employees e
JOIN departments d ON e.dept_id = d.dept_id AND e.salary > d.budget / 10
```

## Selecting Columns

When columns exist in both tables (like dept_id here), qualify them to avoid ambiguity:

```sql
SELECT e.emp_id, e.name, d.dept_id, d.name AS dept_name
FROM employees e
INNER JOIN departments d ON e.dept_id = d.dept_id;
```

Without the e. and d. qualifiers, SQLite may raise "ambiguous column" errors.

## Practical Example

Using our sample database (departments: 3 rows, employees: 8 rows, one with NULL dept_id):

```sql
-- Show each employee with their department name
-- Heidi is excluded because her dept_id is NULL
SELECT e.name, d.name AS department, e.salary
FROM employees e
JOIN departments d ON e.dept_id = d.dept_id
ORDER BY d.name, e.name;
```

```sql
-- Count employees per department
SELECT d.name, COUNT(e.emp_id) AS headcount
FROM employees e
JOIN departments d ON e.dept_id = d.dept_id
GROUP BY d.dept_id, d.name;
```

Key rules:
- INNER JOIN excludes rows with no match — NULLs in the join key cause exclusion.
- Always qualify column names when joining tables that share column names.
- JOIN order affects readability but not the logical result (the optimiser handles physical order).
