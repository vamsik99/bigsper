# Aggregate Functions

Aggregate functions collapse many rows into a single value. They are: COUNT, SUM, AVG, MIN, MAX.

## COUNT

COUNT(*) counts every row including NULLs. COUNT(column) counts non-NULL values in that column:

```sql
-- Total number of employees
SELECT COUNT(*) FROM employees;

-- Number of employees assigned to a department (excludes NULLs)
SELECT COUNT(dept_id) FROM employees;
```

In our sample data, 8 employees exist but one (Heidi) has NULL dept_id, so:
- `COUNT(*)` returns 8
- `COUNT(dept_id)` returns 7

## SUM

SUM adds up all non-NULL values in a column:

```sql
SELECT SUM(salary) AS total_payroll
FROM employees;
```

SUM ignores NULL values. If all values are NULL, SUM returns NULL.

## AVG

AVG computes the arithmetic mean of non-NULL values:

```sql
SELECT AVG(salary) AS avg_salary
FROM employees;
```

AVG = SUM / COUNT(column), so NULLs do not lower the average — they are excluded from both numerator and denominator.

## MIN and MAX

MIN and MAX return the smallest and largest non-NULL values respectively:

```sql
SELECT MIN(salary), MAX(salary)
FROM employees;
```

They work on text columns too, using lexicographic ordering.

## DISTINCT in Aggregates

Adding DISTINCT inside an aggregate function deduplicates values before aggregating:

```sql
-- Number of distinct departments that have employees
SELECT COUNT(DISTINCT dept_id) FROM employees;

-- Sum of unique salary values (unusual but valid)
SELECT SUM(DISTINCT salary) FROM employees;
```

## NULL Behaviour Summary

All aggregate functions except COUNT(*) ignore NULL values. This is important: if every value in a column is NULL, the aggregate returns NULL (not zero).

## Using Aggregates Without GROUP BY

When no GROUP BY is present, aggregate functions collapse the entire table into one row:

```sql
SELECT COUNT(*) AS total, AVG(salary) AS avg_sal, MAX(salary) AS top_sal
FROM employees;
```

You cannot mix aggregate and non-aggregate columns in SELECT without GROUP BY (unless the non-aggregate column is functionally dependent on the grouped columns).

## Practical Example

```sql
-- Payroll statistics across all employees
SELECT
  COUNT(*)          AS headcount,
  SUM(salary)       AS total_payroll,
  ROUND(AVG(salary), 2) AS avg_salary,
  MIN(salary)       AS lowest,
  MAX(salary)       AS highest
FROM employees;
```

Key rules:
- COUNT(*) includes NULLs; COUNT(col) excludes them.
- SUM, AVG, MIN, MAX all skip NULL values.
- Without GROUP BY, the entire table becomes one group.
