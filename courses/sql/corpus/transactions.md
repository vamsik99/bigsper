# Transactions and ACID

A transaction is a unit of work that is committed atomically — either all changes happen, or none do. SQL transactions follow the ACID properties.

## ACID Properties

**Atomicity** — All operations in the transaction succeed together or all are rolled back. There is no partial commit.

**Consistency** — A transaction moves the database from one valid state to another. Constraint violations (e.g., foreign key errors) abort the transaction.

**Isolation** — Concurrent transactions do not interfere with each other. Each transaction sees a consistent snapshot of the data.

**Durability** — Once committed, changes survive crashes and restarts. They are persisted to durable storage.

## Basic Transaction Syntax

```sql
BEGIN;
  UPDATE accounts SET balance = balance - 500 WHERE account_id = 1;
  UPDATE accounts SET balance = balance + 500 WHERE account_id = 2;
COMMIT;
```

If an error occurs between BEGIN and COMMIT, issue a ROLLBACK to undo all changes:

```sql
BEGIN;
  UPDATE employees SET salary = salary * 1.10 WHERE dept_id = 1;
  -- something goes wrong...
ROLLBACK;
-- No changes are made
```

SQLite runs every statement in an implicit transaction if no explicit BEGIN is issued.

## Savepoints

Savepoints allow partial rollback within a transaction:

```sql
BEGIN;
  INSERT INTO employees (name, salary) VALUES ('Alice', 70000);
  SAVEPOINT sp1;
  INSERT INTO employees (name, salary) VALUES ('Bob', 80000);
  ROLLBACK TO sp1;   -- undoes Bob's insert but keeps Alice's
COMMIT;              -- commits Alice's insert
```

## Isolation Levels

Isolation levels control how much one transaction can see of other in-progress transactions:

| Level | Dirty Read | Non-Repeatable Read | Phantom Read |
|---|---|---|---|
| READ UNCOMMITTED | Possible | Possible | Possible |
| READ COMMITTED | Prevented | Possible | Possible |
| REPEATABLE READ | Prevented | Prevented | Possible |
| SERIALIZABLE | Prevented | Prevented | Prevented |

**Dirty read** — reading data written by an uncommitted transaction.
**Non-repeatable read** — a row read twice in the same transaction returns different values because another transaction committed a change in between.
**Phantom read** — a re-executed query returns new rows because another transaction inserted rows that match the filter.

SQLite's default isolation is SERIALIZABLE for write transactions: only one writer is allowed at a time.

## DEFERRED, IMMEDIATE, EXCLUSIVE (SQLite)

SQLite transactions have modes that control when locks are acquired:

```sql
BEGIN DEFERRED;    -- default: acquire locks as needed
BEGIN IMMEDIATE;   -- acquire write lock at BEGIN
BEGIN EXCLUSIVE;   -- exclusive lock, prevents all other access
```

## Practical Example

Using our sample database:

```sql
BEGIN;
  -- Transfer an employee to a new department
  UPDATE employees SET dept_id = 2 WHERE emp_id = 5;
  -- Update the old department's record (hypothetical budget tracking)
  UPDATE departments SET budget = budget - 1000 WHERE dept_id = 1;
  UPDATE departments SET budget = budget + 1000 WHERE dept_id = 2;
COMMIT;
```

If any UPDATE fails (e.g., due to a constraint), issue ROLLBACK to leave the database unchanged.

Key rules:
- Always use explicit transactions for multi-statement operations that must succeed or fail together.
- ROLLBACK undoes all changes since BEGIN (or to the named SAVEPOINT).
- Higher isolation levels prevent more anomalies but reduce concurrency.
- SQLite allows only one writer at a time — use WAL mode for better read/write concurrency.
