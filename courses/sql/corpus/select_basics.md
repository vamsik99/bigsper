# SELECT Basics

The SELECT statement is the foundation of SQL. It retrieves rows and columns from one or more tables.

## Basic Syntax

```sql
SELECT column1, column2
FROM table_name;
```

To retrieve every column, use the wildcard:

```sql
SELECT * FROM employees;
```

Avoid SELECT * in production code — it fetches unnecessary data and breaks if columns are added or reordered.

## Column Aliases

Aliases rename a column in the result set using the AS keyword (the keyword is optional):

```sql
SELECT name AS employee_name, salary AS annual_salary
FROM employees;
```

Aliases are useful when column names are ambiguous or too technical for a report.

## DISTINCT

DISTINCT removes duplicate rows from the result:

```sql
SELECT DISTINCT dept_id
FROM employees;
```

This returns one row per unique dept_id, not one row per employee. DISTINCT applies to the full set of selected columns, not just one.

## LIMIT and OFFSET

LIMIT caps the number of rows returned. OFFSET skips a number of rows before starting:

```sql
SELECT name, salary
FROM employees
LIMIT 5 OFFSET 10;
```

This fetches rows 11 through 15. Useful for pagination.

## Computed Columns

You can include expressions directly in SELECT:

```sql
SELECT name, salary * 12 AS annual_salary
FROM employees;
```

SQLite evaluates the expression per row.

## Execution Order

Even though SELECT appears first in the written query, the database engine processes clauses in this order: FROM → WHERE → GROUP BY → HAVING → SELECT → ORDER BY → LIMIT. This is why you cannot use a SELECT alias in a WHERE clause — the alias does not yet exist when WHERE runs.

## NULL in SELECT

If a column contains NULL, it appears as NULL in the result. You cannot test for NULL with =; use IS NULL or IS NOT NULL (covered in Filtering).

## Example Using the Sample Database

Our sample database has an employees table with columns: emp_id, name, dept_id, salary, hire_date.

```sql
-- List every employee's name and their yearly salary
SELECT name, salary * 12 AS yearly_salary
FROM employees;
```

```sql
-- Get unique department IDs that have at least one employee
SELECT DISTINCT dept_id
FROM employees
WHERE dept_id IS NOT NULL;
```

Key rules:
- SELECT runs after FROM and WHERE — aliases defined in SELECT are not available in WHERE.
- DISTINCT is applied after filtering.
- Column order in SELECT controls the result set column order.
