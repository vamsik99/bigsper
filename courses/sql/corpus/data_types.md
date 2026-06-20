# Data Types in SQL

SQL columns have declared types that control what values can be stored and how comparisons work. SQLite uses a flexible type affinity system, while other databases (PostgreSQL, MySQL) enforce types strictly.

## Core Type Categories

**Integer types** store whole numbers: INTEGER (or INT), SMALLINT, BIGINT. In SQLite, all integer variants map to the same flexible INTEGER storage class.

**Real / floating-point types**: REAL, FLOAT, DOUBLE. These store approximate decimal numbers and should not be used for monetary values because of floating-point rounding.

**Fixed-precision decimal**: NUMERIC or DECIMAL(p, s) stores exact decimal values. Use this for money and financial calculations where rounding errors are unacceptable.

**Text types**: TEXT, VARCHAR(n), CHAR(n). SQLite stores all text as variable-length UTF-8 regardless of the declared length. Most databases pad CHAR to the declared length with spaces.

**Date and time**: SQLite has no dedicated date/time storage class. Dates are stored as TEXT (ISO 8601: '2024-01-15'), INTEGER (Unix epoch seconds), or REAL (Julian day number). Functions like DATE(), TIME(), and DATETIME() interpret these formats.

**BLOB**: Binary large object — raw bytes. Used for images or serialised data.

## NULL Semantics

NULL represents an unknown or missing value. It is not zero, not an empty string, and not false. Any arithmetic with NULL produces NULL: `5 + NULL = NULL`. Any comparison with NULL produces UNKNOWN: `NULL = NULL` is UNKNOWN, not TRUE.

To test for NULL, use IS NULL or IS NOT NULL:

```sql
SELECT name FROM employees WHERE dept_id IS NULL;
```

In our sample database, employee Heidi has dept_id = NULL, meaning she is not assigned to any department.

## Type Coercion

SQLite performs implicit type coercion when comparing values of different types. For example, comparing a TEXT column to an integer literal will coerce the text to a number if possible. This can cause surprising results:

```sql
-- These return the same employee if emp_id is stored as INTEGER
SELECT * FROM employees WHERE emp_id = 1;
SELECT * FROM employees WHERE emp_id = '1';  -- coercion happens
```

In strict databases (PostgreSQL), this comparison would raise a type mismatch error.

## Choosing the Right Type

- Use INTEGER for identifiers and counts.
- Use NUMERIC/DECIMAL for money.
- Use REAL/FLOAT only for scientific measurements where approximate values are acceptable.
- Use TEXT for names, descriptions, codes.
- Store dates as TEXT in ISO 8601 format ('YYYY-MM-DD') for portability and easy sorting.

## Type Affinity in SQLite

SQLite assigns one of five affinities to each column: TEXT, NUMERIC, INTEGER, REAL, BLOB. The affinity is inferred from the declared type name and determines how values are stored and compared. A column declared as VARCHAR has TEXT affinity; one declared as INT has INTEGER affinity. Values are coerced to the affinity type when possible.
