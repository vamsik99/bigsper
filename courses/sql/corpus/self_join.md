# Self JOIN

A self join joins a table to itself. This is used to compare rows within the same table or to model hierarchies and relationships within a single table.

## Why Self JOIN?

Tables sometimes encode relationships between rows. An org chart stores managers and employees in the same people table, with a manager_id column pointing to another row in the same table. A self join lets you retrieve both the employee and their manager from one table:

```sql
-- Conceptual: employees with a manager_id column
SELECT e.name AS employee, m.name AS manager
FROM employees e
JOIN employees m ON e.manager_id = m.emp_id;
```

Our sample employees table does not have manager_id, but the concept is the same.

## Table Aliasing Is Required

In a self join you must give the table two different aliases. Without aliases, the database cannot distinguish which copy of the table a column reference belongs to:

```sql
-- e is "the employee row", m is "the manager row"
FROM employees e
JOIN employees m ON e.manager_id = m.emp_id
```

## Comparing Rows Within the Same Table

Self joins are also useful for finding pairs of rows with certain relationships:

```sql
-- Find all pairs of employees in the same department
-- where the first name comes alphabetically before the second
SELECT a.name AS emp1, b.name AS emp2, a.dept_id
FROM employees a
JOIN employees b
  ON a.dept_id = b.dept_id
  AND a.name < b.name;
```

The condition `a.name < b.name` prevents duplicate pairs (Alice–Bob and Bob–Alice) and self-pairs (Alice–Alice).

## Finding Employees With Similar Salaries

```sql
-- Pairs of employees with salaries within 5000 of each other
SELECT a.name, a.salary, b.name AS peer, b.salary AS peer_salary
FROM employees a
JOIN employees b
  ON a.emp_id <> b.emp_id
  AND ABS(a.salary - b.salary) <= 5000
ORDER BY a.name, b.name;
```

## Recursive Hierarchies With Self JOIN

For deep hierarchies (e.g., multi-level org charts), a recursive CTE is more practical than chaining multiple self joins. A self join retrieves exactly one level of the hierarchy per JOIN:

```sql
-- Two-level hierarchy: employee → their manager → manager's manager
SELECT e.name, m.name AS manager, gm.name AS grandmanager
FROM employees e
LEFT JOIN employees m ON e.manager_id = m.emp_id
LEFT JOIN employees gm ON m.manager_id = gm.emp_id;
```

For unlimited depth, use a recursive CTE instead.

## Key Rules

- A self join requires two aliases for the same table.
- Use a condition like `a.id < b.id` or `a.id <> b.id` to avoid duplicate or self-pairs.
- For one level of hierarchy, a self join is simple; for arbitrary depth, use a recursive CTE.
- LEFT JOIN is common in self joins to include rows with no match (e.g., the CEO who has no manager).
