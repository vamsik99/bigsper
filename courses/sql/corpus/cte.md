# CTEs — Common Table Expressions

A CTE (Common Table Expression) is a named temporary result set defined with the WITH clause. CTEs make complex queries readable by breaking them into named building blocks.

## Basic Syntax

```sql
WITH cte_name AS (
  SELECT ...
)
SELECT * FROM cte_name;
```

The CTE exists only for the duration of the query. It cannot be used outside the statement that defines it.

## Multi-Step Example

```sql
-- Step 1: compute department averages
-- Step 2: find employees above their dept average
WITH dept_avg AS (
  SELECT dept_id, AVG(salary) AS avg_salary
  FROM employees
  WHERE dept_id IS NOT NULL
  GROUP BY dept_id
)
SELECT e.name, e.salary, da.avg_salary
FROM employees e
JOIN dept_avg da ON e.dept_id = da.dept_id
WHERE e.salary > da.avg_salary;
```

The same result could be written with a subquery in FROM, but the CTE name (dept_avg) makes the intent explicit.

## Multiple CTEs

Chain multiple CTEs with commas:

```sql
WITH
  dept_avg AS (
    SELECT dept_id, AVG(salary) AS avg_sal
    FROM employees
    GROUP BY dept_id
  ),
  top_depts AS (
    SELECT dept_id FROM dept_avg WHERE avg_sal > 70000
  )
SELECT e.name, e.salary
FROM employees e
JOIN top_depts td ON e.dept_id = td.dept_id;
```

Each CTE can reference CTEs defined before it.

## Recursive CTEs

A recursive CTE references itself to iterate. Syntax requires RECURSIVE keyword (mandatory in PostgreSQL, optional in SQLite):

```sql
-- Generate a sequence of numbers 1 through 10
WITH RECURSIVE counter(n) AS (
  SELECT 1            -- base case
  UNION ALL
  SELECT n + 1 FROM counter WHERE n < 10  -- recursive step
)
SELECT n FROM counter;
```

Recursive CTEs are ideal for traversing hierarchies (org charts, category trees) or generating series:

```sql
-- Walk an org hierarchy (requires manager_id column on employees)
WITH RECURSIVE org AS (
  SELECT emp_id, name, manager_id, 0 AS depth
  FROM employees WHERE manager_id IS NULL   -- top of org
  UNION ALL
  SELECT e.emp_id, e.name, e.manager_id, o.depth + 1
  FROM employees e
  JOIN org o ON e.manager_id = o.emp_id
)
SELECT depth, name FROM org ORDER BY depth, name;
```

SQLite terminates the recursion when the recursive step returns no new rows.

## CTE vs Subquery

CTEs and subqueries are often interchangeable. Use CTEs when:
- The same derived table is referenced more than once.
- You want to name intermediate steps for clarity.
- You need recursion.

Some databases materialise CTEs (compute them once); others inline them. Check your database's behaviour if performance is critical.

## Key Rules

- CTEs are defined before the main SELECT and are scoped to the single statement.
- Multiple CTEs are separated by commas inside the WITH clause.
- Recursive CTEs require a base case (no self-reference) and a recursive step (references the CTE).
- A recursive CTE must use UNION ALL (not UNION) in the recursive step to avoid infinite loops caused by duplicate detection.
