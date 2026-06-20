# Indexes and Query Plans

An index is an auxiliary data structure that speeds up data retrieval at the cost of extra storage and slower writes.

## What an Index Does

Without an index, the database scans every row (full table scan) to find matching rows. With an index on the searched column, it can jump directly to the relevant rows via the index structure — analogous to a book's index.

## B-Tree Index

The default index type in SQLite (and most databases) is a B-tree (balanced tree). It stores key values in sorted order, enabling:
- Exact-match lookups: `WHERE salary = 75000`
- Range scans: `WHERE salary BETWEEN 60000 AND 80000`
- Sorted retrievals: `ORDER BY salary` (index provides ordering)

```sql
CREATE INDEX idx_employees_salary ON employees(salary);
```

SQLite automatically creates an index on each PRIMARY KEY and UNIQUE column.

## When to Create an Index

Good candidates for indexing:
- Foreign key columns used in JOIN conditions (`dept_id` in employees)
- Columns frequently in WHERE predicates (`salary`, `hire_date`)
- Columns used in ORDER BY when large result sets are returned

Avoid indexing:
- Columns with very low cardinality (e.g., a boolean flag) — the optimiser may not use such an index
- Columns rarely used in filters or joins
- Tables with very few rows (full scan is fast enough)

## Composite Index

An index on multiple columns benefits queries that filter on those columns in order:

```sql
CREATE INDEX idx_emp_dept_salary ON employees(dept_id, salary);
```

This index helps queries that filter by dept_id alone OR by dept_id AND salary together. It does NOT help queries that filter by salary alone (the index is ordered by dept_id first).

## Covering Index

A covering index contains all columns needed by a query, so the database never needs to access the table at all:

```sql
-- Query uses only dept_id and salary
SELECT dept_id, salary FROM employees WHERE dept_id = 2;

-- The composite index above covers this query entirely
```

## EXPLAIN / EXPLAIN QUERY PLAN

SQLite's EXPLAIN QUERY PLAN shows how the database will execute a query:

```sql
EXPLAIN QUERY PLAN
SELECT name FROM employees WHERE salary > 70000;
```

Output lines include:
- `SCAN employees` — full table scan (no useful index)
- `SEARCH employees USING INDEX idx_employees_salary` — index used
- `SEARCH employees USING INTEGER PRIMARY KEY` — primary key lookup

## Hash Indexes

Some databases (PostgreSQL) support hash indexes, which are faster for exact-match lookups but cannot support range queries or ordering. SQLite does not support hash indexes.

## Index Cost

Every index:
- Adds storage overhead (typically 10–30% of table size for a single-column index).
- Slows INSERT, UPDATE, and DELETE because the index must be kept in sync.

A table should have as few indexes as necessary to support its most critical query patterns.

Key rules:
- Index foreign keys and frequently-filtered columns.
- B-tree indexes support equality, range, and ORDER BY.
- Composite indexes are useful left-to-right: (A, B) helps filter by A or by A+B, not B alone.
- Use EXPLAIN QUERY PLAN to verify index usage.
- Every index adds write overhead — don't over-index.
