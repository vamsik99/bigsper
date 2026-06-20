# Outer JOINs

Outer JOINs extend INNER JOIN by preserving unmatched rows from one or both tables. Unmatched columns are filled with NULL.

## LEFT JOIN (LEFT OUTER JOIN)

A LEFT JOIN returns all rows from the left table, plus matching rows from the right. If no match exists, right-table columns are NULL:

```sql
SELECT e.name, d.name AS department
FROM employees e
LEFT JOIN departments d ON e.dept_id = d.dept_id;
```

Heidi (dept_id = NULL) appears in the result with department = NULL. An INNER JOIN would have excluded her.

## Finding Unmatched Rows

A common pattern: find rows in the left table with no match in the right:

```sql
-- Employees with no department assignment
SELECT e.name
FROM employees e
LEFT JOIN departments d ON e.dept_id = d.dept_id
WHERE d.dept_id IS NULL;
```

This is more efficient than NOT IN with a subquery in most databases.

## RIGHT JOIN (RIGHT OUTER JOIN)

A RIGHT JOIN preserves all rows from the right table. Unmatched left-table columns are NULL:

```sql
SELECT e.name, d.name AS department
FROM employees e
RIGHT JOIN departments d ON e.dept_id = d.dept_id;
```

Every department appears, even if it has no employees. Departments with no employees show name = NULL for the employee columns.

SQLite does not support RIGHT JOIN natively. Rewrite as a LEFT JOIN with the tables swapped:

```sql
-- Equivalent to the RIGHT JOIN above in SQLite
SELECT e.name, d.name AS department
FROM departments d
LEFT JOIN employees e ON e.dept_id = d.dept_id;
```

## FULL OUTER JOIN

A FULL OUTER JOIN returns all rows from both tables. Unmatched columns are NULL on the side with no match:

```sql
SELECT e.name, d.name AS department
FROM employees e
FULL OUTER JOIN departments d ON e.dept_id = d.dept_id;
```

SQLite does not support FULL OUTER JOIN. Simulate it with UNION of LEFT JOIN and a reversed LEFT JOIN:

```sql
SELECT e.name, d.name FROM employees e LEFT JOIN departments d ON e.dept_id = d.dept_id
UNION
SELECT e.name, d.name FROM departments d LEFT JOIN employees e ON e.dept_id = d.dept_id;
```

## NULL-Extended Rows

When an outer join preserves an unmatched row, all columns from the non-preserved table are set to NULL. Be careful with aggregate functions: COUNT(right_col) will not count these NULL-extended rows, but COUNT(*) will.

```sql
-- Number of employees per department, including empty departments
SELECT d.name, COUNT(e.emp_id) AS headcount
FROM departments d
LEFT JOIN employees e ON d.dept_id = e.dept_id
GROUP BY d.dept_id, d.name;
```

Using COUNT(e.emp_id) rather than COUNT(*) correctly returns 0 for empty departments.

## Practical Example

```sql
-- List every department with its budget and headcount, even empty ones
SELECT
  d.name,
  d.budget,
  COUNT(e.emp_id) AS headcount,
  COALESCE(AVG(e.salary), 0) AS avg_salary
FROM departments d
LEFT JOIN employees e ON d.dept_id = e.dept_id
GROUP BY d.dept_id, d.name, d.budget;
```

Key rules:
- LEFT JOIN preserves all left-table rows; unmatched right columns become NULL.
- Use IS NULL on a right-table key column to find unmatched rows.
- SQLite: use LEFT JOIN instead of RIGHT JOIN or FULL OUTER JOIN.
- COUNT(right_col) is NULL-aware; COUNT(*) is not — choose carefully.
