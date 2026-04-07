# Basiq360 QR-Based Inventory Management System — Test Cases

**Project:** Binny Footwear Inventory Management
**Version:** 1.3
**Date:** 2026-04-03 (Updated with Phase 2 UI Enhancement tests, UAT bug fix validations, searchable dropdown, customer-centric dispatches)
**Prepared By:** QA Engineering Team
**Tech Stack:** Next.js + Express.js + PostgreSQL (PWA)

---

## Table of Contents

1. [Authentication & Authorization](#1-authentication--authorization)
2. [User Management](#2-user-management)
3. [Product/SKU Management](#3-productsku-management)
4. [Child Box QR Generation](#4-child-box-qr-generation)
5. [Master Carton Packing](#5-master-carton-packing)
6. [Storage Workflow](#6-storage-workflow)
7. [Unpack Workflow](#7-unpack-workflow)
8. [Repack Workflow](#8-repack-workflow)
9. [Dispatch Workflow](#9-dispatch-workflow)
10. [Traceability](#10-traceability)
11. [Reporting](#11-reporting)
12. [QR Scanning](#12-qr-scanning)
13. [PWA & Mobile](#13-pwa--mobile)
14. [Label Printing](#14-label-printing)
15. [Customer Master (NEW)](#15-customer-master-new)
16. [Product Master — Expanded Fields (NEW)](#16-product-master--expanded-fields-new)
17. [Label Redesign — Child Box (NEW)](#17-label-redesign--child-box-new)
18. [Label Redesign — Master Carton (NEW)](#18-label-redesign--master-carton-new)
19. [Multi-Size QR Batch Generation (NEW)](#19-multi-size-qr-batch-generation-new)
20. [Edge Cases & Negative Tests](#20-edge-cases--negative-tests)
21. [Performance Tests](#21-performance-tests)
22. [Phase 2 UI Enhancement Tests (NEW)](#22-phase-2-ui-enhancement-tests-new)
23. [UAT Bug Fix Validation Tests (NEW)](#23-uat-bug-fix-validation-tests-new)
24. [Phase 3 PWA Enhancement Tests (NEW)](#24-phase-3-pwa-enhancement-tests-new)

---

## 1. Authentication & Authorization

| Field | Value |
|-------|-------|
| TC ID | TC-AUTH-001 |
| Module | Authentication |
| Title | Login with valid Admin credentials |
| Priority | Critical |
| Preconditions | Active Admin user exists in the system |
| Steps | 1. Navigate to login page. 2. Enter valid Admin email. 3. Enter valid password. 4. Click Login. |
| Expected Result | User is authenticated, JWT access token and refresh token are issued, user is redirected to Admin dashboard. |
| Type | E2E |

| Field | Value |
|-------|-------|
| TC ID | TC-AUTH-002 |
| Module | Authentication |
| Title | Login with valid Warehouse Operator credentials |
| Priority | Critical |
| Preconditions | Active Warehouse Operator user exists |
| Steps | 1. Navigate to login page. 2. Enter valid Warehouse Operator email. 3. Enter valid password. 4. Click Login. |
| Expected Result | User is authenticated and redirected to Warehouse Operator dashboard with only permitted modules visible. |
| Type | E2E |

| Field | Value |
|-------|-------|
| TC ID | TC-AUTH-003 |
| Module | Authentication |
| Title | Login with invalid email |
| Priority | High |
| Preconditions | None |
| Steps | 1. Navigate to login page. 2. Enter a non-existent email. 3. Enter any password. 4. Click Login. |
| Expected Result | Login is rejected with a generic error message "Invalid credentials." No information leakage about whether the email exists. |
| Type | E2E |

| Field | Value |
|-------|-------|
| TC ID | TC-AUTH-004 |
| Module | Authentication |
| Title | Login with valid email but wrong password |
| Priority | High |
| Preconditions | Active user exists |
| Steps | 1. Navigate to login page. 2. Enter valid email. 3. Enter incorrect password. 4. Click Login. |
| Expected Result | Login is rejected with generic error "Invalid credentials." Failed attempt is logged. |
| Type | E2E |

| Field | Value |
|-------|-------|
| TC ID | TC-AUTH-005 |
| Module | Authentication |
| Title | Login with inactive/deactivated account |
| Priority | High |
| Preconditions | User account exists but is deactivated by Admin |
| Steps | 1. Navigate to login page. 2. Enter deactivated user's email and correct password. 3. Click Login. |
| Expected Result | Login is rejected with message "Account is deactivated. Contact administrator." |
| Type | E2E |

| Field | Value |
|-------|-------|
| TC ID | TC-AUTH-006 |
| Module | Authentication |
| Title | JWT access token expiry handling |
| Priority | Critical |
| Preconditions | User is logged in with a valid session |
| Steps | 1. Log in successfully. 2. Wait for access token to expire (or manually set short TTL in test). 3. Make an authenticated API request. |
| Expected Result | The expired access token is detected. The system automatically uses the refresh token to obtain a new access token. The API request succeeds transparently. |
| Type | Integration |

| Field | Value |
|-------|-------|
| TC ID | TC-AUTH-007 |
| Module | Authentication |
| Title | Refresh token flow — valid refresh token |
| Priority | Critical |
| Preconditions | User is logged in; access token has expired; refresh token is still valid |
| Steps | 1. Send POST to /api/auth/refresh with valid refresh token. |
| Expected Result | New access token and new refresh token are returned. Old refresh token is invalidated (rotation). |
| Type | Integration |

| Field | Value |
|-------|-------|
| TC ID | TC-AUTH-008 |
| Module | Authentication |
| Title | Refresh token flow — expired refresh token |
| Priority | High |
| Preconditions | Both access and refresh tokens have expired |
| Steps | 1. Send POST to /api/auth/refresh with expired refresh token. |
| Expected Result | Request is rejected with 401 Unauthorized. User is forced to re-login. |
| Type | Integration |

| Field | Value |
|-------|-------|
| TC ID | TC-AUTH-009 |
| Module | Authorization |
| Title | Admin can access all routes |
| Priority | Critical |
| Preconditions | Logged in as Admin |
| Steps | 1. Access user management page. 2. Access product management page. 3. Access packing page. 4. Access dispatch page. 5. Access reports page. 6. Access audit logs. |
| Expected Result | All pages load successfully with full read/write access. |
| Type | E2E |

| Field | Value |
|-------|-------|
| TC ID | TC-AUTH-010 |
| Module | Authorization |
| Title | Warehouse Operator cannot access admin routes |
| Priority | Critical |
| Preconditions | Logged in as Warehouse Operator |
| Steps | 1. Attempt to navigate to /admin/users. 2. Attempt to call GET /api/admin/users directly. |
| Expected Result | UI redirects to unauthorized page or hides the route. API returns 403 Forbidden. |
| Type | E2E |

| Field | Value |
|-------|-------|
| TC ID | TC-AUTH-011 |
| Module | Authorization |
| Title | Dispatch Operator limited to dispatch functions only |
| Priority | Critical |
| Preconditions | Logged in as Dispatch Operator |
| Steps | 1. Attempt to access packing module. 2. Attempt to access unpack module. 3. Access dispatch module. 4. Attempt to access user management. |
| Expected Result | Only dispatch module is accessible. All other modules return 403 or redirect to unauthorized page. |
| Type | E2E |

| Field | Value |
|-------|-------|
| TC ID | TC-AUTH-012 |
| Module | Authorization |
| Title | Supervisor has view-only access |
| Priority | High |
| Preconditions | Logged in as Supervisor |
| Steps | 1. Access reports page. 2. Access inventory view. 3. Attempt to create a master carton. 4. Attempt to dispatch a carton. |
| Expected Result | Read operations succeed. Write/action operations (create, dispatch, unpack) are rejected with 403. |
| Type | E2E |

| Field | Value |
|-------|-------|
| TC ID | TC-AUTH-013 |
| Module | Authentication |
| Title | Concurrent session handling — same user two devices |
| Priority | Medium |
| Preconditions | Active user account |
| Steps | 1. Log in on Device A. 2. Log in on Device B with same credentials. 3. Perform action on Device A. |
| Expected Result | System either allows both sessions or invalidates the older session per business rules. Behavior is consistent and documented. |
| Type | E2E |

| Field | Value |
|-------|-------|
| TC ID | TC-AUTH-014 |
| Module | Authentication |
| Title | Password change flow |
| Priority | High |
| Preconditions | User is logged in |
| Steps | 1. Navigate to profile/change password. 2. Enter current password. 3. Enter new password meeting complexity requirements. 4. Confirm new password. 5. Submit. |
| Expected Result | Password is updated. All existing sessions are invalidated. User must re-login with new password. |
| Type | E2E |

| Field | Value |
|-------|-------|
| TC ID | TC-AUTH-015 |
| Module | Authentication |
| Title | Password change with incorrect current password |
| Priority | Medium |
| Preconditions | User is logged in |
| Steps | 1. Navigate to change password. 2. Enter incorrect current password. 3. Enter new password. 4. Submit. |
| Expected Result | Request is rejected with "Current password is incorrect." Password remains unchanged. |
| Type | E2E |

| Field | Value |
|-------|-------|
| TC ID | TC-AUTH-016 |
| Module | Authentication |
| Title | Force logout by Admin |
| Priority | High |
| Preconditions | Admin is logged in. Target user has an active session. |
| Steps | 1. Admin navigates to user management. 2. Selects target user. 3. Clicks "Force Logout." |
| Expected Result | Target user's refresh tokens are invalidated. On next API call, target user receives 401 and is redirected to login. |
| Type | E2E |

| Field | Value |
|-------|-------|
| TC ID | TC-AUTH-017 |
| Module | Authentication |
| Title | Login with empty email field |
| Priority | Medium |
| Preconditions | None |
| Steps | 1. Navigate to login page. 2. Leave email field empty. 3. Enter a password. 4. Click Login. |
| Expected Result | Client-side validation prevents submission. Error message "Email is required." |
| Type | E2E |

| Field | Value |
|-------|-------|
| TC ID | TC-AUTH-018 |
| Module | Authentication |
| Title | Login with empty password field |
| Priority | Medium |
| Preconditions | None |
| Steps | 1. Navigate to login page. 2. Enter valid email. 3. Leave password empty. 4. Click Login. |
| Expected Result | Client-side validation prevents submission. Error message "Password is required." |
| Type | E2E |

| Field | Value |
|-------|-------|
| TC ID | TC-AUTH-019 |
| Module | Authentication |
| Title | Logout clears tokens |
| Priority | High |
| Preconditions | User is logged in |
| Steps | 1. Click Logout. 2. Attempt to access a protected page. 3. Attempt to call a protected API endpoint with the old token. |
| Expected Result | Tokens are cleared from client storage. Protected pages redirect to login. API returns 401. |
| Type | E2E |

| Field | Value |
|-------|-------|
| TC ID | TC-AUTH-020 |
| Module | Authentication |
| Title | Brute force protection — multiple failed login attempts |
| Priority | High |
| Preconditions | Active user account |
| Steps | 1. Attempt login with wrong password 5 times in succession. |
| Expected Result | After threshold (e.g., 5 attempts), account is temporarily locked or rate-limited. Appropriate message displayed. |
| Type | Security |

---

## 2. User Management

| Field | Value |
|-------|-------|
| TC ID | TC-USER-001 |
| Module | User Management |
| Title | Create user with all required fields |
| Priority | Critical |
| Preconditions | Logged in as Admin |
| Steps | 1. Navigate to User Management. 2. Click "Add User." 3. Fill in name, email, phone, role, password. 4. Submit. |
| Expected Result | User is created successfully. Confirmation message displayed. User appears in user list. |
| Type | E2E |

| Field | Value |
|-------|-------|
| TC ID | TC-USER-002 |
| Module | User Management |
| Title | Create user with duplicate email |
| Priority | High |
| Preconditions | Logged in as Admin. A user with email test@binny.com already exists. |
| Steps | 1. Click "Add User." 2. Enter email test@binny.com. 3. Fill other fields. 4. Submit. |
| Expected Result | Creation is rejected with error "A user with this email already exists." |
| Type | Integration |

| Field | Value |
|-------|-------|
| TC ID | TC-USER-003 |
| Module | User Management |
| Title | Create user with missing required fields |
| Priority | Medium |
| Preconditions | Logged in as Admin |
| Steps | 1. Click "Add User." 2. Leave name blank. 3. Fill other fields. 4. Submit. |
| Expected Result | Validation error "Name is required." Form is not submitted. |
| Type | E2E |

| Field | Value |
|-------|-------|
| TC ID | TC-USER-004 |
| Module | User Management |
| Title | Update user role |
| Priority | High |
| Preconditions | Logged in as Admin. Target user exists. |
| Steps | 1. Navigate to User Management. 2. Select target user. 3. Change role from Warehouse Operator to Dispatch Operator. 4. Save. |
| Expected Result | Role is updated in database. On next login, user has new role permissions. |
| Type | Integration |

| Field | Value |
|-------|-------|
| TC ID | TC-USER-005 |
| Module | User Management |
| Title | Deactivate user |
| Priority | High |
| Preconditions | Logged in as Admin. Active user exists. |
| Steps | 1. Navigate to User Management. 2. Select user. 3. Click "Deactivate." 4. Confirm. |
| Expected Result | User status set to inactive. User cannot log in. Existing sessions are invalidated. |
| Type | E2E |

| Field | Value |
|-------|-------|
| TC ID | TC-USER-006 |
| Module | User Management |
| Title | Reactivate deactivated user |
| Priority | Medium |
| Preconditions | Logged in as Admin. Deactivated user exists. |
| Steps | 1. Navigate to User Management. 2. Filter by inactive users. 3. Select user. 4. Click "Activate." |
| Expected Result | User status set to active. User can log in again. |
| Type | E2E |

| Field | Value |
|-------|-------|
| TC ID | TC-USER-007 |
| Module | User Management |
| Title | List users with pagination |
| Priority | Medium |
| Preconditions | Logged in as Admin. More than 20 users exist. |
| Steps | 1. Navigate to User Management. 2. Observe first page shows default page size (e.g., 20). 3. Click next page. |
| Expected Result | Pagination works correctly. Page 2 shows subsequent users. Total count is accurate. |
| Type | E2E |

| Field | Value |
|-------|-------|
| TC ID | TC-USER-008 |
| Module | User Management |
| Title | Filter users by role |
| Priority | Medium |
| Preconditions | Logged in as Admin. Users with different roles exist. |
| Steps | 1. Navigate to User Management. 2. Select filter "Role = Warehouse Operator." |
| Expected Result | Only Warehouse Operator users are displayed. Count matches actual number. |
| Type | E2E |

| Field | Value |
|-------|-------|
| TC ID | TC-USER-009 |
| Module | User Management |
| Title | Non-admin cannot access user management |
| Priority | High |
| Preconditions | Logged in as Warehouse Operator |
| Steps | 1. Attempt to navigate to /admin/users. 2. Attempt to call POST /api/users directly. |
| Expected Result | UI denies access. API returns 403 Forbidden. |
| Type | Security |

| Field | Value |
|-------|-------|
| TC ID | TC-USER-010 |
| Module | User Management |
| Title | Admin cannot deactivate own account |
| Priority | Medium |
| Preconditions | Logged in as Admin |
| Steps | 1. Navigate to User Management. 2. Find own account. 3. Attempt to deactivate. |
| Expected Result | System prevents self-deactivation with message "You cannot deactivate your own account." |
| Type | E2E |

---

## 3. Product/SKU Management

| Field | Value |
|-------|-------|
| TC ID | TC-PROD-001 |
| Module | Product Management |
| Title | Create product with all required fields |
| Priority | Critical |
| Preconditions | Logged in as Admin |
| Steps | 1. Navigate to Product Management. 2. Click "Add Product." 3. Fill in SKU, article name, colour, size, MRP. 4. Submit. |
| Expected Result | Product is created. Appears in product list. All fields are stored correctly. |
| Type | E2E |

| Field | Value |
|-------|-------|
| TC ID | TC-PROD-002 |
| Module | Product Management |
| Title | Create product with duplicate SKU |
| Priority | High |
| Preconditions | Logged in as Admin. Product with SKU "BF-BLK-42" exists. |
| Steps | 1. Click "Add Product." 2. Enter SKU "BF-BLK-42." 3. Fill other fields. 4. Submit. |
| Expected Result | Creation rejected with error "SKU already exists." |
| Type | Integration |

| Field | Value |
|-------|-------|
| TC ID | TC-PROD-003 |
| Module | Product Management |
| Title | Update product details |
| Priority | High |
| Preconditions | Logged in as Admin. Product exists. |
| Steps | 1. Select product. 2. Update MRP from 999 to 1099. 3. Save. |
| Expected Result | Product MRP is updated. Change is reflected in product list. Existing child boxes retain their original MRP. |
| Type | Integration |

| Field | Value |
|-------|-------|
| TC ID | TC-PROD-004 |
| Module | Product Management |
| Title | Deactivate product |
| Priority | Medium |
| Preconditions | Logged in as Admin. Product exists with no active child boxes. |
| Steps | 1. Select product. 2. Click "Deactivate." 3. Confirm. |
| Expected Result | Product marked inactive. Cannot be used for new child box generation. Existing child boxes unaffected. |
| Type | E2E |

| Field | Value |
|-------|-------|
| TC ID | TC-PROD-005 |
| Module | Product Management |
| Title | List products filtered by article |
| Priority | Medium |
| Preconditions | Logged in as Admin. Multiple products with different articles exist. |
| Steps | 1. Navigate to Product Management. 2. Enter article filter "Sports Shoe." |
| Expected Result | Only products matching the article are displayed. |
| Type | E2E |

| Field | Value |
|-------|-------|
| TC ID | TC-PROD-006 |
| Module | Product Management |
| Title | List products filtered by colour |
| Priority | Medium |
| Preconditions | Multiple products exist with various colours. |
| Steps | 1. Navigate to Product Management. 2. Select colour filter "Black." |
| Expected Result | Only black-coloured products are displayed. |
| Type | E2E |

| Field | Value |
|-------|-------|
| TC ID | TC-PROD-007 |
| Module | Product Management |
| Title | List products filtered by size |
| Priority | Medium |
| Preconditions | Multiple products exist with various sizes. |
| Steps | 1. Navigate to Product Management. 2. Select size filter "42." |
| Expected Result | Only size-42 products are displayed. |
| Type | E2E |

| Field | Value |
|-------|-------|
| TC ID | TC-PROD-008 |
| Module | Product Management |
| Title | Create product with invalid MRP (negative value) |
| Priority | Medium |
| Preconditions | Logged in as Admin |
| Steps | 1. Click "Add Product." 2. Enter MRP as -100. 3. Fill other fields. 4. Submit. |
| Expected Result | Validation error: "MRP must be a positive number." |
| Type | E2E |

| Field | Value |
|-------|-------|
| TC ID | TC-PROD-009 |
| Module | Product Management |
| Title | Create product with empty SKU |
| Priority | Medium |
| Preconditions | Logged in as Admin |
| Steps | 1. Click "Add Product." 2. Leave SKU blank. 3. Fill other fields. 4. Submit. |
| Expected Result | Validation error: "SKU is required." |
| Type | E2E |

| Field | Value |
|-------|-------|
| TC ID | TC-PROD-010 |
| Module | Product Management |
| Title | Search products with combined filters |
| Priority | Medium |
| Preconditions | Various products exist |
| Steps | 1. Set article filter to "Sports Shoe." 2. Set colour to "Black." 3. Set size to "42." |
| Expected Result | Only products matching all three criteria are displayed. |
| Type | E2E |

---

## 4. Child Box QR Generation

| Field | Value |
|-------|-------|
| TC ID | TC-CB-001 |
| Module | Child Box QR |
| Title | Generate single child box QR |
| Priority | Critical |
| Preconditions | Logged in as Admin or Warehouse Operator. Product/SKU exists. |
| Steps | 1. Navigate to Child Box Generation. 2. Select product/SKU. 3. Enter quantity as 1. 4. Click Generate. |
| Expected Result | One child box record is created with a unique QR code. QR is displayable and downloadable. Status is FREE. |
| Type | E2E |

| Field | Value |
|-------|-------|
| TC ID | TC-CB-002 |
| Module | Child Box QR |
| Title | Bulk generate child boxes (100 at once) |
| Priority | Critical |
| Preconditions | Product/SKU exists |
| Steps | 1. Select product/SKU. 2. Enter quantity as 100. 3. Click Generate. |
| Expected Result | 100 child box records created, each with unique QR. All have status FREE. Operation completes within acceptable time. |
| Type | E2E |

| Field | Value |
|-------|-------|
| TC ID | TC-CB-003 |
| Module | Child Box QR |
| Title | Verify QR code uniqueness across all generated boxes |
| Priority | Critical |
| Preconditions | Multiple child boxes have been generated |
| Steps | 1. Generate 100 child boxes. 2. Query database for duplicate QR codes. |
| Expected Result | Zero duplicate QR codes exist. Each QR is globally unique. |
| Type | Integration |

| Field | Value |
|-------|-------|
| TC ID | TC-CB-004 |
| Module | Child Box QR |
| Title | Verify QR contains correct dynamic URL |
| Priority | High |
| Preconditions | Child box generated |
| Steps | 1. Generate a child box. 2. Decode the QR code content. 3. Verify URL format. |
| Expected Result | QR encodes a URL in the format: https://{domain}/qr/{child_box_id}. URL is valid and well-formed. |
| Type | Unit |

| Field | Value |
|-------|-------|
| TC ID | TC-CB-005 |
| Module | Child Box QR |
| Title | Verify QR URL redirects to company website for external scans |
| Priority | High |
| Preconditions | Child box generated |
| Steps | 1. Copy QR URL. 2. Open in a non-authenticated browser. |
| Expected Result | URL redirects to the company website or a product information page (not the internal app). |
| Type | E2E |

| Field | Value |
|-------|-------|
| TC ID | TC-CB-006 |
| Module | Child Box QR |
| Title | Print label in 40x60mm format |
| Priority | High |
| Preconditions | Child box generated |
| Steps | 1. Select child box. 2. Click "Print Label." 3. Verify output dimensions. |
| Expected Result | Label is formatted at 40x60mm. Contains QR code, SKU, article, colour, size, MRP, packing date. All text is legible. |
| Type | E2E |

| Field | Value |
|-------|-------|
| TC ID | TC-CB-007 |
| Module | Child Box QR |
| Title | Scan generated QR code and verify data returned |
| Priority | Critical |
| Preconditions | Child box generated |
| Steps | 1. Open the scanning module. 2. Scan the child box QR. |
| Expected Result | System returns child box details: ID, SKU, article, colour, size, MRP, packing date, current status (FREE). |
| Type | E2E |

| Field | Value |
|-------|-------|
| TC ID | TC-CB-008 |
| Module | Child Box QR |
| Title | Child box initial status is FREE |
| Priority | Critical |
| Preconditions | None |
| Steps | 1. Generate a child box. 2. Query the child box record in database. |
| Expected Result | Status field is "FREE." No carton association exists. |
| Type | Unit |

| Field | Value |
|-------|-------|
| TC ID | TC-CB-009 |
| Module | Child Box QR |
| Title | Child box fields populated correctly |
| Priority | High |
| Preconditions | Product "BF-BLK-42" exists with article "Sports Shoe", colour "Black", size "42", MRP 999 |
| Steps | 1. Generate child box for product "BF-BLK-42." 2. Check the child box record. |
| Expected Result | Fields match: sku=BF-BLK-42, article=Sports Shoe, colour=Black, size=42, mrp=999, packing_date=today. |
| Type | Integration |

| Field | Value |
|-------|-------|
| TC ID | TC-CB-010 |
| Module | Child Box QR |
| Title | Re-generate QR for existing child box should fail |
| Priority | High |
| Preconditions | Child box already exists with a permanent QR |
| Steps | 1. Attempt to call QR regeneration endpoint for existing child box ID. |
| Expected Result | Request is rejected. QR codes for child boxes are permanent and cannot be regenerated. Error: "Child box QR is permanent and cannot be regenerated." |
| Type | Integration |

| Field | Value |
|-------|-------|
| TC ID | TC-CB-011 |
| Module | Child Box QR |
| Title | Generate child boxes with quantity zero |
| Priority | Medium |
| Preconditions | Product exists |
| Steps | 1. Select product. 2. Enter quantity as 0. 3. Click Generate. |
| Expected Result | Validation error: "Quantity must be at least 1." |
| Type | E2E |

| Field | Value |
|-------|-------|
| TC ID | TC-CB-012 |
| Module | Child Box QR |
| Title | Generate child boxes with negative quantity |
| Priority | Medium |
| Preconditions | Product exists |
| Steps | 1. Select product. 2. Enter quantity as -5. 3. Click Generate. |
| Expected Result | Validation error: "Quantity must be a positive number." |
| Type | E2E |

| Field | Value |
|-------|-------|
| TC ID | TC-CB-013 |
| Module | Child Box QR |
| Title | Generate child boxes for deactivated product |
| Priority | Medium |
| Preconditions | Product exists but is deactivated |
| Steps | 1. Attempt to generate child boxes for deactivated product. |
| Expected Result | Rejected with error: "Cannot generate child boxes for inactive product." |
| Type | Integration |

| Field | Value |
|-------|-------|
| TC ID | TC-CB-014 |
| Module | Child Box QR |
| Title | Verify packing_date is auto-set to generation date |
| Priority | Medium |
| Preconditions | Product exists |
| Steps | 1. Generate child box on 2026-03-12. 2. Check packing_date field. |
| Expected Result | packing_date is set to 2026-03-12. |
| Type | Unit |

| Field | Value |
|-------|-------|
| TC ID | TC-CB-015 |
| Module | Child Box QR |
| Title | Bulk generate child boxes — verify all records created |
| Priority | High |
| Preconditions | Product exists |
| Steps | 1. Generate 50 child boxes. 2. Query database for count of child boxes created in this batch. |
| Expected Result | Exactly 50 records exist. No partial creation. |
| Type | Integration |

| Field | Value |
|-------|-------|
| TC ID | TC-CB-016 |
| Module | Child Box QR |
| Title | QR code is scannable at printed resolution |
| Priority | High |
| Preconditions | Child box label printed at 40x60mm |
| Steps | 1. Print label on thermal printer. 2. Scan printed QR with mobile device camera. |
| Expected Result | QR scans successfully and returns correct child box data. |
| Type | E2E |

| Field | Value |
|-------|-------|
| TC ID | TC-CB-017 |
| Module | Child Box QR |
| Title | Generate child boxes — large batch (500) |
| Priority | Medium |
| Preconditions | Product exists |
| Steps | 1. Enter quantity 500. 2. Click Generate. |
| Expected Result | All 500 child boxes generated. No timeout. All QRs unique. |
| Type | Integration |

| Field | Value |
|-------|-------|
| TC ID | TC-CB-018 |
| Module | Child Box QR |
| Title | Child box QR encodes child_box_id not product info |
| Priority | Medium |
| Preconditions | Child box generated |
| Steps | 1. Decode QR. 2. Verify it contains an identifier, not raw product data. |
| Expected Result | QR contains a URL with the child box ID. Product data is fetched server-side on scan. |
| Type | Unit |

| Field | Value |
|-------|-------|
| TC ID | TC-CB-019 |
| Module | Child Box QR |
| Title | Warehouse Operator can generate child box QR |
| Priority | High |
| Preconditions | Logged in as Warehouse Operator |
| Steps | 1. Navigate to Child Box Generation. 2. Generate a child box. |
| Expected Result | Generation succeeds. Warehouse Operator has permission for this action. |
| Type | E2E |

| Field | Value |
|-------|-------|
| TC ID | TC-CB-020 |
| Module | Child Box QR |
| Title | Dispatch Operator cannot generate child box QR |
| Priority | High |
| Preconditions | Logged in as Dispatch Operator |
| Steps | 1. Attempt to navigate to Child Box Generation. 2. Attempt API call POST /api/child-boxes/generate. |
| Expected Result | Access denied. 403 Forbidden. |
| Type | Security |

---

## 5. Master Carton Packing

| Field | Value |
|-------|-------|
| TC ID | TC-MC-001 |
| Module | Master Carton Packing |
| Title | Create master carton by scanning child boxes |
| Priority | Critical |
| Preconditions | Logged in as Warehouse Operator. Multiple FREE child boxes exist. |
| Steps | 1. Navigate to Packing module. 2. Scan 12 FREE child boxes one by one. 3. Click "Create Master Carton." |
| Expected Result | Master carton is created. All 12 child boxes are linked. Master carton QR is generated. |
| Type | E2E |

| Field | Value |
|-------|-------|
| TC ID | TC-MC-002 |
| Module | Master Carton Packing |
| Title | Scan child box with status FREE — accepted |
| Priority | Critical |
| Preconditions | Child box exists with status FREE |
| Steps | 1. In packing module, scan the FREE child box QR. |
| Expected Result | Child box is added to the scan list. Its details (SKU, size, colour) are displayed. |
| Type | E2E |

| Field | Value |
|-------|-------|
| TC ID | TC-MC-003 |
| Module | Master Carton Packing |
| Title | Scan child box already PACKED in another active carton — REJECTED |
| Priority | Critical |
| Preconditions | Child box is currently PACKED in Master Carton MC-001 |
| Steps | 1. In packing module, scan the PACKED child box QR. |
| Expected Result | Scan is rejected with error: "Child box is already packed in carton MC-001." Box is not added to scan list. |
| Type | E2E |

| Field | Value |
|-------|-------|
| TC ID | TC-MC-004 |
| Module | Master Carton Packing |
| Title | Scan child box with status DISPATCHED — REJECTED |
| Priority | Critical |
| Preconditions | Child box has been dispatched |
| Steps | 1. In packing module, scan the DISPATCHED child box QR. |
| Expected Result | Scan is rejected with error: "Child box has been dispatched and cannot be packed." |
| Type | E2E |

| Field | Value |
|-------|-------|
| TC ID | TC-MC-005 |
| Module | Master Carton Packing |
| Title | Create master carton with mixed sizes and colours |
| Priority | High |
| Preconditions | FREE child boxes of different sizes and colours exist |
| Steps | 1. Scan 4 child boxes size 40 Black. 2. Scan 4 child boxes size 42 Brown. 3. Scan 4 child boxes size 44 Black. 4. Create master carton. |
| Expected Result | Master carton created successfully. Assortment summary correctly shows the size/colour breakdown. |
| Type | E2E |

| Field | Value |
|-------|-------|
| TC ID | TC-MC-006 |
| Module | Master Carton Packing |
| Title | Master carton QR generated after creation |
| Priority | Critical |
| Preconditions | Master carton just created |
| Steps | 1. Create master carton. 2. Verify QR code is generated. 3. Scan the master carton QR. |
| Expected Result | A dynamic QR code is generated for the master carton. Scanning it returns carton details. |
| Type | Integration |

| Field | Value |
|-------|-------|
| TC ID | TC-MC-007 |
| Module | Master Carton Packing |
| Title | Master carton status is ACTIVE after creation |
| Priority | Critical |
| Preconditions | Master carton just created |
| Steps | 1. Create master carton. 2. Query carton status. |
| Expected Result | Carton status is "ACTIVE." |
| Type | Unit |

| Field | Value |
|-------|-------|
| TC ID | TC-MC-008 |
| Module | Master Carton Packing |
| Title | All child boxes status changed to PACKED after carton creation |
| Priority | Critical |
| Preconditions | Master carton created with 12 child boxes |
| Steps | 1. Create master carton. 2. Query all 12 child boxes. |
| Expected Result | All 12 child boxes have status "PACKED." Each references the new master carton. |
| Type | Integration |

| Field | Value |
|-------|-------|
| TC ID | TC-MC-009 |
| Module | Master Carton Packing |
| Title | Assortment summary calculated correctly |
| Priority | High |
| Preconditions | Master carton created with known size distribution |
| Steps | 1. Create carton with: 3x size 40, 4x size 42, 5x size 44. 2. View carton details. |
| Expected Result | Assortment summary shows: Size 40: 3 pairs, Size 42: 4 pairs, Size 44: 5 pairs. Total: 12 pairs. |
| Type | Integration |

| Field | Value |
|-------|-------|
| TC ID | TC-MC-010 |
| Module | Master Carton Packing |
| Title | Total pairs count matches scanned boxes |
| Priority | Critical |
| Preconditions | Carton created with 12 child boxes |
| Steps | 1. View carton details. 2. Check total_pairs field. |
| Expected Result | total_pairs = 12 (1 pair per child box). |
| Type | Unit |

| Field | Value |
|-------|-------|
| TC ID | TC-MC-011 |
| Module | Master Carton Packing |
| Title | Master carton label contains all required fields |
| Priority | High |
| Preconditions | Master carton created |
| Steps | 1. View/print master carton label. 2. Verify contents. |
| Expected Result | Label contains: carton_id, QR code, total_pairs, size breakdown per line. All text is legible. |
| Type | E2E |

| Field | Value |
|-------|-------|
| TC ID | TC-MC-012 |
| Module | Master Carton Packing |
| Title | Carton-child mapping records created correctly |
| Priority | Critical |
| Preconditions | Master carton created with 12 child boxes |
| Steps | 1. Query carton_child_mapping table for this carton. |
| Expected Result | 12 mapping records exist. Each has: carton_id, child_box_id, is_active=true, linked_at=creation timestamp, unlinked_at=null. |
| Type | Integration |

| Field | Value |
|-------|-------|
| TC ID | TC-MC-013 |
| Module | Master Carton Packing |
| Title | Inventory transaction logged as PACK |
| Priority | High |
| Preconditions | Master carton created |
| Steps | 1. Query inventory_transactions table. |
| Expected Result | A transaction with type "PACK" exists, referencing carton_id, user_id, timestamp, and count of child boxes. |
| Type | Integration |

| Field | Value |
|-------|-------|
| TC ID | TC-MC-014 |
| Module | Master Carton Packing |
| Title | Audit log entry created for packing |
| Priority | High |
| Preconditions | Master carton created |
| Steps | 1. Query audit_logs table. |
| Expected Result | Audit entry exists with action "PACK", carton_id, user_id, timestamp, and details of the operation. |
| Type | Integration |

| Field | Value |
|-------|-------|
| TC ID | TC-MC-015 |
| Module | Master Carton Packing |
| Title | Remove child box from scan list before creating carton |
| Priority | High |
| Preconditions | 5 child boxes scanned into the session |
| Steps | 1. Scan 5 child boxes. 2. Remove the 3rd child box from the scan list. 3. Create master carton. |
| Expected Result | Master carton is created with 4 child boxes. The removed child box remains FREE. |
| Type | E2E |

| Field | Value |
|-------|-------|
| TC ID | TC-MC-016 |
| Module | Master Carton Packing |
| Title | Create carton with 0 child boxes — REJECTED |
| Priority | High |
| Preconditions | In packing module, no child boxes scanned |
| Steps | 1. Without scanning any child boxes, click "Create Master Carton." |
| Expected Result | Rejected with error: "At least one child box is required to create a master carton." |
| Type | E2E |

| Field | Value |
|-------|-------|
| TC ID | TC-MC-017 |
| Module | Master Carton Packing |
| Title | Scan same child box twice in same session — duplicate prevented |
| Priority | High |
| Preconditions | In packing module, one child box already scanned |
| Steps | 1. Scan child box CB-001. 2. Scan child box CB-001 again. |
| Expected Result | System warns "Child box CB-001 is already in the scan list." Duplicate is not added. |
| Type | E2E |

| Field | Value |
|-------|-------|
| TC ID | TC-MC-018 |
| Module | Master Carton Packing |
| Title | Packing operation is atomic — all or nothing |
| Priority | Critical |
| Preconditions | 10 child boxes scanned |
| Steps | 1. Scan 10 boxes. 2. Simulate a database error during carton creation (e.g., one child box concurrently packed by another user). |
| Expected Result | Entire operation rolls back. No master carton created. All child boxes remain in their previous state. Error message displayed. |
| Type | Integration |

| Field | Value |
|-------|-------|
| TC ID | TC-MC-019 |
| Module | Master Carton Packing |
| Title | Master carton ID is auto-generated and unique |
| Priority | High |
| Preconditions | None |
| Steps | 1. Create two master cartons in sequence. 2. Compare their IDs. |
| Expected Result | Each carton has a unique ID following the system's ID format. |
| Type | Unit |

| Field | Value |
|-------|-------|
| TC ID | TC-MC-020 |
| Module | Master Carton Packing |
| Title | Scan session displays running assortment summary |
| Priority | Medium |
| Preconditions | In packing module |
| Steps | 1. Scan child boxes of varying sizes. 2. Observe the session UI. |
| Expected Result | Running summary shows size/colour breakdown updating in real-time as boxes are scanned. |
| Type | E2E |

| Field | Value |
|-------|-------|
| TC ID | TC-MC-021 |
| Module | Master Carton Packing |
| Title | Dispatch Operator cannot create master carton |
| Priority | High |
| Preconditions | Logged in as Dispatch Operator |
| Steps | 1. Attempt to access packing module. |
| Expected Result | Access denied. 403 Forbidden. |
| Type | Security |

| Field | Value |
|-------|-------|
| TC ID | TC-MC-022 |
| Module | Master Carton Packing |
| Title | Supervisor cannot create master carton (view-only) |
| Priority | High |
| Preconditions | Logged in as Supervisor |
| Steps | 1. Attempt to access packing module write operations. |
| Expected Result | Read access may be permitted. Write/create actions return 403. |
| Type | Security |

| Field | Value |
|-------|-------|
| TC ID | TC-MC-023 |
| Module | Master Carton Packing |
| Title | Create carton with single child box |
| Priority | Medium |
| Preconditions | One FREE child box exists |
| Steps | 1. Scan 1 child box. 2. Create master carton. |
| Expected Result | Master carton created with 1 child box. total_pairs = 1. |
| Type | E2E |

| Field | Value |
|-------|-------|
| TC ID | TC-MC-024 |
| Module | Master Carton Packing |
| Title | Create carton with large number of child boxes (100) |
| Priority | Medium |
| Preconditions | 100 FREE child boxes exist |
| Steps | 1. Scan 100 child boxes. 2. Create master carton. |
| Expected Result | Master carton created successfully with 100 child boxes. No performance issues. |
| Type | E2E |

| Field | Value |
|-------|-------|
| TC ID | TC-MC-025 |
| Module | Master Carton Packing |
| Title | Cancel packing session without creating carton |
| Priority | Medium |
| Preconditions | Several child boxes scanned in session |
| Steps | 1. Scan 5 child boxes. 2. Click "Cancel" or navigate away. |
| Expected Result | No master carton created. All child boxes remain FREE. Session data is discarded. |
| Type | E2E |

---

## 6. Storage Workflow

| Field | Value |
|-------|-------|
| TC ID | TC-STORE-001 |
| Module | Storage |
| Title | Scan ACTIVE master carton — view details |
| Priority | High |
| Preconditions | ACTIVE master carton exists |
| Steps | 1. Navigate to storage/scan module. 2. Scan master carton QR. |
| Expected Result | Displays carton details: carton_id, status (ACTIVE), total_pairs, size/colour breakdown, product info. |
| Type | E2E |

| Field | Value |
|-------|-------|
| TC ID | TC-STORE-002 |
| Module | Storage |
| Title | Scan CLOSED master carton — view details with closed status |
| Priority | High |
| Preconditions | CLOSED master carton exists (after unpack) |
| Steps | 1. Scan master carton QR. |
| Expected Result | Displays carton details with status "CLOSED." Shows historical data of what was in the carton. |
| Type | E2E |

| Field | Value |
|-------|-------|
| TC ID | TC-STORE-003 |
| Module | Storage |
| Title | Scan DISPATCHED master carton — view details with dispatched status |
| Priority | High |
| Preconditions | DISPATCHED master carton exists |
| Steps | 1. Scan master carton QR. |
| Expected Result | Displays carton details with status "DISPATCHED." Shows dispatch info: party name, invoice number, date. |
| Type | E2E |

| Field | Value |
|-------|-------|
| TC ID | TC-STORE-004 |
| Module | Storage |
| Title | Scan child box — view individual box details |
| Priority | High |
| Preconditions | Child box exists |
| Steps | 1. Scan child box QR in storage module. |
| Expected Result | Displays child box details: ID, SKU, article, colour, size, MRP, status, current carton (if packed). |
| Type | E2E |

| Field | Value |
|-------|-------|
| TC ID | TC-STORE-005 |
| Module | Storage |
| Title | Storage view shows quantity and assortment for active carton |
| Priority | High |
| Preconditions | ACTIVE carton with known contents |
| Steps | 1. Scan carton. 2. Verify quantity display. 3. Verify assortment breakdown. |
| Expected Result | Quantity matches total child boxes. Assortment correctly breaks down by size and colour. |
| Type | E2E |

| Field | Value |
|-------|-------|
| TC ID | TC-STORE-006 |
| Module | Storage |
| Title | Storage view shows product breakdown |
| Priority | Medium |
| Preconditions | ACTIVE carton with mixed products |
| Steps | 1. Scan carton containing child boxes from different products. |
| Expected Result | Product breakdown shows each product with its respective count. |
| Type | E2E |

| Field | Value |
|-------|-------|
| TC ID | TC-STORE-007 |
| Module | Storage |
| Title | Scan invalid QR in storage module |
| Priority | Medium |
| Preconditions | None |
| Steps | 1. Scan a QR code that is not from this system. |
| Expected Result | Error message: "QR code not recognized." |
| Type | E2E |

| Field | Value |
|-------|-------|
| TC ID | TC-STORE-008 |
| Module | Storage |
| Title | Inventory count reflects current stock |
| Priority | High |
| Preconditions | Known number of active cartons and free child boxes |
| Steps | 1. Navigate to inventory overview. 2. Compare displayed counts with database. |
| Expected Result | Displayed counts match database: active cartons, total packed pairs, free child boxes. |
| Type | Integration |

| Field | Value |
|-------|-------|
| TC ID | TC-STORE-009 |
| Module | Storage |
| Title | Storage scan by Supervisor (view-only role) |
| Priority | Medium |
| Preconditions | Logged in as Supervisor |
| Steps | 1. Navigate to storage module. 2. Scan a carton. |
| Expected Result | Supervisor can view carton details (read access permitted). |
| Type | E2E |

| Field | Value |
|-------|-------|
| TC ID | TC-STORE-010 |
| Module | Storage |
| Title | Scan master carton shows list of all child boxes inside |
| Priority | Medium |
| Preconditions | ACTIVE carton with 12 child boxes |
| Steps | 1. Scan carton. 2. Expand child box list. |
| Expected Result | All 12 child boxes listed with their individual details (ID, SKU, size, colour). |
| Type | E2E |

---

## 7. Unpack Workflow

| Field | Value |
|-------|-------|
| TC ID | TC-UNPACK-001 |
| Module | Unpack |
| Title | Unpack ACTIVE master carton — success |
| Priority | Critical |
| Preconditions | ACTIVE master carton exists with 12 child boxes |
| Steps | 1. Navigate to Unpack module. 2. Scan ACTIVE master carton QR. 3. Confirm unpack action. |
| Expected Result | Unpack succeeds. Confirmation message displayed. |
| Type | E2E |

| Field | Value |
|-------|-------|
| TC ID | TC-UNPACK-002 |
| Module | Unpack |
| Title | Carton status changes to CLOSED after unpack |
| Priority | Critical |
| Preconditions | Carton just unpacked |
| Steps | 1. Unpack carton. 2. Query carton status. |
| Expected Result | Carton status is "CLOSED." |
| Type | Integration |

| Field | Value |
|-------|-------|
| TC ID | TC-UNPACK-003 |
| Module | Unpack |
| Title | All child boxes status changed to FREE after unpack |
| Priority | Critical |
| Preconditions | Carton with 12 child boxes just unpacked |
| Steps | 1. Unpack carton. 2. Query all 12 child boxes. |
| Expected Result | All 12 child boxes have status "FREE." |
| Type | Integration |

| Field | Value |
|-------|-------|
| TC ID | TC-UNPACK-004 |
| Module | Unpack |
| Title | carton_child_mapping.is_active set to false |
| Priority | Critical |
| Preconditions | Carton just unpacked |
| Steps | 1. Unpack carton. 2. Query carton_child_mapping for this carton. |
| Expected Result | All mapping records have is_active = false. |
| Type | Integration |

| Field | Value |
|-------|-------|
| TC ID | TC-UNPACK-005 |
| Module | Unpack |
| Title | carton_child_mapping.unlinked_at set to unpack timestamp |
| Priority | High |
| Preconditions | Carton just unpacked |
| Steps | 1. Unpack carton. 2. Query carton_child_mapping. |
| Expected Result | All mapping records have unlinked_at set to the unpack timestamp. |
| Type | Integration |

| Field | Value |
|-------|-------|
| TC ID | TC-UNPACK-006 |
| Module | Unpack |
| Title | Inventory transaction logged as UNPACK |
| Priority | High |
| Preconditions | Carton just unpacked |
| Steps | 1. Query inventory_transactions table. |
| Expected Result | Transaction with type "UNPACK" exists, referencing carton_id, user_id, timestamp. |
| Type | Integration |

| Field | Value |
|-------|-------|
| TC ID | TC-UNPACK-007 |
| Module | Unpack |
| Title | Audit log entry created for unpack |
| Priority | High |
| Preconditions | Carton just unpacked |
| Steps | 1. Query audit_logs table. |
| Expected Result | Audit entry with action "UNPACK", carton_id, user_id, timestamp. |
| Type | Integration |

| Field | Value |
|-------|-------|
| TC ID | TC-UNPACK-008 |
| Module | Unpack |
| Title | Unpack already CLOSED carton — REJECTED |
| Priority | Critical |
| Preconditions | Carton status is CLOSED |
| Steps | 1. Scan CLOSED carton in Unpack module. 2. Attempt unpack. |
| Expected Result | Rejected with error: "Cannot unpack. Carton is already closed." |
| Type | E2E |

| Field | Value |
|-------|-------|
| TC ID | TC-UNPACK-009 |
| Module | Unpack |
| Title | Unpack DISPATCHED carton — REJECTED |
| Priority | Critical |
| Preconditions | Carton status is DISPATCHED |
| Steps | 1. Scan DISPATCHED carton in Unpack module. 2. Attempt unpack. |
| Expected Result | Rejected with error: "Cannot unpack. Carton has been dispatched." |
| Type | E2E |

| Field | Value |
|-------|-------|
| TC ID | TC-UNPACK-010 |
| Module | Unpack |
| Title | Unpack CREATED carton (not yet ACTIVE) — REJECTED |
| Priority | High |
| Preconditions | Carton exists but is in an intermediate state (if applicable) |
| Steps | 1. Attempt to unpack carton that is not in ACTIVE status. |
| Expected Result | Rejected with error: "Only ACTIVE cartons can be unpacked." |
| Type | E2E |

| Field | Value |
|-------|-------|
| TC ID | TC-UNPACK-011 |
| Module | Unpack |
| Title | Partial unpack not allowed — full unpack only |
| Priority | Critical |
| Preconditions | ACTIVE carton with 12 child boxes |
| Steps | 1. Attempt to unpack only specific child boxes from the carton (if such an API exists). |
| Expected Result | System does not support partial unpack. All child boxes are unpacked together or the operation is rejected. |
| Type | Integration |

| Field | Value |
|-------|-------|
| TC ID | TC-UNPACK-012 |
| Module | Unpack |
| Title | After unpack, child boxes can be scanned for new carton |
| Priority | Critical |
| Preconditions | Child boxes freed after unpack |
| Steps | 1. Unpack carton MC-001. 2. Navigate to Packing module. 3. Scan one of the freed child boxes. |
| Expected Result | Child box is accepted (status FREE). Can be added to a new master carton. |
| Type | E2E |

| Field | Value |
|-------|-------|
| TC ID | TC-UNPACK-013 |
| Module | Unpack |
| Title | Carton cannot be reused or re-activated after unpack |
| Priority | High |
| Preconditions | Carton has been unpacked (status CLOSED) |
| Steps | 1. Attempt to add child boxes to the closed carton. 2. Attempt to change status back to ACTIVE via API. |
| Expected Result | Both operations are rejected. Closed cartons cannot be reused. |
| Type | Integration |

| Field | Value |
|-------|-------|
| TC ID | TC-UNPACK-014 |
| Module | Unpack |
| Title | Unpack operation is atomic |
| Priority | High |
| Preconditions | ACTIVE carton with 12 child boxes |
| Steps | 1. Simulate failure mid-unpack (e.g., DB error after updating 6 of 12 child boxes). |
| Expected Result | Entire operation rolls back. Carton stays ACTIVE. All 12 child boxes stay PACKED. |
| Type | Integration |

| Field | Value |
|-------|-------|
| TC ID | TC-UNPACK-015 |
| Module | Unpack |
| Title | Unpack requires confirmation step |
| Priority | Medium |
| Preconditions | ACTIVE carton scanned in unpack module |
| Steps | 1. Scan carton. 2. View carton details. 3. Observe confirmation dialog. |
| Expected Result | System shows carton contents and asks for confirmation before proceeding with unpack. |
| Type | E2E |

| Field | Value |
|-------|-------|
| TC ID | TC-UNPACK-016 |
| Module | Unpack |
| Title | Dispatch Operator cannot unpack |
| Priority | High |
| Preconditions | Logged in as Dispatch Operator |
| Steps | 1. Attempt to access Unpack module. |
| Expected Result | Access denied. 403 Forbidden. |
| Type | Security |

| Field | Value |
|-------|-------|
| TC ID | TC-UNPACK-017 |
| Module | Unpack |
| Title | Inventory counts updated after unpack |
| Priority | High |
| Preconditions | Known inventory state before unpack |
| Steps | 1. Note active carton count and free child box count. 2. Unpack one carton with 12 boxes. 3. Check counts. |
| Expected Result | Active cartons decreased by 1. Free child boxes increased by 12. |
| Type | Integration |

| Field | Value |
|-------|-------|
| TC ID | TC-UNPACK-018 |
| Module | Unpack |
| Title | Unpack carton and verify master carton QR now shows CLOSED |
| Priority | Medium |
| Preconditions | Carton just unpacked |
| Steps | 1. Scan the master carton QR in storage module. |
| Expected Result | Status shows CLOSED. Historical contents are visible. |
| Type | E2E |

| Field | Value |
|-------|-------|
| TC ID | TC-UNPACK-019 |
| Module | Unpack |
| Title | Warehouse Operator can perform unpack |
| Priority | High |
| Preconditions | Logged in as Warehouse Operator |
| Steps | 1. Navigate to Unpack module. 2. Scan ACTIVE carton. 3. Confirm unpack. |
| Expected Result | Unpack succeeds. Warehouse Operator has permission. |
| Type | E2E |

| Field | Value |
|-------|-------|
| TC ID | TC-UNPACK-020 |
| Module | Unpack |
| Title | Admin can perform unpack |
| Priority | Medium |
| Preconditions | Logged in as Admin |
| Steps | 1. Navigate to Unpack module. 2. Perform unpack. |
| Expected Result | Unpack succeeds. Admin has full access. |
| Type | E2E |

---

## 8. Repack Workflow

| Field | Value |
|-------|-------|
| TC ID | TC-REPACK-001 |
| Module | Repack |
| Title | Scan FREE child boxes (previously unpacked) and create new master carton |
| Priority | Critical |
| Preconditions | Child boxes freed from carton MC-001 after unpack |
| Steps | 1. Navigate to Packing module. 2. Scan previously unpacked FREE child boxes. 3. Create master carton. |
| Expected Result | New master carton MC-002 is created. Child boxes are now PACKED in MC-002. |
| Type | E2E |

| Field | Value |
|-------|-------|
| TC ID | TC-REPACK-002 |
| Module | Repack |
| Title | New master carton gets a new QR code |
| Priority | Critical |
| Preconditions | Repack just performed |
| Steps | 1. Compare QR of MC-001 (old carton) with MC-002 (new carton). |
| Expected Result | MC-002 has a different, newly generated QR code. MC-001's QR still resolves to the closed carton. |
| Type | Integration |

| Field | Value |
|-------|-------|
| TC ID | TC-REPACK-003 |
| Module | Repack |
| Title | Lineage tracked — child box history shows carton A then carton B |
| Priority | Critical |
| Preconditions | Child box was in MC-001, unpacked, now in MC-002 |
| Steps | 1. Query traceability API for the child box. |
| Expected Result | History shows: Packed in MC-001 → Unpacked from MC-001 → Packed in MC-002. With timestamps and user IDs. |
| Type | Integration |

| Field | Value |
|-------|-------|
| TC ID | TC-REPACK-004 |
| Module | Repack |
| Title | Traceability API returns full history for repacked child box |
| Priority | Critical |
| Preconditions | Child box has been through pack → unpack → repack cycle |
| Steps | 1. Call GET /api/child-boxes/{id}/history. |
| Expected Result | Response contains ordered list of events: PACK (MC-001), UNPACK (MC-001), PACK (MC-002) with timestamps and operators. |
| Type | Integration |

| Field | Value |
|-------|-------|
| TC ID | TC-REPACK-005 |
| Module | Repack |
| Title | Multiple repack cycles — A then unpack then B then unpack then C |
| Priority | High |
| Preconditions | Child box exists |
| Steps | 1. Pack into MC-A. 2. Unpack from MC-A. 3. Pack into MC-B. 4. Unpack from MC-B. 5. Pack into MC-C. |
| Expected Result | All operations succeed. History shows complete chain: MC-A → unpack → MC-B → unpack → MC-C. |
| Type | E2E |

| Field | Value |
|-------|-------|
| TC ID | TC-REPACK-006 |
| Module | Repack |
| Title | Inventory transactions logged for each repack |
| Priority | High |
| Preconditions | Repack performed |
| Steps | 1. Query inventory_transactions. |
| Expected Result | PACK transaction logged for new carton. Distinct from the original PACK transaction. |
| Type | Integration |

| Field | Value |
|-------|-------|
| TC ID | TC-REPACK-007 |
| Module | Repack |
| Title | Cannot repack child boxes that are currently PACKED |
| Priority | Critical |
| Preconditions | Child box is PACKED in an active carton |
| Steps | 1. Attempt to scan PACKED child box for a new carton. |
| Expected Result | Rejected with error: "Child box is currently packed in carton MC-XXX. Unpack first." |
| Type | E2E |

| Field | Value |
|-------|-------|
| TC ID | TC-REPACK-008 |
| Module | Repack |
| Title | Mix previously unpacked and fresh child boxes in one carton |
| Priority | Medium |
| Preconditions | Some FREE child boxes from unpack, some newly generated FREE child boxes |
| Steps | 1. Scan 5 previously unpacked boxes. 2. Scan 5 freshly generated boxes. 3. Create carton. |
| Expected Result | Master carton created with all 10 boxes. Both groups have status PACKED. |
| Type | E2E |

| Field | Value |
|-------|-------|
| TC ID | TC-REPACK-009 |
| Module | Repack |
| Title | Old carton mapping records preserved after repack |
| Priority | High |
| Preconditions | Child box repacked from MC-A to MC-B |
| Steps | 1. Query carton_child_mapping for MC-A. |
| Expected Result | MC-A mapping still exists with is_active=false, unlinked_at set. MC-B mapping has is_active=true. Both records preserved for traceability. |
| Type | Integration |

| Field | Value |
|-------|-------|
| TC ID | TC-REPACK-010 |
| Module | Repack |
| Title | Audit logs capture repack event |
| Priority | Medium |
| Preconditions | Repack performed |
| Steps | 1. Query audit_logs. |
| Expected Result | Audit entry for the new PACK action exists with reference to new carton. |
| Type | Integration |

| Field | Value |
|-------|-------|
| TC ID | TC-REPACK-011 |
| Module | Repack |
| Title | Repack preserves child box permanent QR |
| Priority | High |
| Preconditions | Child box repacked |
| Steps | 1. Scan the child box QR (same physical label). |
| Expected Result | Same QR resolves to the same child box. Now shows new carton association. QR did not change. |
| Type | E2E |

| Field | Value |
|-------|-------|
| TC ID | TC-REPACK-012 |
| Module | Repack |
| Title | Repack from multiple different old cartons into one new carton |
| Priority | Medium |
| Preconditions | Child boxes freed from MC-A and MC-B |
| Steps | 1. Unpack MC-A (6 boxes freed). 2. Unpack MC-B (6 boxes freed). 3. Scan 3 from MC-A and 3 from MC-B. 4. Create new carton MC-C. |
| Expected Result | MC-C created with 6 boxes from two different source cartons. All lineage tracked. |
| Type | E2E |

| Field | Value |
|-------|-------|
| TC ID | TC-REPACK-013 |
| Module | Repack |
| Title | Cannot repack DISPATCHED child boxes |
| Priority | Critical |
| Preconditions | Child box has status DISPATCHED |
| Steps | 1. Attempt to scan DISPATCHED child box in packing module. |
| Expected Result | Rejected: "Child box has been dispatched and cannot be repacked." |
| Type | E2E |

| Field | Value |
|-------|-------|
| TC ID | TC-REPACK-014 |
| Module | Repack |
| Title | Repack operation creates new carton_child_mapping entry |
| Priority | High |
| Preconditions | Child box repacked into new carton |
| Steps | 1. Query carton_child_mapping for the child box. |
| Expected Result | Two mapping records: one for old carton (inactive) and one for new carton (active). |
| Type | Integration |

| Field | Value |
|-------|-------|
| TC ID | TC-REPACK-015 |
| Module | Repack |
| Title | Stress test — repack cycle repeated 5 times |
| Priority | Low |
| Preconditions | Child box exists |
| Steps | 1. Pack → Unpack → Repack cycle repeated 5 times. |
| Expected Result | All operations succeed. History shows complete 5-cycle chain. No data corruption. |
| Type | Integration |

---

## 9. Dispatch Workflow

| Field | Value |
|-------|-------|
| TC ID | TC-DISPATCH-001 |
| Module | Dispatch |
| Title | Dispatch ACTIVE master carton — success |
| Priority | Critical |
| Preconditions | Logged in as Dispatch Operator. ACTIVE carton exists. |
| Steps | 1. Navigate to Dispatch module. 2. Scan ACTIVE master carton QR. 3. Enter party_name and invoice_number. 4. Confirm dispatch. |
| Expected Result | Dispatch succeeds. Confirmation displayed with dispatch details. |
| Type | E2E |

| Field | Value |
|-------|-------|
| TC ID | TC-DISPATCH-002 |
| Module | Dispatch |
| Title | Carton status changes to DISPATCHED |
| Priority | Critical |
| Preconditions | Carton just dispatched |
| Steps | 1. Query carton status. |
| Expected Result | Carton status is "DISPATCHED." |
| Type | Integration |

| Field | Value |
|-------|-------|
| TC ID | TC-DISPATCH-003 |
| Module | Dispatch |
| Title | All child boxes inside carton set to DISPATCHED |
| Priority | Critical |
| Preconditions | Carton with 12 child boxes just dispatched |
| Steps | 1. Query all 12 child boxes. |
| Expected Result | All 12 child boxes have status "DISPATCHED." |
| Type | Integration |

| Field | Value |
|-------|-------|
| TC ID | TC-DISPATCH-004 |
| Module | Dispatch |
| Title | Dispatch record created with party_name and invoice_number |
| Priority | Critical |
| Preconditions | Carton just dispatched with party_name="ABC Traders" and invoice_number="INV-2026-001" |
| Steps | 1. Query dispatch_records table. |
| Expected Result | Record exists with: carton_id, party_name="ABC Traders", invoice_number="INV-2026-001", dispatch_date=today, child_box_count=12. |
| Type | Integration |

| Field | Value |
|-------|-------|
| TC ID | TC-DISPATCH-005 |
| Module | Dispatch |
| Title | Inventory transaction logged as DISPATCH |
| Priority | High |
| Preconditions | Carton just dispatched |
| Steps | 1. Query inventory_transactions. |
| Expected Result | Transaction with type "DISPATCH" exists with carton_id, user_id, timestamp. |
| Type | Integration |

| Field | Value |
|-------|-------|
| TC ID | TC-DISPATCH-006 |
| Module | Dispatch |
| Title | Dispatch CLOSED carton — REJECTED |
| Priority | Critical |
| Preconditions | Carton status is CLOSED (unpacked) |
| Steps | 1. Scan CLOSED carton in Dispatch module. 2. Attempt dispatch. |
| Expected Result | Rejected with error: "Cannot dispatch. Carton is closed. Only ACTIVE cartons can be dispatched." |
| Type | E2E |

| Field | Value |
|-------|-------|
| TC ID | TC-DISPATCH-007 |
| Module | Dispatch |
| Title | Dispatch already DISPATCHED carton — REJECTED |
| Priority | Critical |
| Preconditions | Carton already dispatched |
| Steps | 1. Scan DISPATCHED carton in Dispatch module. 2. Attempt dispatch. |
| Expected Result | Rejected with error: "Carton has already been dispatched." |
| Type | E2E |

| Field | Value |
|-------|-------|
| TC ID | TC-DISPATCH-008 |
| Module | Dispatch |
| Title | Dispatch record captures child box count |
| Priority | High |
| Preconditions | Carton with 12 child boxes dispatched |
| Steps | 1. View dispatch record. |
| Expected Result | child_box_count field shows 12. |
| Type | Integration |

| Field | Value |
|-------|-------|
| TC ID | TC-DISPATCH-009 |
| Module | Dispatch |
| Title | Cannot unpack after dispatch |
| Priority | Critical |
| Preconditions | Carton has been dispatched |
| Steps | 1. Navigate to Unpack module. 2. Scan dispatched carton. 3. Attempt unpack. |
| Expected Result | Rejected: "Cannot unpack. Carton has been dispatched." |
| Type | E2E |

| Field | Value |
|-------|-------|
| TC ID | TC-DISPATCH-010 |
| Module | Dispatch |
| Title | Dispatched child boxes cannot be scanned for new carton |
| Priority | Critical |
| Preconditions | Child box has status DISPATCHED |
| Steps | 1. Navigate to Packing module. 2. Scan DISPATCHED child box. |
| Expected Result | Rejected: "Child box has been dispatched and cannot be packed." |
| Type | E2E |

| Field | Value |
|-------|-------|
| TC ID | TC-DISPATCH-011 |
| Module | Dispatch |
| Title | Dispatch without party_name — REJECTED |
| Priority | High |
| Preconditions | ACTIVE carton scanned in dispatch module |
| Steps | 1. Scan carton. 2. Leave party_name blank. 3. Enter invoice_number. 4. Submit. |
| Expected Result | Validation error: "Party name is required." |
| Type | E2E |

| Field | Value |
|-------|-------|
| TC ID | TC-DISPATCH-012 |
| Module | Dispatch |
| Title | Dispatch without invoice_number — REJECTED |
| Priority | High |
| Preconditions | ACTIVE carton scanned in dispatch module |
| Steps | 1. Scan carton. 2. Enter party_name. 3. Leave invoice_number blank. 4. Submit. |
| Expected Result | Validation error: "Invoice number is required." |
| Type | E2E |

| Field | Value |
|-------|-------|
| TC ID | TC-DISPATCH-013 |
| Module | Dispatch |
| Title | Dispatch multiple cartons to same party |
| Priority | Medium |
| Preconditions | Multiple ACTIVE cartons exist |
| Steps | 1. Dispatch carton MC-001 with party="ABC Traders", invoice="INV-001." 2. Dispatch carton MC-002 with party="ABC Traders", invoice="INV-001." |
| Expected Result | Both dispatches succeed. Both records reference same party and invoice. |
| Type | E2E |

| Field | Value |
|-------|-------|
| TC ID | TC-DISPATCH-014 |
| Module | Dispatch |
| Title | Audit log entry created for dispatch |
| Priority | High |
| Preconditions | Dispatch performed |
| Steps | 1. Query audit_logs. |
| Expected Result | Audit entry with action "DISPATCH", carton_id, user_id, party_name, invoice_number, timestamp. |
| Type | Integration |

| Field | Value |
|-------|-------|
| TC ID | TC-DISPATCH-015 |
| Module | Dispatch |
| Title | Dispatch date auto-captured |
| Priority | Medium |
| Preconditions | Dispatch performed on 2026-03-12 |
| Steps | 1. Check dispatch record. |
| Expected Result | dispatch_date is set to 2026-03-12 (server timestamp). |
| Type | Unit |

| Field | Value |
|-------|-------|
| TC ID | TC-DISPATCH-016 |
| Module | Dispatch |
| Title | Warehouse Operator cannot dispatch |
| Priority | High |
| Preconditions | Logged in as Warehouse Operator |
| Steps | 1. Attempt to access Dispatch module. |
| Expected Result | Access denied or dispatch action returns 403 Forbidden. |
| Type | Security |

| Field | Value |
|-------|-------|
| TC ID | TC-DISPATCH-017 |
| Module | Dispatch |
| Title | Admin can dispatch |
| Priority | Medium |
| Preconditions | Logged in as Admin |
| Steps | 1. Navigate to Dispatch module. 2. Dispatch an ACTIVE carton. |
| Expected Result | Dispatch succeeds. Admin has full access. |
| Type | E2E |

| Field | Value |
|-------|-------|
| TC ID | TC-DISPATCH-018 |
| Module | Dispatch |
| Title | Inventory counts updated after dispatch |
| Priority | High |
| Preconditions | Known inventory state before dispatch |
| Steps | 1. Note active carton count. 2. Dispatch one carton with 12 boxes. 3. Check counts. |
| Expected Result | Active cartons decreased by 1. Dispatched cartons increased by 1. Total packed pairs decreased by 12. |
| Type | Integration |

| Field | Value |
|-------|-------|
| TC ID | TC-DISPATCH-019 |
| Module | Dispatch |
| Title | Dispatch shows carton contents for verification before confirming |
| Priority | Medium |
| Preconditions | ACTIVE carton scanned |
| Steps | 1. Scan carton in dispatch module. 2. Review displayed info. |
| Expected Result | System shows carton contents (pairs, sizes, articles) for operator verification before dispatch confirmation. |
| Type | E2E |

| Field | Value |
|-------|-------|
| TC ID | TC-DISPATCH-020 |
| Module | Dispatch |
| Title | Dispatch operation is atomic |
| Priority | High |
| Preconditions | ACTIVE carton ready for dispatch |
| Steps | 1. Simulate DB failure during dispatch (e.g., after carton status updated but before child boxes updated). |
| Expected Result | Entire operation rolls back. Carton remains ACTIVE. Child boxes remain PACKED. |
| Type | Integration |

---

## 10. Traceability

| Field | Value |
|-------|-------|
| TC ID | TC-TRACE-001 |
| Module | Traceability |
| Title | Get full history of a child box |
| Priority | Critical |
| Preconditions | Child box has been through at least one lifecycle event |
| Steps | 1. Call GET /api/child-boxes/{id}/history. |
| Expected Result | Returns chronological list of all events for this child box. |
| Type | Integration |

| Field | Value |
|-------|-------|
| TC ID | TC-TRACE-002 |
| Module | Traceability |
| Title | History shows all cartons the child box was part of |
| Priority | Critical |
| Preconditions | Child box was in MC-A, unpacked, then in MC-B |
| Steps | 1. Get child box history. |
| Expected Result | History includes MC-A and MC-B with respective pack/unpack events. |
| Type | Integration |

| Field | Value |
|-------|-------|
| TC ID | TC-TRACE-003 |
| Module | Traceability |
| Title | History shows pack/unpack/repack/dispatch events with timestamps |
| Priority | Critical |
| Preconditions | Child box has been through full lifecycle |
| Steps | 1. Get child box history. |
| Expected Result | Each event has: event_type (PACK/UNPACK/DISPATCH), timestamp, carton_id. Events are in chronological order. |
| Type | Integration |

| Field | Value |
|-------|-------|
| TC ID | TC-TRACE-004 |
| Module | Traceability |
| Title | History shows which user performed each action |
| Priority | High |
| Preconditions | Child box events performed by different users |
| Steps | 1. Get child box history. |
| Expected Result | Each event includes user_id and user_name of the operator who performed the action. |
| Type | Integration |

| Field | Value |
|-------|-------|
| TC ID | TC-TRACE-005 |
| Module | Traceability |
| Title | Simple lifecycle traceability — pack then dispatch |
| Priority | High |
| Preconditions | Child box packed into MC-A, then MC-A dispatched |
| Steps | 1. Get child box history. |
| Expected Result | Two events: PACK (MC-A, timestamp1, user1) → DISPATCH (MC-A, timestamp2, user2). |
| Type | E2E |

| Field | Value |
|-------|-------|
| TC ID | TC-TRACE-006 |
| Module | Traceability |
| Title | Complex lifecycle traceability — pack, unpack, repack, unpack, repack, dispatch |
| Priority | Critical |
| Preconditions | Child box has been through: MC-A → unpack → MC-B → unpack → MC-C → dispatch |
| Steps | 1. Get child box history. |
| Expected Result | Six events in order: PACK(MC-A) → UNPACK(MC-A) → PACK(MC-B) → UNPACK(MC-B) → PACK(MC-C) → DISPATCH(MC-C). All with correct timestamps and users. |
| Type | E2E |

| Field | Value |
|-------|-------|
| TC ID | TC-TRACE-007 |
| Module | Traceability |
| Title | Get master carton history |
| Priority | High |
| Preconditions | Master carton has been created |
| Steps | 1. Call GET /api/cartons/{id}/history. |
| Expected Result | Returns carton creation event, all child boxes packed into it, and any subsequent unpack/dispatch event. |
| Type | Integration |

| Field | Value |
|-------|-------|
| TC ID | TC-TRACE-008 |
| Module | Traceability |
| Title | Traceability for newly generated child box (no events yet) |
| Priority | Medium |
| Preconditions | Child box just generated, status FREE |
| Steps | 1. Get child box history. |
| Expected Result | Returns creation/generation event only or empty event list with current status FREE. |
| Type | Integration |

| Field | Value |
|-------|-------|
| TC ID | TC-TRACE-009 |
| Module | Traceability |
| Title | Traceability for non-existent child box ID |
| Priority | Medium |
| Preconditions | None |
| Steps | 1. Call GET /api/child-boxes/INVALID_ID/history. |
| Expected Result | Returns 404: "Child box not found." |
| Type | Integration |

| Field | Value |
|-------|-------|
| TC ID | TC-TRACE-010 |
| Module | Traceability |
| Title | Traceability data accessible by Supervisor (read-only role) |
| Priority | Medium |
| Preconditions | Logged in as Supervisor |
| Steps | 1. Access traceability/history endpoint. |
| Expected Result | Data is returned successfully. Supervisors can view traceability data. |
| Type | Security |

---

## 11. Reporting

| Field | Value |
|-------|-------|
| TC ID | TC-REPORT-001 |
| Module | Reporting |
| Title | Stock by SKU report |
| Priority | High |
| Preconditions | Inventory exists with various SKUs |
| Steps | 1. Navigate to Reports. 2. Select "Stock by SKU." 3. Generate report. |
| Expected Result | Report shows each SKU with count of FREE, PACKED, and DISPATCHED child boxes. Totals are accurate. |
| Type | E2E |

| Field | Value |
|-------|-------|
| TC ID | TC-REPORT-002 |
| Module | Reporting |
| Title | Stock by size report |
| Priority | High |
| Preconditions | Inventory exists with various sizes |
| Steps | 1. Select "Stock by Size" report. 2. Generate. |
| Expected Result | Report groups stock by size with counts per status. |
| Type | E2E |

| Field | Value |
|-------|-------|
| TC ID | TC-REPORT-003 |
| Module | Reporting |
| Title | Stock by article report |
| Priority | High |
| Preconditions | Inventory exists with various articles |
| Steps | 1. Select "Stock by Article" report. 2. Generate. |
| Expected Result | Report groups stock by article name with counts per status. |
| Type | E2E |

| Field | Value |
|-------|-------|
| TC ID | TC-REPORT-004 |
| Module | Reporting |
| Title | Carton inventory report — active cartons with contents |
| Priority | High |
| Preconditions | Active cartons exist |
| Steps | 1. Select "Carton Inventory" report. 2. Generate. |
| Expected Result | Lists all ACTIVE cartons with: carton_id, total_pairs, article/size/colour breakdown, creation date. |
| Type | E2E |

| Field | Value |
|-------|-------|
| TC ID | TC-REPORT-005 |
| Module | Reporting |
| Title | Dispatch report with date range filter |
| Priority | High |
| Preconditions | Dispatches exist across multiple dates |
| Steps | 1. Select "Dispatch Report." 2. Set date range 2026-03-01 to 2026-03-12. 3. Generate. |
| Expected Result | Only dispatches within the date range are shown. Each entry shows: carton_id, party_name, invoice_number, dispatch_date, pairs count. |
| Type | E2E |

| Field | Value |
|-------|-------|
| TC ID | TC-REPORT-006 |
| Module | Reporting |
| Title | Carton history report |
| Priority | Medium |
| Preconditions | Cartons with various statuses exist |
| Steps | 1. Select "Carton History" report. 2. Generate. |
| Expected Result | Shows all cartons with their current status and lifecycle events. |
| Type | E2E |

| Field | Value |
|-------|-------|
| TC ID | TC-REPORT-007 |
| Module | Reporting |
| Title | Report filters work correctly — combine SKU and date |
| Priority | Medium |
| Preconditions | Inventory data exists |
| Steps | 1. Open stock report. 2. Filter by SKU "BF-BLK-42." 3. Filter by date range. |
| Expected Result | Only matching records are displayed. Filters are applied as AND conditions. |
| Type | E2E |

| Field | Value |
|-------|-------|
| TC ID | TC-REPORT-008 |
| Module | Reporting |
| Title | Report data matches actual inventory state |
| Priority | Critical |
| Preconditions | Known inventory: 50 FREE, 30 PACKED, 20 DISPATCHED for SKU "BF-BLK-42" |
| Steps | 1. Generate stock report for SKU "BF-BLK-42." 2. Compare with known state. |
| Expected Result | Report shows exactly: FREE=50, PACKED=30, DISPATCHED=20. |
| Type | Integration |

| Field | Value |
|-------|-------|
| TC ID | TC-REPORT-009 |
| Module | Reporting |
| Title | Export report to CSV/Excel |
| Priority | Medium |
| Preconditions | Report generated |
| Steps | 1. Generate any report. 2. Click "Export." |
| Expected Result | File downloads in CSV or Excel format. Data matches what is displayed on screen. |
| Type | E2E |

| Field | Value |
|-------|-------|
| TC ID | TC-REPORT-010 |
| Module | Reporting |
| Title | Empty report — no data for selected filters |
| Priority | Medium |
| Preconditions | No inventory matching filter criteria |
| Steps | 1. Generate stock report with filter that matches no records. |
| Expected Result | Report displays "No data found" or empty table. No errors. |
| Type | E2E |

| Field | Value |
|-------|-------|
| TC ID | TC-REPORT-011 |
| Module | Reporting |
| Title | Dispatch report filtered by party name |
| Priority | Medium |
| Preconditions | Dispatches to multiple parties exist |
| Steps | 1. Open dispatch report. 2. Filter by party_name "ABC Traders." |
| Expected Result | Only dispatches to ABC Traders are shown. |
| Type | E2E |

| Field | Value |
|-------|-------|
| TC ID | TC-REPORT-012 |
| Module | Reporting |
| Title | Supervisor can access all reports |
| Priority | High |
| Preconditions | Logged in as Supervisor |
| Steps | 1. Navigate to Reports module. 2. Generate various reports. |
| Expected Result | All reports are accessible and generate correctly. |
| Type | E2E |

| Field | Value |
|-------|-------|
| TC ID | TC-REPORT-013 |
| Module | Reporting |
| Title | Warehouse Operator report access (limited) |
| Priority | Medium |
| Preconditions | Logged in as Warehouse Operator |
| Steps | 1. Attempt to access reports. |
| Expected Result | Access per role definition — may have limited report access or no access. Consistent with role permissions. |
| Type | Security |

| Field | Value |
|-------|-------|
| TC ID | TC-REPORT-014 |
| Module | Reporting |
| Title | Report pagination for large datasets |
| Priority | Medium |
| Preconditions | Report returns 500+ rows |
| Steps | 1. Generate report with large dataset. 2. Navigate pagination. |
| Expected Result | Pagination works. Data loads without timeout. Page navigation is correct. |
| Type | E2E |

| Field | Value |
|-------|-------|
| TC ID | TC-REPORT-015 |
| Module | Reporting |
| Title | Report date range validation |
| Priority | Low |
| Preconditions | None |
| Steps | 1. Set end date before start date. 2. Generate report. |
| Expected Result | Validation error: "End date must be after start date." |
| Type | E2E |

---

## 12. QR Scanning

| Field | Value |
|-------|-------|
| TC ID | TC-SCAN-001 |
| Module | QR Scanning |
| Title | QR scan response time under 1 second |
| Priority | Critical |
| Preconditions | App running on mobile device with camera access |
| Steps | 1. Open scanning module. 2. Point camera at QR code. 3. Measure time from scan detection to data display. |
| Expected Result | Data is displayed within 1 second of QR detection. |
| Type | E2E |

| Field | Value |
|-------|-------|
| TC ID | TC-SCAN-002 |
| Module | QR Scanning |
| Title | Scan valid child box QR — data returned |
| Priority | Critical |
| Preconditions | Valid child box QR exists |
| Steps | 1. Scan child box QR. |
| Expected Result | Child box details returned: ID, SKU, article, colour, size, MRP, status, current carton. |
| Type | E2E |

| Field | Value |
|-------|-------|
| TC ID | TC-SCAN-003 |
| Module | QR Scanning |
| Title | Scan valid master carton QR — data returned |
| Priority | Critical |
| Preconditions | Valid master carton QR exists |
| Steps | 1. Scan master carton QR. |
| Expected Result | Carton details returned: ID, status, total_pairs, assortment, creation date. |
| Type | E2E |

| Field | Value |
|-------|-------|
| TC ID | TC-SCAN-004 |
| Module | QR Scanning |
| Title | Scan invalid/unknown QR — error message |
| Priority | High |
| Preconditions | None |
| Steps | 1. Scan a QR code not generated by this system (e.g., a random URL QR). |
| Expected Result | Error message: "QR code not recognized by this system." |
| Type | E2E |

| Field | Value |
|-------|-------|
| TC ID | TC-SCAN-005 |
| Module | QR Scanning |
| Title | Scan in low light conditions |
| Priority | Medium |
| Preconditions | Mobile device in dimly lit environment |
| Steps | 1. Open scanning module in low light. 2. Attempt to scan QR. |
| Expected Result | Camera activates flash/torch if available. QR is eventually scannable. Graceful handling if scan fails. |
| Type | E2E |

| Field | Value |
|-------|-------|
| TC ID | TC-SCAN-006 |
| Module | QR Scanning |
| Title | Camera permission handling — permission granted |
| Priority | High |
| Preconditions | First time accessing scan module on device |
| Steps | 1. Open scan module. 2. Grant camera permission when prompted. |
| Expected Result | Camera activates and scanning begins immediately. |
| Type | E2E |

| Field | Value |
|-------|-------|
| TC ID | TC-SCAN-007 |
| Module | QR Scanning |
| Title | Camera permission handling — permission denied |
| Priority | High |
| Preconditions | Camera permission denied or not granted |
| Steps | 1. Open scan module. 2. Deny camera permission. |
| Expected Result | Clear message: "Camera access is required for QR scanning. Please enable camera permissions in device settings." |
| Type | E2E |

| Field | Value |
|-------|-------|
| TC ID | TC-SCAN-008 |
| Module | QR Scanning |
| Title | Multiple rapid scans |
| Priority | Medium |
| Preconditions | Multiple QR codes available |
| Steps | 1. Scan QR-1. 2. Immediately scan QR-2. 3. Immediately scan QR-3. |
| Expected Result | Each scan is processed correctly. No dropped scans. No data crossover between scans. |
| Type | E2E |

| Field | Value |
|-------|-------|
| TC ID | TC-SCAN-009 |
| Module | QR Scanning |
| Title | Scan from different angles and distances |
| Priority | Low |
| Preconditions | Printed QR label |
| Steps | 1. Scan from directly above. 2. Scan at 45-degree angle. 3. Scan from 30cm distance. 4. Scan from 10cm distance. |
| Expected Result | QR is scannable from reasonable angles (up to ~45 degrees) and distances (10-50cm). |
| Type | E2E |

| Field | Value |
|-------|-------|
| TC ID | TC-SCAN-010 |
| Module | QR Scanning |
| Title | Scan damaged/partially obscured QR |
| Priority | Low |
| Preconditions | QR label with minor damage or smudge |
| Steps | 1. Attempt to scan partially damaged QR. |
| Expected Result | QR error correction allows scanning with minor damage. Severely damaged QR shows appropriate error. |
| Type | E2E |

---

## 13. PWA & Mobile

| Field | Value |
|-------|-------|
| TC ID | TC-PWA-001 |
| Module | PWA |
| Title | PWA installable on Android (Chrome) |
| Priority | High |
| Preconditions | Android device with Chrome browser |
| Steps | 1. Open app URL in Chrome. 2. Look for "Add to Home Screen" prompt or install option. 3. Install. |
| Expected Result | App installs to home screen with correct icon and name. |
| Type | E2E |

| Field | Value |
|-------|-------|
| TC ID | TC-PWA-002 |
| Module | PWA |
| Title | PWA installable on iOS (Safari) |
| Priority | High |
| Preconditions | iOS device with Safari browser |
| Steps | 1. Open app URL in Safari. 2. Tap Share → Add to Home Screen. 3. Confirm. |
| Expected Result | App appears on home screen with correct icon. Opens in standalone mode. |
| Type | E2E |

| Field | Value |
|-------|-------|
| TC ID | TC-PWA-003 |
| Module | PWA |
| Title | App works in standalone mode |
| Priority | High |
| Preconditions | PWA installed on device |
| Steps | 1. Launch app from home screen icon. |
| Expected Result | App opens without browser chrome (no address bar). Full-screen app experience. |
| Type | E2E |

| Field | Value |
|-------|-------|
| TC ID | TC-PWA-004 |
| Module | PWA |
| Title | Responsive layout on mobile devices |
| Priority | High |
| Preconditions | Various screen sizes |
| Steps | 1. Open app on small phone (320px width). 2. Open on standard phone (375px). 3. Open on tablet (768px). |
| Expected Result | Layout adapts correctly. No horizontal scrolling. All elements accessible. Text readable. |
| Type | E2E |

| Field | Value |
|-------|-------|
| TC ID | TC-PWA-005 |
| Module | PWA |
| Title | Touch-friendly UI elements |
| Priority | Medium |
| Preconditions | Mobile device |
| Steps | 1. Navigate through the app using touch only. 2. Tap buttons, links, scan areas. |
| Expected Result | All interactive elements have minimum 44x44px touch target. No accidental taps on adjacent elements. |
| Type | E2E |

| Field | Value |
|-------|-------|
| TC ID | TC-PWA-006 |
| Module | PWA |
| Title | Offline indication |
| Priority | Medium |
| Preconditions | Device connected to network |
| Steps | 1. Open app. 2. Disable network (airplane mode). 3. Observe app behavior. |
| Expected Result | App shows clear offline indicator (banner or icon). Graceful handling of offline state. |
| Type | E2E |

| Field | Value |
|-------|-------|
| TC ID | TC-PWA-007 |
| Module | PWA |
| Title | Service worker registration |
| Priority | Medium |
| Preconditions | App loaded in browser |
| Steps | 1. Open DevTools → Application → Service Workers. |
| Expected Result | Service worker is registered and active. Scope covers the app. |
| Type | Integration |

| Field | Value |
|-------|-------|
| TC ID | TC-PWA-008 |
| Module | PWA |
| Title | App manifest is valid |
| Priority | Medium |
| Preconditions | None |
| Steps | 1. Open DevTools → Application → Manifest. 2. Run Lighthouse PWA audit. |
| Expected Result | Manifest includes: name, short_name, start_url, display: standalone, icons in required sizes, theme_color. |
| Type | Unit |

| Field | Value |
|-------|-------|
| TC ID | TC-PWA-009 |
| Module | PWA |
| Title | App loads over HTTPS |
| Priority | High |
| Preconditions | Production deployment |
| Steps | 1. Access app URL. 2. Verify HTTPS. |
| Expected Result | App is served over HTTPS. HTTP redirects to HTTPS. |
| Type | Security |

| Field | Value |
|-------|-------|
| TC ID | TC-PWA-010 |
| Module | PWA |
| Title | Web dashboard responsive on desktop |
| Priority | Medium |
| Preconditions | Desktop browser |
| Steps | 1. Open app on desktop at 1920px width. 2. Resize to 1024px. |
| Expected Result | Dashboard layout adjusts properly. All modules accessible. No layout breaks. |
| Type | E2E |

---

## 14. Label Printing

| Field | Value |
|-------|-------|
| TC ID | TC-PRINT-001 |
| Module | Label Printing |
| Title | Child box label 40x60mm format |
| Priority | High |
| Preconditions | Child box generated, printer connected |
| Steps | 1. Select child box. 2. Print label. 3. Measure output. |
| Expected Result | Printed label dimensions are 40mm x 60mm. Content fits within margins. |
| Type | E2E |

| Field | Value |
|-------|-------|
| TC ID | TC-PRINT-002 |
| Module | Label Printing |
| Title | Master carton label with all required fields |
| Priority | High |
| Preconditions | Master carton created |
| Steps | 1. Print master carton label. 2. Verify contents. |
| Expected Result | Label contains: carton_id, QR code, total_pairs, size breakdown, article name. All readable. |
| Type | E2E |

| Field | Value |
|-------|-------|
| TC ID | TC-PRINT-003 |
| Module | Label Printing |
| Title | QR code scannable after printing |
| Priority | Critical |
| Preconditions | Label printed on thermal printer |
| Steps | 1. Print label. 2. Scan printed QR with mobile device. |
| Expected Result | QR scans correctly and returns the expected data. No degradation from printing. |
| Type | E2E |

| Field | Value |
|-------|-------|
| TC ID | TC-PRINT-004 |
| Module | Label Printing |
| Title | Bulk label printing (50 child box labels) |
| Priority | High |
| Preconditions | 50 child boxes generated |
| Steps | 1. Select 50 child boxes. 2. Click "Print All." |
| Expected Result | All 50 labels print in sequence. Each has correct data. No missing labels. |
| Type | E2E |

| Field | Value |
|-------|-------|
| TC ID | TC-PRINT-005 |
| Module | Label Printing |
| Title | Print preview accuracy |
| Priority | Medium |
| Preconditions | Child box selected for printing |
| Steps | 1. Click "Print Preview." 2. Compare preview with actual printed output. |
| Expected Result | Preview accurately represents the printed output — layout, text, QR position. |
| Type | E2E |

| Field | Value |
|-------|-------|
| TC ID | TC-PRINT-006 |
| Module | Label Printing |
| Title | TSC thermal printer compatibility |
| Priority | High |
| Preconditions | TSC thermal printer connected |
| Steps | 1. Configure printer as TSC model. 2. Print a child box label. 3. Print a master carton label. |
| Expected Result | Both labels print correctly on TSC printer. No formatting issues. QR is scannable. |
| Type | E2E |

| Field | Value |
|-------|-------|
| TC ID | TC-PRINT-007 |
| Module | Label Printing |
| Title | Print when no printer connected |
| Priority | Medium |
| Preconditions | No printer connected to device |
| Steps | 1. Click Print. |
| Expected Result | Error message: "No printer detected. Please connect a printer and try again." |
| Type | E2E |

| Field | Value |
|-------|-------|
| TC ID | TC-PRINT-008 |
| Module | Label Printing |
| Title | Child box label contains MRP |
| Priority | Medium |
| Preconditions | Child box with MRP 999 |
| Steps | 1. Print label. 2. Verify MRP on label. |
| Expected Result | MRP is printed as "MRP: Rs. 999" (or configured format). |
| Type | E2E |

| Field | Value |
|-------|-------|
| TC ID | TC-PRINT-009 |
| Module | Label Printing |
| Title | QR code size on label is adequate for scanning |
| Priority | High |
| Preconditions | Label printed |
| Steps | 1. Print label. 2. Measure QR code area. 3. Scan from 30cm. |
| Expected Result | QR code is at least 15x15mm on the label. Scannable from typical warehouse distance. |
| Type | E2E |

| Field | Value |
|-------|-------|
| TC ID | TC-PRINT-010 |
| Module | Label Printing |
| Title | Reprint label for existing child box |
| Priority | Medium |
| Preconditions | Child box exists |
| Steps | 1. Select existing child box. 2. Click "Reprint Label." |
| Expected Result | Same label is reprinted with same QR code (QR is permanent). No new QR generated. |
| Type | E2E |

---

## 15. Customer Master (NEW)

| Field | Value |
|-------|-------|
| TC ID | TC-CUST-001 |
| Module | Customer Master |
| Title | Create customer with all required fields |
| Priority | Critical |
| Preconditions | Logged in as Admin or Supervisor |
| Steps | 1. Navigate to Customer Management. 2. Click "Add Customer." 3. Fill firm name, address, delivery location, GSTIN, private marka, GR, contact person name, contact person mobile. 4. Submit. |
| Expected Result | Customer is created. Appears in customer list. All fields stored correctly. |
| Type | E2E |

| Field | Value |
|-------|-------|
| TC ID | TC-CUST-002 |
| Module | Customer Master |
| Title | Create customer with only firm name (minimal) |
| Priority | High |
| Preconditions | Logged in as Admin |
| Steps | 1. Click "Add Customer." 2. Enter only firm name. 3. Submit. |
| Expected Result | Customer created successfully. Optional fields are null/empty. |
| Type | Integration |

| Field | Value |
|-------|-------|
| TC ID | TC-CUST-003 |
| Module | Customer Master |
| Title | GSTIN format validation |
| Priority | High |
| Preconditions | Logged in as Admin |
| Steps | 1. Click "Add Customer." 2. Enter firm name. 3. Enter invalid GSTIN "ABC123". 4. Submit. |
| Expected Result | Validation error: "Invalid GSTIN format." GSTIN must match 15-char Indian GST format (e.g., 22AAAAA0000A1Z5). |
| Type | Integration |

| Field | Value |
|-------|-------|
| TC ID | TC-CUST-004 |
| Module | Customer Master |
| Title | Mobile number validation |
| Priority | Medium |
| Preconditions | Logged in as Admin |
| Steps | 1. Create customer with contact mobile "12345". 2. Submit. |
| Expected Result | Validation error: "Invalid mobile number." Must be 10-15 digits. |
| Type | Integration |

| Field | Value |
|-------|-------|
| TC ID | TC-CUST-005 |
| Module | Customer Master |
| Title | Update customer details |
| Priority | High |
| Preconditions | Customer exists |
| Steps | 1. Select customer. 2. Update delivery location. 3. Save. |
| Expected Result | Customer updated. Changes reflected in list and detail view. |
| Type | E2E |

| Field | Value |
|-------|-------|
| TC ID | TC-CUST-006 |
| Module | Customer Master |
| Title | Deactivate customer |
| Priority | Medium |
| Preconditions | Customer exists with no active dispatches |
| Steps | 1. Select customer. 2. Click "Deactivate." 3. Confirm. |
| Expected Result | Customer marked inactive. Does not appear in dispatch customer dropdown. |
| Type | E2E |

| Field | Value |
|-------|-------|
| TC ID | TC-CUST-007 |
| Module | Customer Master |
| Title | Cannot delete customer with existing dispatches |
| Priority | High |
| Preconditions | Customer has dispatch records linked to it |
| Steps | 1. Try to delete/deactivate customer. |
| Expected Result | Warning shown. Customer can be deactivated (soft delete) but not hard deleted. Existing dispatch records retain the link. |
| Type | Integration |

| Field | Value |
|-------|-------|
| TC ID | TC-CUST-008 |
| Module | Customer Master |
| Title | Search customers by firm name |
| Priority | Medium |
| Preconditions | Multiple customers exist |
| Steps | 1. Navigate to customer list. 2. Type partial firm name in search. |
| Expected Result | Customer list filters to matching results. Search is case-insensitive. |
| Type | E2E |

| Field | Value |
|-------|-------|
| TC ID | TC-CUST-009 |
| Module | Customer Master |
| Title | Customer selection in dispatch workflow |
| Priority | Critical |
| Preconditions | Customers exist. Creating a new dispatch. |
| Steps | 1. Start dispatch workflow. 2. Select customer from dropdown. 3. Verify delivery location auto-fills. |
| Expected Result | Customer dropdown shows active customers. Selecting a customer auto-fills delivery location field. Customer ID linked to dispatch record. |
| Type | E2E |

| Field | Value |
|-------|-------|
| TC ID | TC-CUST-010 |
| Module | Customer Master |
| Title | RBAC — Warehouse Operator cannot access customer management |
| Priority | High |
| Preconditions | Logged in as Warehouse Operator |
| Steps | 1. Try to navigate to Customer Management page. |
| Expected Result | Access denied. Customer menu item not visible in sidebar for this role. |
| Type | Security |

---

## 16. Product Master — Expanded Fields (NEW)

| Field | Value |
|-------|-------|
| TC ID | TC-PRODX-001 |
| Module | Product Management |
| Title | Create product with all new fields |
| Priority | Critical |
| Preconditions | Logged in as Admin |
| Steps | 1. Navigate to Product Management. 2. Click "Add Product." 3. Fill SKU, article name, article code, colour, size, MRP. 4. Select Category: "Gents". 5. Select Section: "Hawaii". 6. Select Location: "MIA". 7. Enter Article Group, HSN Code, Size Group. 8. Submit. |
| Expected Result | Product created with all fields. Category, Section, Location stored correctly. HSN Code and Size Group visible in detail view. |
| Type | E2E |

| Field | Value |
|-------|-------|
| TC ID | TC-PRODX-002 |
| Module | Product Management |
| Title | Category dropdown shows correct options |
| Priority | High |
| Preconditions | On product create/edit form |
| Steps | 1. Click Category dropdown. |
| Expected Result | Dropdown shows exactly: Gents, Ladies, Boys, Girls. No other options. |
| Type | E2E |

| Field | Value |
|-------|-------|
| TC ID | TC-PRODX-003 |
| Module | Product Management |
| Title | Section dropdown shows correct options |
| Priority | High |
| Preconditions | On product create/edit form |
| Steps | 1. Click Section dropdown. |
| Expected Result | Dropdown shows exactly: Hawaii, PU, EVA, Fabrication, Canvas, PVC, Sports Shoes. |
| Type | E2E |

| Field | Value |
|-------|-------|
| TC ID | TC-PRODX-004 |
| Module | Product Management |
| Title | Location dropdown shows correct options |
| Priority | High |
| Preconditions | On product create/edit form |
| Steps | 1. Click Location dropdown. |
| Expected Result | Dropdown shows exactly: VKIA, MIA, F540. |
| Type | E2E |

| Field | Value |
|-------|-------|
| TC ID | TC-PRODX-005 |
| Module | Product Management |
| Title | Filter products by category |
| Priority | Medium |
| Preconditions | Products exist with different categories |
| Steps | 1. Navigate to product list. 2. Select "Ladies" from category filter. |
| Expected Result | Product list shows only products with category = Ladies. |
| Type | E2E |

| Field | Value |
|-------|-------|
| TC ID | TC-PRODX-006 |
| Module | Product Management |
| Title | Filter products by section |
| Priority | Medium |
| Preconditions | Products exist with different sections |
| Steps | 1. Select "PU" from section filter. |
| Expected Result | Product list shows only products with section = PU. |
| Type | E2E |

| Field | Value |
|-------|-------|
| TC ID | TC-PRODX-007 |
| Module | Product Management |
| Title | HSN code accepts valid format |
| Priority | Medium |
| Preconditions | On product create form |
| Steps | 1. Enter HSN Code "6402". 2. Submit. |
| Expected Result | HSN code stored. Max 20 characters accepted. |
| Type | Integration |

| Field | Value |
|-------|-------|
| TC ID | TC-PRODX-008 |
| Module | Product Management |
| Title | Size Group field accepts range format |
| Priority | Low |
| Preconditions | On product create form |
| Steps | 1. Enter Size Group "6-10". 2. Submit. |
| Expected Result | Size Group stored as "6-10". Displayed in product detail view. |
| Type | Integration |

---

## 17. Label Redesign — Child Box (NEW)

| Field | Value |
|-------|-------|
| TC ID | TC-LBLCB-001 |
| Module | Label Printing |
| Title | Child box label shows Article No prominently |
| Priority | Critical |
| Preconditions | Child box created with product article_code "ART-001" |
| Steps | 1. Print/preview child box label. 2. Verify Article No row. |
| Expected Result | "Article No" is displayed at the top of the label as the first row, full width. Shows the article_code value. |
| Type | E2E |

| Field | Value |
|-------|-------|
| TC ID | TC-LBLCB-002 |
| Module | Label Printing |
| Title | Child box label shows MRP with "Inc of all taxes" |
| Priority | High |
| Preconditions | Product MRP = 749.00 |
| Steps | 1. Print/preview child box label. |
| Expected Result | Label shows "M.R.P.: ₹ 749.00" on one line and "(Inc of all taxes)" below it. |
| Type | E2E |

| Field | Value |
|-------|-------|
| TC ID | TC-LBLCB-003 |
| Module | Label Printing |
| Title | Child box label shows size in large font on right |
| Priority | High |
| Preconditions | Child box with size "8" |
| Steps | 1. Print/preview label. 2. Check size display. |
| Expected Result | Size "8" displayed prominently on the right side of the label in a larger font than other fields. |
| Type | E2E |

| Field | Value |
|-------|-------|
| TC ID | TC-LBLCB-004 |
| Module | Label Printing |
| Title | Child box label shows "Packed on" date |
| Priority | High |
| Preconditions | Child box created/packed |
| Steps | 1. Print label. 2. Check Packed on field. |
| Expected Result | "Packed on: DD-MMM-YYYY" is displayed. Date matches the child box creation/pack date. |
| Type | E2E |

| Field | Value |
|-------|-------|
| TC ID | TC-LBLCB-005 |
| Module | Label Printing |
| Title | Child box label shows Content field |
| Priority | High |
| Preconditions | Child box with quantity = 1 |
| Steps | 1. Print label. 2. Check Content field. |
| Expected Result | Label shows "Content: 2N (1 Pair)" — indicating 2 units (1 pair of footwear). |
| Type | E2E |

| Field | Value |
|-------|-------|
| TC ID | TC-LBLCB-006 |
| Module | Label Printing |
| Title | Child box label shows manufacturer footer |
| Priority | Critical |
| Preconditions | Any child box |
| Steps | 1. Print label. 2. Check footer section. |
| Expected Result | Footer shows: "Mfg & Mktd by: Mahavir Polymers Pvt Ltd", "FE 16-17 MIA Jaipur - 302017 Raj (India)", "Customer Care: 0141 2751684". All three lines present. |
| Type | E2E |

| Field | Value |
|-------|-------|
| TC ID | TC-LBLCB-007 |
| Module | Label Printing |
| Title | Child box label QR code positioned on right side |
| Priority | High |
| Preconditions | Any child box |
| Steps | 1. Print label. 2. Verify QR position. |
| Expected Result | QR code is positioned on the right side of the label, below the size field. Scannable after printing. |
| Type | E2E |

---

## 18. Label Redesign — Master Carton (NEW)

| Field | Value |
|-------|-------|
| TC ID | TC-LBLMC-001 |
| Module | Label Printing |
| Title | Master carton label shows Binny logo |
| Priority | High |
| Preconditions | Master carton created |
| Steps | 1. Print/preview master carton label. |
| Expected Result | Binny HD logo (monogram.png) is displayed at the top of the label. Clear and recognizable. |
| Type | E2E |

| Field | Value |
|-------|-------|
| TC ID | TC-LBLMC-002 |
| Module | Label Printing |
| Title | Master carton label shows Article No, Colour, MRP |
| Priority | Critical |
| Preconditions | Master carton with child boxes of article ART-001, Black, MRP 749 |
| Steps | 1. Print/preview label. 2. Check article details. |
| Expected Result | Label shows Article No.: ART-001, Colour: Black, MRP: ₹ 749.00 in structured rows. |
| Type | E2E |

| Field | Value |
|-------|-------|
| TC ID | TC-LBLMC-003 |
| Module | Label Printing |
| Title | Master carton label shows Pack Date |
| Priority | High |
| Preconditions | Master carton closed on 16-Mar-2026 |
| Steps | 1. Print label. 2. Check Pack Date field. |
| Expected Result | Label shows "Pack Date: 16-Mar-2026" in DD-MMM-YYYY format. |
| Type | E2E |

| Field | Value |
|-------|-------|
| TC ID | TC-LBLMC-004 |
| Module | Label Printing |
| Title | Master carton label shows size assortment grid |
| Priority | Critical |
| Preconditions | Master carton with 60 child boxes: 10 each of sizes 9, 10, 11, 12, 13, 1 |
| Steps | 1. Print/preview label. 2. Check size assortment table. |
| Expected Result | Grid displays header row with sizes (9, 10, 11, 12, 13, 1) and quantity row (10, 10, 10, 10, 10, 10) with "Total: 60 Prs" in the last column. |
| Type | E2E |

| Field | Value |
|-------|-------|
| TC ID | TC-LBLMC-005 |
| Module | Label Printing |
| Title | Size assortment grid handles varied quantities |
| Priority | High |
| Preconditions | Master carton with: 5x size 7, 8x size 8, 3x size 9, 4x size 10 = 20 total |
| Steps | 1. Print/preview label. |
| Expected Result | Grid shows sizes 7, 8, 9, 10 with quantities 5, 8, 3, 4 respectively. Total: 20 Prs. |
| Type | Integration |

| Field | Value |
|-------|-------|
| TC ID | TC-LBLMC-006 |
| Module | Label Printing |
| Title | Size assortment sorts sizes correctly |
| Priority | Medium |
| Preconditions | Master carton with sizes 1, 9, 10, 11, 12, 13 |
| Steps | 1. Print/preview label. 2. Check size order in grid. |
| Expected Result | Sizes are displayed in a logical order (numeric ascending, with sizes like 1 placed after 13 if they represent kids sizes, or sorted naturally). |
| Type | Integration |

| Field | Value |
|-------|-------|
| TC ID | TC-LBLMC-007 |
| Module | Label Printing |
| Title | Mixed-article master carton label |
| Priority | Medium |
| Preconditions | Master carton contains child boxes from multiple articles |
| Steps | 1. Print/preview label. |
| Expected Result | Label shows the primary/majority article details or indicates "MIXED". Size assortment still computed correctly across all articles. |
| Type | Integration |

---

## 19. Multi-Size QR Batch Generation (NEW)

| Field | Value |
|-------|-------|
| TC ID | TC-MSQR-001 |
| Module | Multi-Size QR Generation |
| Title | Select product and view available sizes |
| Priority | Critical |
| Preconditions | Logged in as Admin or Warehouse Operator. Multiple products exist with same article_name + colour but different sizes (e.g., sizes 6-10). |
| Steps | 1. Navigate to Generate Labels page. 2. Select a product (article + colour) from dropdown. |
| Expected Result | All sibling sizes for that article+colour are fetched and displayed in a table with size, MRP, and a quantity input per row. |
| Type | E2E |

| Field | Value |
|-------|-------|
| TC ID | TC-MSQR-002 |
| Module | Multi-Size QR Generation |
| Title | Enter quantities per size and view live summary |
| Priority | Critical |
| Preconditions | Product selected with sizes displayed |
| Steps | 1. Enter 10 for size 6, 5 for size 7, 8 for size 8. Leave other sizes as 0. |
| Expected Result | Summary section shows: "Sizes selected: 6 (×10), 7 (×5), 8 (×8)" and "Total labels: 23". Sizes with 0 are excluded from summary. |
| Type | E2E |

| Field | Value |
|-------|-------|
| TC ID | TC-MSQR-003 |
| Module | Multi-Size QR Generation |
| Title | Confirm & Generate creates child boxes across multiple sizes |
| Priority | Critical |
| Preconditions | Product selected, quantities entered for multiple sizes |
| Steps | 1. Enter quantities for 3+ sizes. 2. Click "Confirm & Generate." |
| Expected Result | All child boxes are created in a single transaction. Success view shows total count and per-size breakdown (pill badges). Each child box has correct product_id for its size. |
| Type | E2E |

| Field | Value |
|-------|-------|
| TC ID | TC-MSQR-004 |
| Module | Multi-Size QR Generation |
| Title | Generate button disabled when no sizes have quantities |
| Priority | High |
| Preconditions | Product selected, all size quantities at 0 |
| Steps | 1. Select product. 2. Leave all quantities at 0. 3. Observe "Confirm & Generate" button. |
| Expected Result | Button is disabled. Summary section is hidden. |
| Type | E2E |

| Field | Value |
|-------|-------|
| TC ID | TC-MSQR-005 |
| Module | Multi-Size QR Generation |
| Title | Total count validation — max 500 |
| Priority | High |
| Preconditions | Product selected with sizes displayed |
| Steps | 1. Enter quantities totaling more than 500 across all sizes. 2. Click "Confirm & Generate." |
| Expected Result | Validation error displayed: "Total labels must not exceed 500." No API call is made. |
| Type | E2E |

| Field | Value |
|-------|-------|
| TC ID | TC-MSQR-006 |
| Module | Multi-Size QR Generation |
| Title | Backend validates sizes exist for the product family |
| Priority | High |
| Preconditions | API access |
| Steps | 1. Call POST /child-boxes/bulk-multi-size with a size that doesn't exist for the given article+colour. |
| Expected Result | 404 error: "No product found for size X with article Y and colour Z." |
| Type | Integration |

| Field | Value |
|-------|-------|
| TC ID | TC-MSQR-007 |
| Module | Multi-Size QR Generation |
| Title | All child boxes created in single transaction (atomicity) |
| Priority | Critical |
| Preconditions | API access |
| Steps | 1. Call POST /child-boxes/bulk-multi-size for 3 sizes, but ensure one size has an invalid product_id mapping (simulate DB error). |
| Expected Result | Entire transaction rolls back. No child boxes are created for any size. |
| Type | Integration |

| Field | Value |
|-------|-------|
| TC ID | TC-MSQR-008 |
| Module | Multi-Size QR Generation |
| Title | Print labels for multi-size batch |
| Priority | High |
| Preconditions | Multi-size batch just generated |
| Steps | 1. Click "Print Labels" on the success screen. |
| Expected Result | Print window opens with labels for all sizes. Each label shows correct size, MRP, article code, QR code. Labels are grouped by size. |
| Type | E2E |

| Field | Value |
|-------|-------|
| TC ID | TC-MSQR-009 |
| Module | Multi-Size QR Generation |
| Title | GET /products/:id/sizes returns sibling products |
| Priority | High |
| Preconditions | Product "Article X - Black" exists in sizes 6, 7, 8, 9, 10 |
| Steps | 1. Call GET /products/:id/sizes with one product's ID. |
| Expected Result | Response contains all 5 products sharing article_name + colour. Each has distinct size and its own product ID. |
| Type | Integration |

| Field | Value |
|-------|-------|
| TC ID | TC-MSQR-010 |
| Module | Multi-Size QR Generation |
| Title | Dispatch Operator cannot access multi-size generation |
| Priority | High |
| Preconditions | Logged in as Dispatch Operator |
| Steps | 1. Attempt POST /child-boxes/bulk-multi-size via API. |
| Expected Result | 403 Forbidden. Only Admin, Supervisor, and Warehouse Operator can generate. |
| Type | Security |

---

## 20. Edge Cases & Negative Tests

| Field | Value |
|-------|-------|
| TC ID | TC-EDGE-001 |
| Module | Concurrency |
| Title | Concurrent users scanning same child box for different cartons |
| Priority | Critical |
| Preconditions | FREE child box. Two Warehouse Operators on different devices. |
| Steps | 1. User A scans child box CB-001 into their packing session. 2. User B simultaneously scans CB-001 into their packing session. 3. User A creates carton first. 4. User B attempts to create carton. |
| Expected Result | User A's carton creation succeeds. User B's creation fails with error: "Child box CB-001 is no longer available (packed by another user)." Database lock prevents double-packing. |
| Type | Integration |

| Field | Value |
|-------|-------|
| TC ID | TC-EDGE-002 |
| Module | Resilience |
| Title | Network failure during carton creation — transaction rollback |
| Priority | Critical |
| Preconditions | Packing session with 10 child boxes scanned |
| Steps | 1. Scan 10 boxes. 2. Click "Create Master Carton." 3. Simulate network disconnect during the API call. |
| Expected Result | Server-side transaction rolls back completely. No partial carton created. All child boxes remain FREE. Client shows error: "Network error. Please try again." |
| Type | Integration |

| Field | Value |
|-------|-------|
| TC ID | TC-EDGE-003 |
| Module | Resilience |
| Title | Browser crash during scanning session — recovery |
| Priority | High |
| Preconditions | Active packing session with several scanned boxes |
| Steps | 1. Scan 8 child boxes. 2. Force-close browser/app. 3. Reopen app. |
| Expected Result | Child boxes remain FREE (no server-side lock until carton creation). User must rescan. Session state is lost gracefully. |
| Type | E2E |

| Field | Value |
|-------|-------|
| TC ID | TC-EDGE-004 |
| Module | Scalability |
| Title | Very large carton — 100+ child boxes |
| Priority | Medium |
| Preconditions | 150 FREE child boxes exist |
| Steps | 1. Scan 150 child boxes. 2. Create master carton. |
| Expected Result | Carton created successfully. All 150 child boxes packed. Performance is acceptable (<5 seconds for creation). |
| Type | E2E |

| Field | Value |
|-------|-------|
| TC ID | TC-EDGE-005 |
| Module | Resilience |
| Title | Rapid successive scan of same QR code |
| Priority | Medium |
| Preconditions | Scanning module open |
| Steps | 1. Hold QR code in front of camera continuously for 5 seconds. |
| Expected Result | System debounces rapid scans. Box is added only once. No duplicate entries or errors. |
| Type | E2E |

| Field | Value |
|-------|-------|
| TC ID | TC-EDGE-006 |
| Module | Security |
| Title | SQL injection attempt in search fields |
| Priority | Critical |
| Preconditions | App is accessible |
| Steps | 1. In product search, enter: `'; DROP TABLE products; --`. 2. Submit. |
| Expected Result | Input is sanitized. No SQL execution. Search returns no results or validation error. Database is unaffected. |
| Type | Security |

| Field | Value |
|-------|-------|
| TC ID | TC-EDGE-007 |
| Module | Security |
| Title | XSS attempt in party name field |
| Priority | Critical |
| Preconditions | Dispatch module accessible |
| Steps | 1. In party_name field, enter: `<script>alert('XSS')</script>`. 2. Submit dispatch. 3. View dispatch record. |
| Expected Result | Script tags are escaped/sanitized. No script execution. Data is stored safely and displayed as plain text. |
| Type | Security |

| Field | Value |
|-------|-------|
| TC ID | TC-EDGE-008 |
| Module | Security |
| Title | Unauthorized API access attempt — no token |
| Priority | Critical |
| Preconditions | None |
| Steps | 1. Call GET /api/child-boxes without Authorization header. |
| Expected Result | Returns 401 Unauthorized. No data leaked. |
| Type | Security |

| Field | Value |
|-------|-------|
| TC ID | TC-EDGE-009 |
| Module | Security |
| Title | Expired JWT token API call |
| Priority | High |
| Preconditions | Have an expired JWT token |
| Steps | 1. Call GET /api/child-boxes with expired token in Authorization header. |
| Expected Result | Returns 401 Unauthorized with message "Token expired." |
| Type | Security |

| Field | Value |
|-------|-------|
| TC ID | TC-EDGE-010 |
| Module | Resilience |
| Title | Database connection failure handling |
| Priority | High |
| Preconditions | App running |
| Steps | 1. Simulate database connection failure (e.g., stop PostgreSQL). 2. Attempt any operation. |
| Expected Result | App returns 503 Service Unavailable. User-friendly error message. No stack trace or sensitive info exposed. App recovers when DB is restored. |
| Type | Integration |

| Field | Value |
|-------|-------|
| TC ID | TC-EDGE-011 |
| Module | Security |
| Title | Tampered JWT token |
| Priority | Critical |
| Preconditions | Have a valid JWT, modify its payload |
| Steps | 1. Take a valid JWT. 2. Modify the payload (e.g., change role from "operator" to "admin"). 3. Call API with tampered token. |
| Expected Result | Signature verification fails. Returns 401 Unauthorized. |
| Type | Security |

| Field | Value |
|-------|-------|
| TC ID | TC-EDGE-012 |
| Module | Security |
| Title | IDOR — access another user's data by manipulating IDs |
| Priority | Critical |
| Preconditions | Logged in as User A |
| Steps | 1. Call API with User B's resource ID (e.g., GET /api/users/{userB_id}). |
| Expected Result | Access denied unless User A has admin role. No unauthorized data exposure. |
| Type | Security |

| Field | Value |
|-------|-------|
| TC ID | TC-EDGE-013 |
| Module | Validation |
| Title | Extremely long input in text fields |
| Priority | Low |
| Preconditions | Any form with text inputs |
| Steps | 1. Enter 10,000 characters in party_name field. 2. Submit. |
| Expected Result | Input is truncated or validation error: "Maximum length exceeded." No buffer overflow or DB error. |
| Type | E2E |

| Field | Value |
|-------|-------|
| TC ID | TC-EDGE-014 |
| Module | Validation |
| Title | Special characters in input fields |
| Priority | Medium |
| Preconditions | Any form |
| Steps | 1. Enter party name with special characters: "M/s. O'Brien & Co. (Pvt.) Ltd." 2. Submit. |
| Expected Result | Data is accepted and stored correctly. Special characters are preserved. No encoding issues on display. |
| Type | E2E |

| Field | Value |
|-------|-------|
| TC ID | TC-EDGE-015 |
| Module | Concurrency |
| Title | Simultaneous unpack and dispatch on same carton |
| Priority | Critical |
| Preconditions | ACTIVE carton. Two users on different devices. |
| Steps | 1. User A initiates unpack on carton MC-001. 2. User B simultaneously initiates dispatch on MC-001. |
| Expected Result | One operation succeeds, the other fails with a conflict error. Database integrity is maintained. No carton is both CLOSED and DISPATCHED. |
| Type | Integration |

---

## 21. Performance Tests

| Field | Value |
|-------|-------|
| TC ID | TC-PERF-001 |
| Module | Performance |
| Title | QR scan to response time under 1 second |
| Priority | Critical |
| Preconditions | App running on typical mobile device. Stable network connection. |
| Steps | 1. Scan a child box QR. 2. Measure time from scan detection to data display on screen. 3. Repeat 20 times and calculate average. |
| Expected Result | Average response time is under 1 second. 95th percentile is under 1.5 seconds. |
| Type | E2E |

| Field | Value |
|-------|-------|
| TC ID | TC-PERF-002 |
| Module | Performance |
| Title | Bulk QR generation — 1000 child boxes |
| Priority | High |
| Preconditions | Product exists |
| Steps | 1. Request generation of 1000 child boxes. 2. Measure completion time. |
| Expected Result | Generation completes within 30 seconds. All 1000 records created. No timeouts. |
| Type | Integration |

| Field | Value |
|-------|-------|
| TC ID | TC-PERF-003 |
| Module | Performance |
| Title | Report generation with large dataset (100K+ records) |
| Priority | High |
| Preconditions | Database seeded with 100,000+ child box records |
| Steps | 1. Generate stock by SKU report. 2. Measure load time. |
| Expected Result | Report generates within 10 seconds. Pagination is used for display. No browser crash or timeout. |
| Type | Integration |

| Field | Value |
|-------|-------|
| TC ID | TC-PERF-004 |
| Module | Performance |
| Title | Concurrent user load — 20+ simultaneous users |
| Priority | High |
| Preconditions | Load testing tool configured (e.g., k6, Artillery) |
| Steps | 1. Simulate 20 concurrent users performing mixed operations (scan, pack, dispatch). 2. Monitor response times and error rates. |
| Expected Result | All requests succeed. Average response time stays under 2 seconds. Error rate is below 1%. No deadlocks. |
| Type | Integration |

| Field | Value |
|-------|-------|
| TC ID | TC-PERF-005 |
| Module | Performance |
| Title | Database query performance with 100K+ records |
| Priority | High |
| Preconditions | Database with 100K child boxes, 10K cartons, 50K transactions |
| Steps | 1. Run key queries: stock report, traceability lookup, carton search. 2. Measure query execution time. |
| Expected Result | All queries execute under 500ms. Proper indexes are in use (verified via EXPLAIN ANALYZE). |
| Type | Unit |

---

## 22. Phase 2 UI Enhancement Tests (NEW)

| Field | Value |
|-------|-------|
| TC ID | TC-UI-001 |
| Module | UI — Login |
| Title | Login page has gradient background and accent stripe card |
| Priority | Medium |
| Preconditions | None |
| Steps | 1. Navigate to login page. 2. Verify dark gradient background. 3. Verify card has red-to-navy accent stripe at top. 4. Verify scale-in animation class on card. |
| Expected Result | Login page displays with navy gradient background, radial red glow, white card with accent stripe, and entrance animation. |
| Type | E2E |

| Field | Value |
|-------|-------|
| TC ID | TC-UI-002 |
| Module | UI — Login |
| Title | Login powered-by text visible against dark background |
| Priority | Low |
| Preconditions | None |
| Steps | 1. Navigate to login page. 2. Check for "Powered by Basiq360" text. |
| Expected Result | Text is visible in white/translucent color. |
| Type | E2E |

| Field | Value |
|-------|-------|
| TC ID | TC-UI-003 |
| Module | UI — Dashboard |
| Title | Dashboard welcome banner with time-based greeting |
| Priority | Medium |
| Preconditions | Logged in as Admin |
| Steps | 1. Navigate to dashboard. 2. Verify welcome banner with "Good Morning/Afternoon/Evening" greeting. 3. Verify user name appears. 4. Verify navy gradient background on banner. |
| Expected Result | Welcome banner shows correct time-of-day greeting with user name, on a navy gradient card with decorative circles. |
| Type | E2E |

| Field | Value |
|-------|-------|
| TC ID | TC-UI-004 |
| Module | UI — Dashboard |
| Title | Dashboard stat cards have colored accent left borders |
| Priority | Medium |
| Preconditions | Logged in as Admin |
| Steps | 1. Navigate to dashboard. 2. Verify 4 stat cards visible. 3. Check each card has a colored left border (navy, blue, green, purple). |
| Expected Result | Stat cards display with distinct left accent borders using the Card accent prop. |
| Type | E2E |

| Field | Value |
|-------|-------|
| TC ID | TC-UI-005 |
| Module | UI — Dashboard |
| Title | Dashboard skeleton loading state |
| Priority | Medium |
| Preconditions | Logged in as Admin |
| Steps | 1. Navigate to dashboard with slow network throttling. 2. Verify skeleton placeholder cards appear. 3. Verify real content replaces skeletons. |
| Expected Result | SkeletonCard components render during loading, replaced by real stat cards when data loads. |
| Type | E2E |

| Field | Value |
|-------|-------|
| TC ID | TC-UI-006 |
| Module | UI — Dashboard |
| Title | Quick action cards have gradient icon backgrounds |
| Priority | Low |
| Preconditions | Logged in as Admin |
| Steps | 1. Navigate to dashboard. 2. Verify quick action icons have gradient backgrounds. 3. Hover over card — verify lift animation. 4. Verify arrow turns red on hover. |
| Expected Result | Quick actions show gradient-colored icon pills, hover lift effect, and red arrow transition. |
| Type | E2E |

| Field | Value |
|-------|-------|
| TC ID | TC-UI-007 |
| Module | UI — Dashboard |
| Title | Recent Activity timeline with connector lines |
| Priority | Low |
| Preconditions | Logged in as Admin, at least 2 recent transactions exist |
| Steps | 1. Navigate to dashboard. 2. Scroll to Recent Activity. 3. Verify vertical timeline connector between items. 4. Verify hover highlight on items. |
| Expected Result | Activity items have connecting vertical lines, colored icon pills, and hover bg transition. |
| Type | E2E |

| Field | Value |
|-------|-------|
| TC ID | TC-UI-008 |
| Module | UI — Sidebar |
| Title | Sidebar has full navy gradient background |
| Priority | High |
| Preconditions | Logged in (desktop viewport) |
| Steps | 1. Verify sidebar has navy gradient background (top #2D2A6E to bottom #1E1A5F). 2. Verify header shows Binny Inventory in white. 3. Verify inactive items are white at 70% opacity. |
| Expected Result | Sidebar is fully navy with white text. Not white background with blue active state. |
| Type | E2E |

| Field | Value |
|-------|-------|
| TC ID | TC-UI-009 |
| Module | UI — Sidebar |
| Title | Sidebar active item shows white background with red indicator |
| Priority | High |
| Preconditions | Logged in, on dashboard |
| Steps | 1. Verify Dashboard link has white background and navy text. 2. Verify red left indicator bar on active item. 3. Navigate to another page — verify active state moves. |
| Expected Result | Active nav item has bg-white class with navy text and 1px red rounded bar on left edge. |
| Type | E2E |

| Field | Value |
|-------|-------|
| TC ID | TC-UI-010 |
| Module | UI — Sidebar |
| Title | Sidebar hover state on inactive items |
| Priority | Low |
| Preconditions | Logged in (desktop viewport) |
| Steps | 1. Hover over an inactive sidebar item. 2. Verify subtle white/10 background appears. 3. Verify text brightens to full white. |
| Expected Result | Hover creates a subtle translucent background with brightened text. |
| Type | E2E |

| Field | Value |
|-------|-------|
| TC ID | TC-UI-011 |
| Module | UI — Header |
| Title | Header has frosted glass effect |
| Priority | Medium |
| Preconditions | Logged in |
| Steps | 1. Verify header has backdrop-blur-md class. 2. Verify bg-white/80 opacity. 3. Scroll page content — header should show frosted blur effect over content. |
| Expected Result | Header uses CSS backdrop-blur for a frosted glass appearance. |
| Type | E2E |

| Field | Value |
|-------|-------|
| TC ID | TC-UI-012 |
| Module | UI — Header |
| Title | Header notification bell shows animated red dot |
| Priority | Low |
| Preconditions | Logged in |
| Steps | 1. Verify bell icon is visible in header. 2. Verify small red dot indicator with pulse-dot animation. |
| Expected Result | Bell has a 2x2 red dot with CSS pulse animation. |
| Type | E2E |

| Field | Value |
|-------|-------|
| TC ID | TC-UI-013 |
| Module | UI — Header |
| Title | Header page title has navy left accent border |
| Priority | Low |
| Preconditions | Logged in, on any page |
| Steps | 1. Verify h1 title in header. 2. Verify border-l-2 class with navy color. 3. Navigate between pages — title updates. |
| Expected Result | Page title has a 2px navy left border as accent indicator. |
| Type | E2E |

| Field | Value |
|-------|-------|
| TC ID | TC-UI-014 |
| Module | UI — Mobile Nav |
| Title | Mobile nav has glass blur and red dot active indicator |
| Priority | Medium |
| Preconditions | Logged in, mobile viewport (< 1024px) |
| Steps | 1. Verify bottom nav has backdrop-blur-lg class. 2. Verify active tab shows navy text with bold font. 3. Verify red dot below active label. 4. Navigate — dot moves to new tab. |
| Expected Result | Mobile nav has glass background, active tab has navy icon/text with red indicator dot. |
| Type | E2E |

| Field | Value |
|-------|-------|
| TC ID | TC-UI-015 |
| Module | UI — Page Header |
| Title | All page headers show gradient accent bar |
| Priority | Medium |
| Preconditions | Logged in |
| Steps | 1. Navigate to Child Boxes, Master Cartons, Dispatch, Reports pages. 2. On each, verify a small gradient bar (red-to-navy, h-1 w-8) appears above the page title. |
| Expected Result | Every page with PageHeader component shows the gradient accent bar. |
| Type | E2E |

| Field | Value |
|-------|-------|
| TC ID | TC-UI-016 |
| Module | UI — List Pages |
| Title | List pages use skeleton table loading instead of spinner |
| Priority | High |
| Preconditions | Logged in |
| Steps | 1. Navigate to Master Cartons page. 2. During data loading, verify SkeletonTable appears (shimmer animation divs). 3. Verify skeleton is replaced by real data table. 4. Repeat for Dispatches, Products, Customers pages. |
| Expected Result | All list pages show skeleton table placeholders during API fetch, not a centered spinner. |
| Type | E2E |

| Field | Value |
|-------|-------|
| TC ID | TC-UI-017 |
| Module | UI — List Pages |
| Title | List page filter bars have branded navy-50 background |
| Priority | Low |
| Preconditions | Logged in |
| Steps | 1. Navigate to Master Cartons, Dispatches pages. 2. Verify filter section has bg-binny-navy-50/50 class. |
| Expected Result | Filter bars have a subtle navy-tinted background for visual separation from the table. |
| Type | E2E |

| Field | Value |
|-------|-------|
| TC ID | TC-UI-018 |
| Module | UI — Tables |
| Title | Table headers use navy-tinted background |
| Priority | Low |
| Preconditions | Logged in, data exists |
| Steps | 1. Navigate to Child Boxes or Master Cartons. 2. Verify thead has bg-binny-navy-50 class. 3. Hover a row — verify bg-binny-navy-50 hover state. |
| Expected Result | Table headers are navy-tinted instead of generic gray. Row hover uses matching navy tint. |
| Type | E2E |

| Field | Value |
|-------|-------|
| TC ID | TC-UI-019 |
| Module | UI — Form Pages |
| Title | Dispatch and Master Carton Create forms have icon section headers |
| Priority | Medium |
| Preconditions | Logged in |
| Steps | 1. Navigate to /dispatch. 2. Verify "Dispatch Details", "Scan Master Cartons", "Cartons to Dispatch" headers each have an icon pill (rounded-lg bg with lucide icon) next to the text. 3. Navigate to /master-cartons/create. 4. Verify same pattern for "Carton Settings", "Scan Child Boxes", "Scanned Items". |
| Expected Result | Section headers render with a colored icon pill (bg-binny-navy-50 + navy icon) followed by bold text. |
| Type | E2E |

| Field | Value |
|-------|-------|
| TC ID | TC-UI-020 |
| Module | UI — Inputs |
| Title | Input fields have subtle gray background and focus transitions |
| Priority | Low |
| Preconditions | Logged in |
| Steps | 1. Navigate to any form page. 2. Verify inputs have bg-gray-50/50 at rest. 3. Focus an input — verify transition to bg-white + shadow-sm + navy ring. |
| Expected Result | Inputs have light gray tint at rest for contrast against white cards, transitioning to white with shadow on focus. |
| Type | E2E |

| Field | Value |
|-------|-------|
| TC ID | TC-UI-021 |
| Module | UI — Buttons |
| Title | Primary buttons have gradient background and press feedback |
| Priority | Medium |
| Preconditions | Logged in |
| Steps | 1. Navigate to any page with a primary button. 2. Verify button has gradient background (navy to lighter navy). 3. Click and hold — verify active:scale-[0.98] press effect. 4. Verify shadow increases on hover. |
| Expected Result | Primary buttons show a linear-gradient background, slight shrink on click, and shadow-md on hover. |
| Type | E2E |

| Field | Value |
|-------|-------|
| TC ID | TC-UI-022 |
| Module | UI — Badges |
| Title | Badges have matching color borders |
| Priority | Low |
| Preconditions | Logged in, data with status badges exists |
| Steps | 1. Navigate to Master Cartons page. 2. Verify status badges have border class matching their variant color (e.g., green badge has border-green-200). |
| Expected Result | Badges render with subtle colored borders for better definition. |
| Type | E2E |

| Field | Value |
|-------|-------|
| TC ID | TC-UI-023 |
| Module | UI — Cards |
| Title | Interactive cards have hover lift effect |
| Priority | Low |
| Preconditions | Logged in |
| Steps | 1. Navigate to dashboard. 2. Hover over a quick action card. 3. Verify card lifts with shadow-card-hover and -translate-y-0.5. |
| Expected Result | Cards with interactive prop show a subtle upward lift and increased shadow on hover. |
| Type | E2E |

| Field | Value |
|-------|-------|
| TC ID | TC-UI-024 |
| Module | UI — PWA Offline |
| Title | Offline page has branded navy gradient design |
| Priority | Medium |
| Preconditions | None |
| Steps | 1. Navigate to /offline. 2. Verify navy gradient background. 3. Verify white card with red-to-navy accent stripe. 4. Verify WifiOff icon from lucide-react. 5. Verify "Retry Connection" button with gradient styling. 6. Verify "Binny Inventory" footer text. |
| Expected Result | Offline page matches login page branding — gradient bg, accent stripe, branded card, gradient button. |
| Type | E2E |

| Field | Value |
|-------|-------|
| TC ID | TC-UI-025 |
| Module | UI — PWA Splash |
| Title | Dashboard loading state shows branded splash screen |
| Priority | Medium |
| Preconditions | Auth token set but first page load |
| Steps | 1. Set auth token in localStorage. 2. Navigate to /. 3. During auth verification, verify branded splash (navy gradient bg + centered white logo + pulse animation). |
| Expected Result | Loading state shows a dark navy gradient with the Binny monogram logo pulsing in white, instead of a plain spinner. |
| Type | E2E |

| Field | Value |
|-------|-------|
| TC ID | TC-UI-026 |
| Module | UI — Toast Notifications |
| Title | Toast notifications have colored accent left borders |
| Priority | Low |
| Preconditions | Logged in |
| Steps | 1. Trigger a success toast (e.g., create a customer). 2. Verify green left border on toast. 3. Trigger an error toast (e.g., invalid login). 4. Verify red left border. 5. Verify elevated shadow styling. |
| Expected Result | Success toasts have 4px green left border; error toasts have 4px red left border. Both use navy-tinted elevated shadow. |
| Type | E2E |

| Field | Value |
|-------|-------|
| TC ID | TC-UI-027 |
| Module | UI — Searchable Dropdown |
| Title | Child box generate page uses searchable dropdown instead of native select |
| Priority | High |
| Preconditions | Logged in, products exist |
| Steps | 1. Navigate to /child-boxes/generate. 2. Verify "Search and select a product..." placeholder visible. 3. Click input to open dropdown list. 4. Type a search term — verify list filters in real time. 5. Click a product — verify dropdown closes and product is selected. 6. Verify colour pills appear after selection. |
| Expected Result | Product selection uses a custom searchable dropdown combo, not a native HTML select element. Typing filters options. Clicking outside closes dropdown. |
| Type | E2E |

| Field | Value |
|-------|-------|
| TC ID | TC-UI-028 |
| Module | UI — Customer-Centric Dispatches |
| Title | Dispatches page groups records by customer |
| Priority | High |
| Preconditions | Logged in, dispatch records exist |
| Steps | 1. Navigate to /dispatches. 2. Verify records are grouped by customer name (user icon + firm name heading). 3. Verify summary shows total cartons, boxes, destinations, latest date per customer. 4. Click a customer group to expand. 5. Verify individual carton dispatch records appear with barcode, product details, destination, vehicle, LR number, date. |
| Expected Result | Dispatches are customer-centric: each customer row shows aggregated dispatch info, expandable to reveal individual carton records. |
| Type | E2E |

| Field | Value |
|-------|-------|
| TC ID | TC-UI-029 |
| Module | UI — Child Box Product Name |
| Title | Child box list shows product name (article_name) in Product column |
| Priority | Critical |
| Preconditions | Logged in, child boxes exist |
| Steps | 1. Navigate to /child-boxes. 2. Verify Product column header exists. 3. Verify product name cells are NOT blank. 4. Verify article_name, sku, colour, size, mrp all display correctly. |
| Expected Result | Product name column shows the article_name from the products table, not blank. Backend returns article_name (not aliased as product_name). |
| Type | E2E |

| Field | Value |
|-------|-------|
| TC ID | TC-UI-030 |
| Module | UI — Print Labels |
| Title | Print label opens correctly without blank screen or error |
| Priority | Critical |
| Preconditions | Logged in, generated child box labels |
| Steps | 1. Navigate to /child-boxes/generate. 2. Select product, colour, enter sizes. 3. Click "Confirm & Generate". 4. On success, click "Print Labels". 5. Verify print window opens with label content (not blank). 6. Verify no JavaScript error on the originating tab. |
| Expected Result | Print window opens with fully rendered labels including QR codes (using createElement for QRCodeSVG). No blank page. No console errors. |
| Type | E2E |

| Field | Value |
|-------|-------|
| TC ID | TC-UI-031 |
| Module | UI — PWA Manifest |
| Title | PWA manifest has navy background and split icon purposes |
| Priority | Medium |
| Preconditions | None |
| Steps | 1. Fetch /manifest.json. 2. Verify background_color is "#2D2A6E". 3. Verify theme_color is "#2D2A6E". 4. Verify icons have separate "any" and "maskable" purpose entries. 5. Verify categories include "business". |
| Expected Result | Manifest produces a branded navy splash screen on PWA install with properly separated icon purposes. |
| Type | Integration |

---

## 23. UAT Bug Fix Validation Tests (NEW)

| Field | Value |
|-------|-------|
| TC ID | TC-UAT-001 |
| Module | UAT — Buttons |
| Title | All buttons are visible with correct colors |
| Priority | Critical |
| Preconditions | None |
| Steps | 1. Navigate to login page — verify "Sign In" button visible with navy/gradient background and white text. 2. Navigate to /child-boxes — verify "Generate Labels" button visible. 3. Navigate to /master-cartons — verify "Create Carton" button visible. 4. Navigate to /dispatch — verify "Create Dispatch" button visible. 5. Verify all buttons use inline style fallbacks for background-color and color. |
| Expected Result | All primary, secondary, outline, and danger buttons are visible with correct colors rendered via inline style fallbacks. |
| Type | E2E |

| Field | Value |
|-------|-------|
| TC ID | TC-UAT-002 |
| Module | UAT — Searchable Dropdown |
| Title | Product selection uses searchable combo instead of native select |
| Priority | High |
| Preconditions | Logged in, products exist in database |
| Steps | 1. Navigate to /child-boxes/generate. 2. Verify no native `<select>` element for product. 3. Verify custom searchable input with "Search and select a product..." placeholder. 4. Type partial product name — verify dropdown filters. 5. Select product — verify dropdown closes, product info appears. |
| Expected Result | Product selection uses custom searchable dropdown that filters on type, not a separate search bar + dropdown combo. |
| Type | E2E |

| Field | Value |
|-------|-------|
| TC ID | TC-UAT-003 |
| Module | UAT — Print Labels |
| Title | Print labels uses createElement for QRCodeSVG (no blank screen) |
| Priority | Critical |
| Preconditions | Logged in, generate child box labels |
| Steps | 1. Generate labels (select product, colour, sizes, confirm). 2. Click "Print Labels". 3. Verify a new window opens with rendered HTML content. 4. Verify QR SVGs are visible in the print window. 5. Verify no JavaScript errors on the source page. |
| Expected Result | Print window renders all labels with QR codes. Uses `createElement(QRCodeSVG, ...)` instead of `QRCodeSVG({...})`. Window.onload triggers print dialog. |
| Type | E2E |

| Field | Value |
|-------|-------|
| TC ID | TC-UAT-004 |
| Module | UAT — Customer-Centric Dispatches |
| Title | Dispatch list is customer-centric, not carton-centric |
| Priority | High |
| Preconditions | Logged in, dispatches exist with customer assignments |
| Steps | 1. Navigate to /dispatches. 2. Verify primary grouping is by customer (not by carton). 3. Verify each customer group shows: firm name, total cartons, total boxes, destinations, latest dispatch date. 4. Click to expand — verify individual carton records with barcode, product summary, dispatch details. |
| Expected Result | Dispatch list shows "which customer received which carton when" instead of "which carton went to which customer". |
| Type | E2E |

| Field | Value |
|-------|-------|
| TC ID | TC-UAT-005 |
| Module | UAT — Child Box Product Name |
| Title | Backend returns article_name (not aliased) for child box list |
| Priority | Critical |
| Preconditions | Child boxes exist in database |
| Steps | 1. Call GET /api/v1/child-boxes. 2. Verify response includes `article_name` field (not `product_name`). 3. Verify response includes `article_code`, `sku`, `colour`, `size`, `mrp` fields. 4. Navigate to /child-boxes in UI. 5. Verify Product column shows article_name (not blank). |
| Expected Result | Backend SQL queries use `p.article_name` (no alias), and frontend renders it correctly in the Product column. |
| Type | Integration |

| Field | Value |
|-------|-------|
| TC ID | TC-UAT-006 |
| Module | UAT — Label Formatting |
| Title | Generated label includes all required fields per spec |
| Priority | High |
| Preconditions | Logged in, generate child box labels |
| Steps | 1. Generate labels. 2. Click "Print Labels". 3. In the print window, verify label contains: Article No, Colour, Size (large), M.R.P. (with "Inc of all taxes"), Packed on date, Content (N pairs), QR code SVG, Manufacturer footer (Mahavir Polymers Pvt Ltd, address, Customer Care). |
| Expected Result | Label format matches the "Child Box Label Information" specification with all 8 required data elements. |
| Type | E2E |

---

## 24. Phase 3 PWA Enhancement Tests (NEW)

| Field | Value |
|-------|-------|
| TC ID | TC-PWA-001 |
| Module | PWA — Offline Queue |
| Title | Scan page loads with no pending scans initially |
| Priority | High |
| Preconditions | Logged in, no prior offline scans |
| Steps | 1. Navigate to /scan. 2. Verify no "pending sync" badge visible. |
| Expected Result | Clean state with no pending offline scans. |
| Type | E2E |

| Field | Value |
|-------|-------|
| TC ID | TC-PWA-002 |
| Module | PWA — Offline Queue |
| Title | Manual barcode lookup works when online |
| Priority | Critical |
| Preconditions | Logged in, valid child box barcode exists |
| Steps | 1. Create child box via API. 2. Navigate to /scan. 3. Enter barcode manually. 4. Click Look Up. |
| Expected Result | Child box details shown in result panel. |
| Type | E2E |

| Field | Value |
|-------|-------|
| TC ID | TC-PWA-003 |
| Module | PWA — Offline Queue |
| Title | Offline scan saves to queue and shows pending badge |
| Priority | Critical |
| Preconditions | Logged in |
| Steps | 1. Navigate to /scan. 2. Go offline (setOffline). 3. Enter barcode manually. 4. Click Look Up. |
| Expected Result | Toast "Saved offline" appears. Pending sync badge visible with count. |
| Type | E2E |

| Field | Value |
|-------|-------|
| TC ID | TC-PWA-004 |
| Module | PWA — Offline Queue |
| Title | Multiple offline scans accumulate in queue |
| Priority | High |
| Preconditions | Logged in, offline |
| Steps | 1. Go offline. 2. Scan barcode A. 3. Scan barcode B. 4. Check pending count. |
| Expected Result | Pending badge shows count of 2+. |
| Type | E2E |

| Field | Value |
|-------|-------|
| TC ID | TC-PWA-005 |
| Module | PWA — Offline Queue |
| Title | IndexedDB persists scans across page reload |
| Priority | Critical |
| Preconditions | Offline scan saved |
| Steps | 1. Go offline, scan a barcode. 2. Go back online. 3. Directly query IndexedDB for pending_scans store. |
| Expected Result | IndexedDB contains the scan record with barcode, sessionType, scannedAt. |
| Type | E2E |

| Field | Value |
|-------|-------|
| TC ID | TC-PWA-006 |
| Module | PWA — Network Status |
| Title | No status bar shown when online |
| Priority | Medium |
| Preconditions | Logged in, online |
| Steps | 1. Verify no "You are offline" bar visible. |
| Expected Result | Nothing rendered by NetworkStatusBar. |
| Type | E2E |

| Field | Value |
|-------|-------|
| TC ID | TC-PWA-007 |
| Module | PWA — Network Status |
| Title | Amber bar appears when going offline |
| Priority | High |
| Preconditions | Logged in |
| Steps | 1. Set browser offline. 2. Check for amber bar. |
| Expected Result | Amber bar "You are offline — scans will be saved locally" appears with WifiOff icon. |
| Type | E2E |

| Field | Value |
|-------|-------|
| TC ID | TC-PWA-008 |
| Module | PWA — Network Status |
| Title | Green bar appears when coming back online |
| Priority | High |
| Preconditions | Was offline |
| Steps | 1. Go offline. 2. Come back online. |
| Expected Result | Green bar "Back online — syncing..." appears with Wifi icon. |
| Type | E2E |

| Field | Value |
|-------|-------|
| TC ID | TC-PWA-009 |
| Module | PWA — Network Status |
| Title | Green bar auto-dismisses after 3 seconds |
| Priority | Medium |
| Preconditions | Was offline, now online |
| Steps | 1. Go offline then online. 2. Wait 3+ seconds. |
| Expected Result | Green bar disappears automatically. |
| Type | E2E |

| Field | Value |
|-------|-------|
| TC ID | TC-PWA-010 |
| Module | PWA — Network Status |
| Title | Network bar shows on all dashboard pages |
| Priority | Medium |
| Preconditions | Logged in |
| Steps | 1. Navigate to /child-boxes. 2. Go offline. 3. Verify bar. 4. Navigate to /master-cartons. 5. Verify bar persists. |
| Expected Result | NetworkStatusBar renders on all pages within the dashboard layout. |
| Type | E2E |

| Field | Value |
|-------|-------|
| TC ID | TC-PWA-011 |
| Module | PWA — Install Prompt |
| Title | Install prompt hook initializes without error |
| Priority | Medium |
| Preconditions | Logged in |
| Steps | 1. Load dashboard. 2. Verify app loads normally. |
| Expected Result | App works regardless of whether beforeinstallprompt fires. |
| Type | E2E |

| Field | Value |
|-------|-------|
| TC ID | TC-PWA-012 |
| Module | PWA — Install Prompt |
| Title | Install dismissal persists in localStorage |
| Priority | Medium |
| Preconditions | Logged in |
| Steps | 1. Set localStorage binny_install_dismissed=true. 2. Reload. 3. Verify no install banner. |
| Expected Result | Install banner stays hidden after dismissal across page reloads. |
| Type | E2E |

| Field | Value |
|-------|-------|
| TC ID | TC-PWA-013 |
| Module | PWA — Install Prompt |
| Title | Standalone mode detection works |
| Priority | Low |
| Preconditions | Running in browser (not installed) |
| Steps | 1. Check display-mode:standalone media query. |
| Expected Result | Returns false in browser, true when installed as PWA. |
| Type | E2E |

| Field | Value |
|-------|-------|
| TC ID | TC-PWA-014 |
| Module | PWA — Scan Experience |
| Title | Scan page has full-screen scan button |
| Priority | High |
| Preconditions | Logged in |
| Steps | 1. Navigate to /scan. 2. Verify "Full Screen" button is visible. |
| Expected Result | Full Screen button exists alongside Start/Stop scanning controls. |
| Type | E2E |

| Field | Value |
|-------|-------|
| TC ID | TC-PWA-015 |
| Module | PWA — Scan Experience |
| Title | Full-screen scanner opens as fixed overlay |
| Priority | High |
| Preconditions | Logged in, on scan page |
| Steps | 1. Click Full Screen. 2. Verify fixed inset-0 z-50 overlay. 3. Verify close (X) button. |
| Expected Result | Scanner fills entire screen as a fixed overlay with black background. |
| Type | E2E |

| Field | Value |
|-------|-------|
| TC ID | TC-PWA-016 |
| Module | PWA — Scan Experience |
| Title | Full-screen scanner close button exits overlay |
| Priority | High |
| Preconditions | Full-screen scanner open |
| Steps | 1. Open full screen. 2. Click X close. 3. Verify overlay removed. |
| Expected Result | Scanner returns to inline mode, fixed overlay disappears. |
| Type | E2E |

| Field | Value |
|-------|-------|
| TC ID | TC-PWA-017 |
| Module | PWA — Scan Experience |
| Title | Dispatch page has full-screen scan support |
| Priority | Medium |
| Preconditions | Logged in, scanner opened on /dispatch |
| Steps | 1. Open scanner on dispatch page. 2. Verify Full Screen button. |
| Expected Result | Full Screen toggle available on dispatch scanner. |
| Type | E2E |

| Field | Value |
|-------|-------|
| TC ID | TC-PWA-018 |
| Module | PWA — Scan Experience |
| Title | Master Carton Create has full-screen scan support |
| Priority | Medium |
| Preconditions | Logged in, scanner opened on /master-cartons/create |
| Steps | 1. Open scanner. 2. Verify Full Screen button. |
| Expected Result | Full Screen toggle available on master carton create scanner. |
| Type | E2E |

| Field | Value |
|-------|-------|
| TC ID | TC-PWA-019 to TC-PWA-021 |
| Module | PWA — Browser APIs |
| Title | Wake Lock, Vibration, AudioContext API availability checks |
| Priority | Low |
| Preconditions | Browser context |
| Steps | 1. Check navigator.wakeLock availability. 2. Check navigator.vibrate. 3. Create and close AudioContext tone. |
| Expected Result | API checks execute without errors. Availability is browser-dependent but code handles gracefully. |
| Type | E2E |

| Field | Value |
|-------|-------|
| TC ID | TC-PWA-022 |
| Module | PWA — Scan Experience |
| Title | Full-screen scan shows pending offline count badge |
| Priority | Medium |
| Preconditions | Offline scans pending, full-screen scanner open |
| Steps | 1. Go offline, scan a barcode. 2. Open full-screen scanner. 3. Verify "pending sync" badge in overlay. |
| Expected Result | Amber badge shows count of pending offline scans inside full-screen overlay. |
| Type | E2E |

| Field | Value |
|-------|-------|
| TC ID | TC-PWA-023 to TC-PWA-025 |
| Module | PWA — Manifest |
| Title | Manifest.json validity, icon entries, and categories |
| Priority | High |
| Preconditions | None |
| Steps | 1. Fetch /manifest.json. 2. Verify name, display, theme_color, background_color. 3. Verify 4+ icons with separate any/maskable. 4. Verify categories. |
| Expected Result | Manifest is valid with navy branding, split icon purposes, business+productivity categories. |
| Type | Integration |

| Field | Value |
|-------|-------|
| TC ID | TC-PWA-026 to TC-PWA-028 |
| Module | PWA — Manifest |
| Title | PWA icons accessible, HTML meta tags present, viewport configured |
| Priority | Medium |
| Preconditions | None |
| Steps | 1. Fetch icon PNGs. 2. Check theme-color meta. 3. Check manifest link. 4. Verify viewport user-scalable=no. |
| Expected Result | Icons return 200 PNG, meta tags configured for PWA experience. |
| Type | Integration |

| Field | Value |
|-------|-------|
| TC ID | TC-PWA-029 to TC-PWA-031 |
| Module | PWA — Branding |
| Title | Offline page branded, retry button works, dashboard loading splash |
| Priority | Medium |
| Preconditions | None |
| Steps | 1. Visit /offline — verify branded design. 2. Verify retry button. 3. Visit / without auth — verify branded splash or redirect. |
| Expected Result | Offline page and loading state use navy gradient branding. |
| Type | E2E |

| Field | Value |
|-------|-------|
| TC ID | TC-PWA-032 to TC-PWA-034 |
| Module | PWA — IndexedDB |
| Title | IndexedDB open, write/read, and delete operations |
| Priority | High |
| Preconditions | Browser context |
| Steps | 1. Open binny_offline DB. 2. Write test record, read it back. 3. Delete record, verify empty. |
| Expected Result | All IndexedDB CRUD operations succeed in the browser environment. |
| Type | Integration |

---

## Summary

| Module | Test Case Range | Count |
|--------|----------------|-------|
| Authentication & Authorization | TC-AUTH-001 to TC-AUTH-020 | 20 |
| User Management | TC-USER-001 to TC-USER-010 | 10 |
| Product/SKU Management | TC-PROD-001 to TC-PROD-010 | 10 |
| Child Box QR Generation | TC-CB-001 to TC-CB-020 | 20 |
| Master Carton Packing | TC-MC-001 to TC-MC-025 | 25 |
| Storage Workflow | TC-STORE-001 to TC-STORE-010 | 10 |
| Unpack Workflow | TC-UNPACK-001 to TC-UNPACK-020 | 20 |
| Repack Workflow | TC-REPACK-001 to TC-REPACK-015 | 15 |
| Dispatch Workflow | TC-DISPATCH-001 to TC-DISPATCH-020 | 20 |
| Traceability | TC-TRACE-001 to TC-TRACE-010 | 10 |
| Reporting | TC-REPORT-001 to TC-REPORT-015 | 15 |
| QR Scanning | TC-SCAN-001 to TC-SCAN-010 | 10 |
| PWA & Mobile (Phase 1) | TC-PWA-001 to TC-PWA-010 | 10 |
| Label Printing | TC-PRINT-001 to TC-PRINT-010 | 10 |
| Multi-Size QR Batch Generation | TC-MSQR-001 to TC-MSQR-010 | 10 |
| Phase 2 UI Enhancement | TC-UI-001 to TC-UI-031 | 31 |
| UAT Bug Fix Validation | TC-UAT-001 to TC-UAT-006 | 6 |
| Phase 3 PWA Enhancement (NEW) | TC-PWA-001 to TC-PWA-034 | 34 |
| Edge Cases & Negative Tests | TC-EDGE-001 to TC-EDGE-015 | 15 |
| Performance Tests | TC-PERF-001 to TC-PERF-005 | 5 |
| **Total** | | **306** |

### Priority Distribution

| Priority | Count |
|----------|-------|
| Critical | 67 |
| High | 124 |
| Medium | 82 |
| Low | 33 |

### Test Type Distribution

| Type | Count |
|------|-------|
| E2E | 221 |
| Integration | 99 |
| Unit | 10 |
| Security | 19 |
