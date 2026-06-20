# GROUP BY and HAVING

GROUP BY partitions rows into groups and collapses each group into one row using aggregate functions. HAVING filters those groups after aggregation.

## Basic GROUP BY

```sql
SELECT dept_id, COUNT(*) AS headcount, AVG(salary) AS avg_salary
FROM employees
GROUP BY dept_id;
```

This returns one row per unique dept_id value. Each row shows the number of employees and average salary for that department.

## Rules for SELECT with GROUP BY

In strict SQL (and PostgreSQL), every non-aggregate column in SELECT must appear in GROUP BY. SQLite is more permissive, but following the rule is correct practice:

```sql
-- Valid: dept_id is in GROUP BY; COUNT is an aggregate
SELECT dept_id, COUNT(*) FROM employees GROUP BY dept_id;

-- Invalid in strict SQL: name is not in GROUP BY and not aggregated
SELECT dept_id, name, COUNT(*) FROM employees GROUP BY dept_id;  -- bad
```

## HAVING

HAVING filters groups after aggregation — the equivalent of WHERE for aggregated results:

```sql
-- Departments with more than 2 employees
SELECT dept_id, COUNT(*) AS headcount
FROM employees
GROUP BY dept_id
HAVING COUNT(*) > 2;
```

## WHERE vs HAVING

WHERE runs before grouping and filters individual rows. HAVING runs after grouping and filters groups:

```sql
-- Only count employees hired after 2020, and only show depts with avg salary > 70000
SELECT dept_id, COUNT(*) AS headcount, AVG(salary) AS avg_salary
FROM employees
WHERE hire_date > '2020-01-01'
GROUP BY dept_id
HAVING AVG(salary) > 70000;
```

Execution order: FROM → WHERE (filter rows) → GROUP BY (group) → HAVING (filter groups) → SELECT → ORDER BY.

## Grouping by Multiple Columns

```sql
SELECT dept_id, STRFTIME('%Y', hire_date) AS hire_year, COUNT(*)
FROM employees
GROUP BY dept_id, hire_year
ORDER BY dept_id, hire_year;
```

Each unique (dept_id, hire_year) combination becomes one group.

## NULL in GROUP BY

NULL values form their own group. All rows with NULL in the grouped column go into one NULL group:

```sql
SELECT dept_id, COUNT(*) FROM employees GROUP BY dept_id;
-- Returns a row for NULL dept_id containing Heidi
```

## Practical Example Using Sample Data

```sql
-- For each department, show the department ID, number of employees,
-- total salary, and average salary, but only for departments
-- with a total salary bill above 100000
SELECT
  dept_id,
  COUNT(*)         AS headcount,
  SUM(salary)      AS total_salary,
  AVG(salary)      AS avg_salary
FROM employees
WHERE dept_id IS NOT NULL
GROUP BY dept_id
HAVING SUM(salary) > 100000
ORDER BY total_salary DESC;
```

Key rules:
- WHERE filters rows before grouping; HAVING filters groups after aggregation.
- Non-aggregate columns in SELECT must appear in GROUP BY.
- NULLs in the grouping column form their own group.
- You can reference aggregates in HAVING but not in WHERE.
