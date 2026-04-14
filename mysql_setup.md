---
name: "MySQL Database Setup"
description: "Standard operating procedure for deploying and securing a local MySQL instance."
triggers: ["database_setup", "mysql", "init_db"]
---

# MySQL Initialization Protocol

## 1. Authentication
Always ensure you are connecting with the correct user privileges before executing DDL commands.
`mysql -u root -p`

## 2. Database Creation
Execute the following to ensure idempotency:
```sql
CREATE DATABASE IF NOT EXISTS braimd;
USE braimd;