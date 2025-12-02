# Tests

All tests are organized here, keeping them separate from production code.

## Structure

```
src/
├── db/                   # Database code
├── lib/                  # Libraries (auth, etc.)
├── middleware/           # Middleware
├── routes/               # API routes
├── services/             # Business logic
├── utils/                # Utilities
│
└── __tests__/           # All tests mirror src structure
    ├── db/
    │   └── index.test.ts
    ├── lib/
    │   └── auth.test.ts
    ├── middleware/
    │   ├── authGuards.test.ts
    │   └── middleware.test.ts
    ├── routes/
    │   └── income.router.test.ts
    ├── services/
    │   ├── audit.service.test.ts
    │   ├── expense.service.test.ts
    │   ├── income.service.test.ts
    │   └── organization.service.test.ts
    ├── utils/
    │   ├── frequency.test.ts
    │   └── money.test.ts
    ├── helpers/          # Shared test utilities
    │   ├── testSetup.ts
    │   └── generators.ts
    └── README.md
```

## Test Helpers

### helpers/testSetup.ts

Reusable functions for creating and cleaning up test data:

```typescript
import { createTestContext, cleanupTestContext } from "../helpers/testSetup";

let context: TestContext;

beforeAll(async () => {
  context = await createTestContext();
});

afterAll(async () => {
  await cleanupTestContext(context);
});

// Use context.testOrg.orgId, context.testOrg.adminUserId, etc.
```

### helpers/generators.ts

Fast-check arbitraries for property-based testing:

```typescript
import { expenseDataArbitrary } from "../helpers/generators";
import fc from "fast-check";

test("property test", async () => {
  await fc.assert(
    fc.asyncProperty(expenseDataArbitrary, async (data) => {
      // Test with generated data
    }),
    { numRuns: 20 }
  );
});
```

## Running Tests

```bash
# Run all tests
bun test

# Run tests for specific module
bun test src/__tests__/services/
bun test src/__tests__/utils/

# Run specific test file
bun test src/__tests__/services/expense.service.test.ts

# Run with coverage
bun test --coverage

# Run in watch mode
bun test --watch
```

## Test Statistics

- **109 tests** across 11 files
- **5,981 assertions**
- All tests passing ✅

### Coverage by Module
- **DB**: 3 tests
- **Lib**: 4 tests
- **Middleware**: 11 tests
- **Routes**: 4 tests
- **Services**: 49 tests
- **Utils**: 38 tests

## Benefits

### Clean Separation
- Production code stays clean
- Tests don't clutter source folders
- Easy to exclude tests from builds

### Standard Convention
- `__tests__` folder is recognized by test runners
- Familiar pattern for JavaScript/TypeScript developers
- Tests mirror source structure

### DRY Principles
- Shared helpers reduce boilerplate by 90%
- Consistent patterns across all tests
- Easy to maintain and extend
