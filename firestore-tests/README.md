# Firestore Security Rules Tests

This directory contains tests for the multi-tenant Firestore Security Rules.

## Prerequisites

1. Install Firebase CLI:
```bash
npm install -g firebase-tools
```

2. Install dependencies:
```bash
npm install
```

## Running Tests

### Run all tests
```bash
npm run test
```

### Run tests in watch mode (for development)
```bash
npm run test:watch
```

### Start emulator only (for debugging)
```bash
npm run emulator
```

## Test Coverage

The test suite covers:

### Critical Security Tests
- ✅ Cross-tenant isolation (User from Org A cannot access Org B data)
- ✅ Membership-based access (Users without active membership are denied)
- ✅ Role-based permissions (Employee vs Admin vs Owner)

### Role-Specific Tests
- **Employee**: Can read/write assigned leads, cannot access private financials, cannot modify org settings
- **Admin**: Can read/write all leads, can access financials, can modify settings
- **Owner**: Same as admin + organization management capabilities

### Data Collection Tests
- User identity (users collection)
- Memberships
- Leads and subcollections (notes, private)
- Activity log immutability
- Organization settings

## Test Structure

```
firestore-tests/
├── firebase.json          # Emulator configuration
├── package.json           # Dependencies and scripts
├── test-helpers.js        # Utility functions for tests
├── rules.test.js          # Main test file
└── README.md              # This file
```

## Key Test Cases

### 1. Cross-Tenant Isolation
```javascript
it('User from Org A CANNOT read Org B leads', async () => {
  // Setup user in Org A
  // Create lead in Org B
  // Assert user CANNOT read Org B lead
});
```

### 2. Employee Cannot Access Financials
```javascript
it('Employee CANNOT read private financials', async () => {
  // Setup employee membership
  // Create lead with private data
  // Assert employee CANNOT read private subcollection
});
```

### 3. Admin Can Access Financials
```javascript
it('Admin CAN read private financials', async () => {
  // Setup admin membership
  // Create lead with private data
  // Assert admin CAN read private subcollection
});
```

## Troubleshooting

### Emulator Connection Issues
If tests fail with connection errors:
1. Ensure port 8080 is not in use
2. Run `firebase emulators:start` manually to check for errors
3. Check Firebase CLI version: `firebase --version`

### Rules Not Loading
If security rules aren't being applied:
1. Verify `firestore.rules` path in firebase.json
2. Check for syntax errors in rules file
3. Clear emulator cache: `firebase emulators:start --import=./emulator-data`

## CI/CD Integration

Add to your GitHub Actions workflow:
```yaml
- name: Run Firestore Security Rules Tests
  run: |
    cd firestore-tests
    npm install
    npm run test
```

## Additional Resources

- [Firebase Security Rules Documentation](https://firebase.google.com/docs/rules)
- [Firebase Emulator Suite](https://firebase.google.com/docs/emulator-suite)
- [@firebase/rules-unit-testing](https://firebase.google.com/docs/rules/rules-unit-testing)
