# Normalization

Normalization is the process of organizing a relational database to reduce data redundancy and improve data integrity. It proceeds through a series of normal forms, each building on the previous.

## First Normal Form (1NF)

A table is in 1NF if:
1. Each column contains atomic (indivisible) values — no comma-separated lists or repeating groups.
2. Each row is uniquely identifiable (primary key exists).

**Violation:** Storing multiple phone numbers in one column: `phones = '555-1234, 555-5678'`
**Fix:** Create a separate phone_numbers table with one row per number.

## Second Normal Form (2NF)

A table is in 2NF if it is in 1NF and every non-key column is fully dependent on the entire primary key (relevant for composite keys).

**Violation:** In a table `ORDER_ITEMS(order_id, product_id, product_name, quantity)`, `product_name` depends only on `product_id`, not the full composite key.
**Fix:** Move `product_name` to a `PRODUCTS` table with `product_id` as its primary key.

## Third Normal Form (3NF)

A table is in 3NF if it is in 2NF and no non-key column depends on another non-key column (no transitive dependencies).

**Violation:** `EMPLOYEES(emp_id, dept_id, dept_name)` — `dept_name` depends on `dept_id`, not directly on `emp_id`.
**Fix:** Move `dept_name` to a `DEPARTMENTS` table. This is exactly what our sample database does.

## Boyce-Codd Normal Form (BCNF)

BCNF is a stricter version of 3NF: every determinant (a column that determines another) must be a candidate key. BCNF handles anomalies that 3NF misses in tables with overlapping candidate keys.

## Functional Dependency

A functional dependency A → B means that knowing A uniquely determines B. For example, `dept_id → dept_name` means each dept_id maps to exactly one dept_name. Normalisation aims to ensure every non-key column depends only on the key.

## Our Sample Database Design

The sample schema is in 3NF:
- `departments(dept_id, name, budget)` — all non-key columns depend on dept_id.
- `employees(emp_id, name, dept_id, salary, hire_date)` — all non-key columns depend on emp_id; dept_id is a FK.
- `employee_projects(emp_id, project_id, role)` — role depends on the composite key (emp_id, project_id).

## Trade-offs with Denormalization

Normalized schemas require JOIN operations to reconstruct related data. Denormalization intentionally introduces redundancy for read performance:

- Reporting databases and data warehouses often use denormalized star schemas.
- OLTP (transactional) databases prefer normalized schemas to avoid update anomalies.

## Update Anomalies (What Normalization Prevents)

Without normalization:
- **Insertion anomaly** — cannot store a department's name unless an employee is assigned.
- **Update anomaly** — changing dept_name in one row but not others creates inconsistency.
- **Deletion anomaly** — deleting the last employee of a department loses the department's name.

Key rules:
- 1NF: atomic values, unique rows.
- 2NF: no partial dependency on composite key.
- 3NF: no transitive dependency (non-key column depending on non-key column).
- BCNF: every determinant is a candidate key.
- Normalized schemas trade read performance for write correctness; denormalize deliberately and with understanding of trade-offs.
