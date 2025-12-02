# Testing Quick Start

## 🚀 One-Time Setup (5 minutes)

### 1. Create Neon Test Branch
```
1. Go to: https://console.neon.tech
2. Click "Branches" → "Create Branch"
3. Name: "test"
4. Click "Create"
5. Copy the connection string
```

### 2. Create .env.test.local
```bash
# Copy the template
Copy-Item .env.test .env.test.local

# Edit .env.test.local and replace DATABASE_URL with your test branch URL
DATABASE_URL='postgresql://neondb_owner:npg_xxx@ep-test-xxx.eu-west-2.aws.neon.tech/neondb?sslmode=require&channel_binding=require'
```

### 3. Push Schema to Test Database
```bash
bun run db:push:test
```

### 4. Run Tests
```bash
bun test
```

✅ **Done!** Your test database is ready.

---

## 📋 Daily Commands

### After Schema Changes
```bash
# Push to dev database
bun run db:push

# Push to test database  
bun run db:push:test

# Run tests
bun test
```

### Run Tests
```bash
# All tests
bun test

# Specific test file
bun test src/services/audit.service.test.ts

# Watch mode
bun test --watch

# With coverage
bun test --coverage
```

### Update Test Database Schema
```bash
bun run db:push:test
```

---

## 🔧 Available Scripts

| Command | Description |
|---------|-------------|
| `bun run db:push:test` | Push schema to test database |
| `bun run test:setup` | Alias for `db:push:test` |
| `bun test` | Run all tests |
| `bun test --watch` | Run tests in watch mode |
| `bun test --coverage` | Run tests with coverage |

---

## ❓ Troubleshooting

### Tests fail with "relation does not exist"
```bash
bun run db:push:test
```

### "DATABASE_URL not found in .env.test.local"
Make sure `.env.test.local` exists and has `DATABASE_URL` set. Copy from `.env.test` template if needed.

### "You are using the placeholder test database URL"
Update `.env.test.local` with your actual Neon test branch URL.

---

## 📚 More Info

- **Full Setup Guide**: See `TESTING_SETUP.md`
- **Scripts Documentation**: See `scripts/README.md`
- **Service Tests**: See `src/services/README.md`
