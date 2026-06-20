# Subqueries

A subquery is a SELECT nested inside another SQL statement. It can appear in SELECT, FROM, WHERE, and HAVING clauses.

## Scalar Subquery

A scalar subquery returns exactly one value (one row, one column). It can appear anywhere a single value is expected:

```sql
-- Show each employee's salary and how it compares to the company average
SELECT name, salary,
       salary - (SELECT AVG(salary) FROM employees) AS diff_from_avg
FROM employees;
```

If the scalar subquery returns more than one row, SQLite raises an error.

## Table Subquery (Derived Table)

A subquery in the FROM clause acts as a temporary table. It must be given an alias:

```sql
SELECT dept_stats.dept_id, dept_stats.avg_sal
FROM (
  SELECT dept_id, AVG(salary) AS avg_sal
  FROM employees
  WHERE dept_id IS NOT NULL
  GROUP BY dept_id
) AS dept_stats
WHERE dept_stats.avg_sal > 65000;
```

The derived table is computed first, then the outer query filters its results.

## Subquery with IN

A subquery can return a list of values for an IN test:

```sql
-- Employees who work on at least one project
SELECT name
FROM employees
WHERE emp_id IN (
  SELECT DISTINCT emp_id FROM employee_projects
);
```

## Subquery with EXISTS

EXISTS returns TRUE if the subquery returns at least one row. It short-circuits on the first match, making it efficient:

```sql
-- Employees assigned to at least one project
SELECT name
FROM employees e
WHERE EXISTS (
  SELECT 1 FROM employee_projects ep WHERE ep.emp_id = e.emp_id
);
```

NOT EXISTS finds employees with no projects.

## Correlated Subquery

A correlated subquery references a column from the outer query. It is re-evaluated for every outer row:

```sql
-- Employees earning more than their department's average
SELECT name, salary, dept_id
FROM employees e_outer
WHERE salary > (
  SELECT AVG(salary)
  FROM employees e_inner
  WHERE e_inner.dept_id = e_outer.dept_id
);
```

The subquery sees `e_outer.dept_id` from the enclosing row. Correlated subqueries can be slow on large tables because of the repeated execution; a JOIN or window function is often more efficient.

## Row Subquery

A row subquery returns one row with multiple columns, compared using row constructors (not always supported):

```sql
-- Supported in PostgreSQL, not in SQLite
SELECT name FROM employees WHERE (dept_id, salary) = (SELECT dept_id, MAX(salary) FROM employees WHERE dept_id = 1);
```

## Subquery vs JOIN

Subqueries and JOINs are often interchangeable. JOINs are generally faster for large datasets because the optimiser has more flexibility. EXISTS is preferred over IN when the subquery may return NULLs (NOT IN with a NULL-containing list returns zero rows).

Key rules:
- Scalar subqueries must return exactly one row and one column.
- EXISTS is efficient because it short-circuits; IN materialises the full result set.
- Correlated subqueries run once per outer row — avoid on large tables.
- NOT IN returns no rows if the subquery result contains any NULL.
