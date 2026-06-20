# ORDER BY and LIMIT

ORDER BY sorts the result set. LIMIT restricts how many rows are returned.

## ORDER BY Syntax

```sql
SELECT name, salary
FROM employees
ORDER BY salary DESC;
```

The default sort direction is ASC (ascending). To sort in reverse, use DESC.

## Multiple Sort Columns

List columns in priority order. The second column only breaks ties in the first:

```sql
SELECT name, dept_id, salary
FROM employees
ORDER BY dept_id ASC, salary DESC;
```

This returns employees sorted by department first; within each department, higher salaries appear first.

## Sorting NULLs

In SQLite, NULLs sort last in ASC order and first in DESC order. In PostgreSQL, you can control this with NULLS FIRST / NULLS LAST:

```sql
ORDER BY dept_id ASC NULLS LAST;
```

SQLite does not support NULLS FIRST / NULLS LAST syntax, but since NULLs sort last in ASC, the default behaviour often works.

## LIMIT

LIMIT caps the number of rows returned. It is applied after all filtering, grouping, and sorting:

```sql
SELECT name, salary
FROM employees
ORDER BY salary DESC
LIMIT 3;
```

Returns the three highest-paid employees.

## OFFSET

OFFSET skips a number of rows before LIMIT starts counting:

```sql
SELECT name, salary
FROM employees
ORDER BY salary DESC
LIMIT 3 OFFSET 3;
```

Returns positions 4, 5, and 6 in the salary ranking (rows 4–6). Always pair OFFSET with an ORDER BY — without a deterministic sort order, the rows returned by OFFSET are unpredictable.

## Pagination Pattern

```sql
-- Page 1 (rows 1–10)
SELECT * FROM employees ORDER BY emp_id LIMIT 10 OFFSET 0;

-- Page 2 (rows 11–20)
SELECT * FROM employees ORDER BY emp_id LIMIT 10 OFFSET 10;

-- General formula: OFFSET = (page_number - 1) * page_size
```

## Sorting by Expression or Alias

You can sort by a computed expression:

```sql
SELECT name, salary * 12 AS annual
FROM employees
ORDER BY annual DESC;
```

ORDER BY runs after SELECT, so aliases defined in SELECT are available in ORDER BY (unlike WHERE).

## Key Rules

- Without ORDER BY, the row order in the result is undefined and may change between queries.
- LIMIT without ORDER BY is non-deterministic — you cannot predict which rows are returned.
- ORDER BY is the last clause evaluated before LIMIT and OFFSET.
- In SQLite, LIMIT and OFFSET use integer literals or bound parameters; expressions are allowed in most databases.
