# Filtering with WHERE

The WHERE clause filters rows before they are returned. Only rows where the condition evaluates to TRUE are included.

## Comparison Operators

| Operator | Meaning |
|---|---|
| = | Equal |
| <> or != | Not equal |
| < , > | Less / greater than |
| <= , >= | Less / greater than or equal |

```sql
SELECT name, salary
FROM employees
WHERE salary > 60000;
```

## Logical Operators

AND, OR, and NOT combine conditions. AND has higher precedence than OR — use parentheses to be explicit:

```sql
SELECT name
FROM employees
WHERE salary > 60000 AND dept_id = 1;

SELECT name
FROM employees
WHERE dept_id = 1 OR dept_id = 2;
```

## NULL Handling

NULL is not a value — it is the absence of a value. Comparing NULL with = always returns UNKNOWN, which WHERE treats as FALSE.

```sql
-- Wrong: returns nothing
SELECT name FROM employees WHERE dept_id = NULL;

-- Correct
SELECT name FROM employees WHERE dept_id IS NULL;
SELECT name FROM employees WHERE dept_id IS NOT NULL;
```

In our sample data, employee Heidi has a NULL dept_id. The query above with IS NULL returns only Heidi.

## IN

IN tests whether a value matches any member of a list:

```sql
SELECT name
FROM employees
WHERE dept_id IN (1, 2);
```

Equivalent to `dept_id = 1 OR dept_id = 2` but cleaner. NOT IN excludes the listed values — beware: if the list contains a NULL, NOT IN returns no rows (because NULL comparisons are UNKNOWN).

## BETWEEN

BETWEEN is inclusive on both ends:

```sql
SELECT name, salary
FROM employees
WHERE salary BETWEEN 50000 AND 80000;
```

This is equivalent to `salary >= 50000 AND salary <= 80000`.

## LIKE

LIKE does pattern matching on text. `%` matches any sequence of characters; `_` matches exactly one character:

```sql
-- Names starting with 'A'
SELECT name FROM employees WHERE name LIKE 'A%';

-- Names with exactly 5 characters
SELECT name FROM employees WHERE name LIKE '_____';
```

LIKE is case-insensitive in SQLite by default for ASCII characters.

## Execution Order

WHERE runs after FROM but before SELECT, GROUP BY, and HAVING. This means you cannot reference a SELECT alias inside WHERE.

## Combining Filters

```sql
SELECT name, salary
FROM employees
WHERE dept_id IS NOT NULL
  AND salary BETWEEN 40000 AND 90000
  AND name LIKE 'A%';
```

Key rules:
- NULL requires IS NULL / IS NOT NULL, never = NULL.
- AND has higher precedence than OR; use parentheses when mixing.
- NOT IN with a list containing NULL always returns zero rows.
