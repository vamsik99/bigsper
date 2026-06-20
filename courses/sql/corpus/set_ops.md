# Set Operations: UNION, INTERSECT, EXCEPT

Set operations combine the results of two SELECT statements. The two queries must have the same number of columns with compatible data types.

## UNION and UNION ALL

UNION combines rows from both queries and removes duplicates. UNION ALL keeps all rows including duplicates and is faster:

```sql
-- Department IDs that appear in employees OR projects (removing duplicates)
SELECT dept_id FROM employees WHERE dept_id IS NOT NULL
UNION
SELECT 1 AS dept_id FROM projects WHERE project_id = 1;
```

```sql
-- All employee names followed by all project names (with duplicates preserved)
SELECT name FROM employees
UNION ALL
SELECT name FROM projects;
```

UNION deduplicates by comparing full rows; UNION ALL skips that step and is significantly faster on large result sets.

## INTERSECT

INTERSECT returns rows present in both queries — the set intersection:

```sql
-- emp_ids that appear in both employees and employee_projects (have at least one project)
SELECT emp_id FROM employees
INTERSECT
SELECT emp_id FROM employee_projects;
```

This is equivalent to an INNER JOIN or an EXISTS subquery, but often more readable for set-logic questions.

## EXCEPT (MINUS)

EXCEPT returns rows from the first query that are not in the second — the set difference. Some databases call it MINUS (Oracle):

```sql
-- emp_ids of employees who have NO projects
SELECT emp_id FROM employees
EXCEPT
SELECT emp_id FROM employee_projects;
```

Equivalent to NOT IN or NOT EXISTS but often clearer.

## Column Alignment Rules

The column count and data types must match across all queries in a set operation. Column names are taken from the first query:

```sql
SELECT name, 'employee' AS type FROM employees
UNION ALL
SELECT name, 'project'  AS type FROM projects;
```

Here both SELECT clauses return two columns (name, type). The result columns are named name and type from the first SELECT.

## Ordering and Limiting Set Operations

ORDER BY and LIMIT apply to the entire result, not to individual queries. Place them after the last query:

```sql
SELECT name FROM employees
UNION ALL
SELECT name FROM projects
ORDER BY name
LIMIT 10;
```

## Deduplication in UNION

UNION uses the same row-equality rules as DISTINCT. Two rows are equal if all corresponding column values are equal (NULL = NULL in this context — SQLite treats two NULLs as duplicates for UNION deduplication purposes).

## Key Rules

- UNION removes duplicates; UNION ALL does not. Prefer UNION ALL when duplicates are acceptable — it is faster.
- Column count and compatible types are required.
- Column names come from the first SELECT.
- ORDER BY and LIMIT appear after the final SELECT in a set operation.
- EXCEPT is left-associative: A EXCEPT B EXCEPT C = (A EXCEPT B) EXCEPT C.
