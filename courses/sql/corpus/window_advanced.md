# Window Functions — Advanced Frames

Advanced window function features include frame specifications, offset functions (LAG, LEAD), and NTILE for bucketing.

## Frame Specification

A frame defines exactly which rows are included in the window for the current row. Frames only apply when ORDER BY is present in OVER().

**Syntax:**
```
ROWS BETWEEN <start> AND <end>
RANGE BETWEEN <start> AND <end>
```

**Frame boundaries:**
- `UNBOUNDED PRECEDING` — from the first row of the partition
- `N PRECEDING` — N rows before the current row
- `CURRENT ROW` — the current row
- `N FOLLOWING` — N rows after the current row
- `UNBOUNDED FOLLOWING` — to the last row of the partition

## ROWS vs RANGE

ROWS counts physical rows. RANGE uses the logical value — rows with the same ORDER BY value are in the same range:

```sql
-- Running total using ROWS: each row is counted individually
SUM(salary) OVER(ORDER BY salary ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW)

-- Running total using RANGE: all rows with the same salary as current are included
SUM(salary) OVER(ORDER BY salary RANGE BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW)
```

When there are no ties, ROWS and RANGE behave identically.

## Moving Average

```sql
-- 3-row moving average of salary (current row ± 1 neighbour)
SELECT name, salary,
       AVG(salary) OVER(
         ORDER BY emp_id
         ROWS BETWEEN 1 PRECEDING AND 1 FOLLOWING
       ) AS moving_avg
FROM employees;
```

## LAG and LEAD

LAG accesses a previous row's value; LEAD accesses a following row's value. Both require ORDER BY in OVER():

```sql
SELECT name, hire_date,
       LAG(hire_date)  OVER(ORDER BY hire_date) AS prev_hire,
       LEAD(hire_date) OVER(ORDER BY hire_date) AS next_hire
FROM employees;
```

An optional second argument specifies the offset (default 1), and a third argument provides a default when the offset falls outside the partition:

```sql
LAG(salary, 1, 0) OVER(ORDER BY emp_id)  -- 0 if no previous row
```

## Running Total

```sql
SELECT name, salary,
       SUM(salary) OVER(
         ORDER BY hire_date
         ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
       ) AS running_payroll
FROM employees;
```

## NTILE

NTILE(n) divides rows into n equal-sized buckets and assigns a bucket number:

```sql
SELECT name, salary,
       NTILE(4) OVER(ORDER BY salary) AS quartile
FROM employees;
```

Returns 1 for the bottom 25%, 2 for the next, etc. Useful for percentile ranking without hard-coding cutoffs.

## FIRST_VALUE and LAST_VALUE

Return the first or last value in the window frame:

```sql
SELECT name, salary,
       FIRST_VALUE(name) OVER(ORDER BY salary DESC) AS top_earner,
       LAST_VALUE(name) OVER(
         ORDER BY salary DESC
         ROWS BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING
       ) AS lowest_earner
FROM employees;
```

Note: LAST_VALUE with the default frame only sees up to the current row, so you typically need `ROWS BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING`.

Key rules:
- ROWS counts physical rows; RANGE counts logical value groups.
- LAG and LEAD shift the window forward or backward by N rows.
- The default frame with ORDER BY is RANGE UNBOUNDED PRECEDING to CURRENT ROW.
- NTILE distributes rows evenly; remainder rows go to the first buckets.
- Always specify frame bounds explicitly when using LAST_VALUE to avoid the default-frame trap.
