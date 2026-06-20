# Window Functions — Basics

Window functions compute values across a set of rows related to the current row without collapsing them into a single output row. Unlike GROUP BY aggregates, window functions preserve individual rows.

## OVER() Clause

The OVER() clause turns an aggregate or ranking function into a window function:

```sql
SELECT name, salary,
       AVG(salary) OVER() AS company_avg
FROM employees;
```

This adds the company-wide average salary to every row. No GROUP BY needed; every row is preserved.

## PARTITION BY

PARTITION BY divides rows into groups (partitions) independently — the window function resets for each partition:

```sql
SELECT name, dept_id, salary,
       AVG(salary) OVER(PARTITION BY dept_id) AS dept_avg
FROM employees;
```

Each row shows the average salary of its own department. Compare with GROUP BY: GROUP BY would give one row per dept; PARTITION BY keeps all rows.

## ORDER BY Inside OVER()

Adding ORDER BY inside OVER() changes the window to a cumulative frame by default:

```sql
SELECT name, salary,
       SUM(salary) OVER(ORDER BY salary) AS running_total
FROM employees;
```

This produces a running total ordered by salary. The default frame when ORDER BY is present is ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW.

## Ranking Functions

**ROW_NUMBER()** assigns a unique sequential integer to each row within the partition, starting at 1. Ties are broken arbitrarily:

```sql
SELECT name, salary,
       ROW_NUMBER() OVER(ORDER BY salary DESC) AS rank
FROM employees;
```

**RANK()** gives the same number to ties, then skips ranks:

```sql
-- Two employees at salary 75000 both get rank 1; next is rank 3
SELECT name, salary,
       RANK() OVER(ORDER BY salary DESC) AS rnk
FROM employees;
```

**DENSE_RANK()** gives the same number to ties but does not skip ranks:

```sql
-- Two employees at 75000 both get rank 1; next is rank 2
SELECT name, salary,
       DENSE_RANK() OVER(ORDER BY salary DESC) AS dense_rnk
FROM employees;
```

## Common Pattern: Top-N Per Group

```sql
-- Top 2 earners per department
WITH ranked AS (
  SELECT name, dept_id, salary,
         RANK() OVER(PARTITION BY dept_id ORDER BY salary DESC) AS rnk
  FROM employees
  WHERE dept_id IS NOT NULL
)
SELECT name, dept_id, salary
FROM ranked
WHERE rnk <= 2;
```

You cannot filter on a window function result in WHERE directly — wrap it in a CTE or subquery first.

## Window Functions vs GROUP BY

| Feature | GROUP BY + Aggregate | Window Function |
|---|---|---|
| Row count | One row per group | All rows preserved |
| Access original row | Lost | Still available |
| Multiple windows | Requires subqueries | Multiple OVER() in one SELECT |

Key rules:
- OVER() with no arguments computes over the entire result set.
- PARTITION BY divides the window; ORDER BY determines row order within the window.
- ROW_NUMBER is always unique; RANK skips numbers after ties; DENSE_RANK does not skip.
- Window functions run after WHERE and GROUP BY but before the final ORDER BY.
