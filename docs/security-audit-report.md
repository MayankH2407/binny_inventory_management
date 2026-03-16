# Security Audit Report

**Project:** QR-Based Inventory Management System
**Client:** Binny Footwear
**Prepared by:** Basiq360 Security Engineering
**Date:** 2026-03-16 (Updated with Customer Master & Product expansion)
**Classification:** Confidential
**Version:** 1.1

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Authentication & Authorization](#2-authentication--authorization)
3. [API Security](#3-api-security)
4. [QR Code Security](#4-qr-code-security)
5. [Data Security](#5-data-security)
6. [Infrastructure Security](#6-infrastructure-security)
7. [Client-Side Security](#7-client-side-security)
8. [Audit & Monitoring](#8-audit--monitoring)
9. [Business Logic Security](#9-business-logic-security)
10. [Compliance & Data Privacy](#10-compliance--data-privacy)
11. [Recommendations Priority Matrix](#11-recommendations-priority-matrix)
12. [Security Checklist (Pre-Launch)](#12-security-checklist-pre-launch)

---

## 1. Executive Summary

### Scope

This audit covers the full technology stack of the QR-based Inventory Management System built for Binny Footwear: the Next.js PWA frontend, Express.js REST API backend, PostgreSQL database, Docker deployment infrastructure, and the QR code scanning workflow used by warehouse and dispatch operators.

### Key Findings Summary

| Severity | Count | Category |
|----------|-------|----------|
| Critical | 4 | JWT storage, HTTPS enforcement, DB credential management, SQL injection prevention |
| High | 6 | RBAC middleware enforcement, rate limiting, QR tampering, Docker root user, CSRF, backup encryption |
| Medium | 8 | Password policy, CSP headers, log masking, concurrent sessions, service worker scope, connection pooling, optimistic locking, data retention |
| Low | 5 | Cache policy, audit log format, GDPR readiness, image scanning automation, monitoring dashboards |

### Overall Risk Rating: **HIGH**

The system handles warehouse inventory operations with multiple user roles across mobile devices. While the Next.js and Express.js stack provides solid defaults, several areas require hardening before production deployment. The primary concerns are around JWT token storage on mobile PWA clients, QR code integrity validation, and business logic atomicity for packing and dispatch operations.

---

## 2. Authentication & Authorization

### 2.1 JWT Implementation

**Current Design:** JWT-based stateless authentication with access and refresh tokens.

#### Token Expiry Configuration

| Token Type | Recommended Expiry | Rationale |
|------------|-------------------|-----------|
| Access Token | 15 minutes | Limits window of exploitation if token is leaked. Short-lived tokens reduce the need for a server-side revocation list. |
| Refresh Token | 7 days | Balances security with usability for warehouse operators who should not need to log in every shift. |

#### Refresh Token Rotation

Every time a refresh token is used to obtain a new access token, the server MUST:

1. Issue a new refresh token alongside the new access token.
2. Invalidate the old refresh token in the database.
3. If a previously invalidated refresh token is presented, treat this as a token theft event: invalidate the entire refresh token family and force re-authentication.

**Implementation requirement:**

```
Table: refresh_tokens
- id: UUID (PK)
- user_id: UUID (FK -> users)
- token_hash: VARCHAR(255) -- store bcrypt/SHA-256 hash, never plaintext
- family_id: UUID -- groups tokens from the same login session
- is_revoked: BOOLEAN DEFAULT false
- expires_at: TIMESTAMP
- created_at: TIMESTAMP
```

#### Token Storage

| Method | Security | Recommendation |
|--------|----------|----------------|
| localStorage | Vulnerable to XSS. Any injected script can read tokens. | **DO NOT USE** |
| sessionStorage | Same XSS risk as localStorage. Lost on tab close. | **DO NOT USE** |
| httpOnly Secure Cookies | Not accessible via JavaScript. Sent automatically with requests. | **RECOMMENDED** |

**Mandatory cookie attributes:**

```
Set-Cookie: access_token=<jwt>;
  HttpOnly;
  Secure;
  SameSite=Strict;
  Path=/api;
  Max-Age=900
```

```
Set-Cookie: refresh_token=<jwt>;
  HttpOnly;
  Secure;
  SameSite=Strict;
  Path=/api/auth/refresh;
  Max-Age=604800
```

**Critical note on the `Path` attribute:** The refresh token cookie MUST be scoped to `/api/auth/refresh` only. This prevents it from being sent with every API request, limiting exposure.

#### JWT Signing

- Use RS256 (asymmetric) or HS256 (symmetric) with a key of at least 256 bits.
- If using HS256, the `JWT_SECRET` must be a cryptographically random string of at least 64 characters. Do not use human-readable passphrases.
- The `alg: "none"` attack must be prevented by explicitly verifying the algorithm on the server side. Use the `algorithms` option in `jsonwebtoken.verify()`:

```javascript
jwt.verify(token, secret, { algorithms: ['HS256'] });
```

#### JWT Payload

The JWT payload must contain only non-sensitive identifiers:

```json
{
  "sub": "user-uuid",
  "role": "warehouse_operator",
  "iat": 1710000000,
  "exp": 1710000900
}
```

**Never include** in the JWT: passwords, email addresses, phone numbers, or any PII beyond what is strictly needed for authorization decisions.

### 2.2 Password Policy

**Minimum requirements:**

| Rule | Requirement |
|------|-------------|
| Minimum length | 8 characters |
| Maximum length | 128 characters (prevent bcrypt DoS via extremely long passwords) |
| Uppercase letter | At least 1 |
| Lowercase letter | At least 1 |
| Digit | At least 1 |
| Special character | At least 1 (`!@#$%^&*()_+-=[]{};\':\",./<>?`) |

**Password hashing:**

- Algorithm: **bcrypt**
- Salt rounds: **minimum 12** (adaptive; increase as hardware improves)
- Never implement custom hashing. Use the `bcryptjs` or `bcrypt` npm package.
- Never truncate passwords before hashing.
- Pre-hash with SHA-256 if supporting passwords longer than 72 bytes (bcrypt's internal limit).

**Additional controls:**

- Enforce password change on first login for admin-created accounts.
- Implement account lockout after 5 consecutive failed login attempts. Lock duration: 15 minutes, or until admin unlock.
- Return generic error messages: "Invalid email or password." Never reveal whether the email exists.

### 2.3 Role-Based Access Control (RBAC)

**Role Hierarchy and Permission Matrix:**

| Resource / Action | Admin | Supervisor | Warehouse Operator | Dispatch Operator |
|---|---|---|---|---|
| User management (CRUD) | Full | Read-only | None | None |
| Role assignment | Full | None | None | None |
| View all inventory | Full | Full | Assigned warehouse | Assigned dispatch |
| Create carton | Yes | Yes | Yes | No |
| Pack child box into carton | Yes | Yes | Yes | No |
| Unpack child box from carton | Yes | Yes | Yes | No |
| Dispatch carton | Yes | Yes | No | Yes |
| Receive carton | Yes | Yes | No | Yes |
| View audit logs | Full | Own warehouse | None | None |
| Generate reports | Full | Own warehouse | None | None |
| System configuration | Full | None | None | None |
| QR code generation | Full | Full | None | None |

**Enforcement layers:**

1. **Middleware-level:** An Express.js middleware must extract the user role from the validated JWT and attach it to the request object. A separate authorization middleware must check the role against the required permission before the route handler executes.

```javascript
// Example middleware chain
router.post('/api/cartons/:id/dispatch',
  authenticate,           // Validates JWT, attaches req.user
  authorize(['admin', 'supervisor', 'dispatch_operator']),  // Checks role
  validateInput(dispatchSchema),  // Validates request body
  dispatchController.dispatch     // Business logic
);
```

2. **API-level:** Every controller must verify that the authenticated user has permission to act on the specific resource (e.g., a warehouse operator can only operate on cartons in their assigned warehouse). This prevents horizontal privilege escalation.

3. **Database-level:** Row-Level Security (RLS) in PostgreSQL can serve as a defense-in-depth layer, though it should not be the sole enforcement mechanism.

### 2.4 Session Management

| Control | Requirement |
|---------|-------------|
| Concurrent session limit | Maximum 2 active sessions per user (one desktop, one mobile) |
| Force logout | Admin can revoke all refresh tokens for a user, forcing re-authentication |
| Idle timeout | Access token expiry handles this (15 min). No separate idle timer needed for stateless JWT. |
| Session on password change | Revoke all existing refresh tokens when a user changes their password |
| Session on role change | Revoke all existing refresh tokens when an admin changes a user's role |

---

## 3. API Security

### 3.1 Input Validation

Every API endpoint MUST validate all input using **Zod** (recommended for TypeScript projects) or **Joi** schema validation. Validation must occur in middleware, before the request reaches any business logic.

**Rules:**

- Validate request body, query parameters, URL parameters, and headers.
- Use allowlists (explicitly define accepted fields), not denylists.
- Strip unknown fields from validated objects (`stripUnknown: true` in Joi, `.strict()` in Zod).
- Define explicit types, lengths, formats, and ranges for every field.
- Reject requests that fail validation with a `400 Bad Request` and a structured error response that does not leak internal schema details.

**Example Zod schema for carton creation:**

```typescript
const createCartonSchema = z.object({
  label: z.string().min(1).max(100).regex(/^[a-zA-Z0-9\-_]+$/),
  warehouseId: z.string().uuid(),
  expectedChildCount: z.number().int().min(1).max(500),
});
```

**Example Zod schema for customer creation (NEW — March 2026):**

```typescript
const createCustomerSchema = z.object({
  firmName: z.string().min(1).max(255).trim(),
  address: z.string().max(1000).optional(),
  deliveryLocation: z.string().max(255).optional(),
  gstin: z.string().regex(/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/).optional()
    .describe('15-char Indian GSTIN format validation'),
  privateMarka: z.string().max(255).optional(),
  gr: z.string().max(100).optional(),
  contactPersonName: z.string().max(150).optional(),
  contactPersonMobile: z.string().regex(/^[0-9]{10,15}$/).optional(),
});
```

**Example Zod schema for product expansion (NEW — March 2026):**

```typescript
const createProductSchema = z.object({
  // ... existing fields ...
  category: z.enum(['Gents', 'Ladies', 'Boys', 'Girls']),
  section: z.enum(['Hawaii', 'PU', 'EVA', 'Fabrication', 'Canvas', 'PVC', 'Sports Shoes']),
  location: z.enum(['VKIA', 'MIA', 'F540']),
  articleGroup: z.string().max(100).optional(),
  hsnCode: z.string().max(20).regex(/^[0-9]+$/).optional(),
  sizeGroup: z.string().max(50).optional(),
});
```

### 3.2 Rate Limiting

Implement rate limiting at two levels using `express-rate-limit`:

| Endpoint Category | Rate Limit | Window | Key |
|---|---|---|---|
| Authentication (`/api/auth/*`) | 10 requests | 15 minutes | Per IP |
| QR scan operations | 60 requests | 1 minute | Per user |
| General API | 100 requests | 1 minute | Per user |
| Report generation | 5 requests | 5 minutes | Per user |
| Customer data export | 5 requests | 5 minutes | Per user |

**Additional measures:**

- Use `rate-limit-redis` or `rate-limit-postgresql` for distributed rate limiting if running multiple server instances.
- Return `429 Too Many Requests` with a `Retry-After` header.
- Log rate limit violations for security monitoring.

### 3.3 CORS Configuration

```javascript
const corsOptions = {
  origin: [
    'https://inventory.binnyfootwear.com',  // Production frontend
    // Add staging/dev origins only in non-production environments
  ],
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-CSRF-Token'],
  credentials: true,  // Required for httpOnly cookies
  maxAge: 86400,      // Cache preflight for 24 hours
};

app.use(cors(corsOptions));
```

**Rules:**

- Never use `origin: '*'` in production.
- Never use `origin: true` (reflects any origin) in production.
- The `credentials: true` setting is required for cookies to be sent cross-origin. When this is set, the `Access-Control-Allow-Origin` header MUST NOT be `*`.

### 3.4 HTTP Security Headers (Helmet.js)

```javascript
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],  // Minimize unsafe-inline
      imgSrc: ["'self'", "data:", "blob:"],     // blob: needed for QR camera
      connectSrc: ["'self'"],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"],
    },
  },
  crossOriginEmbedderPolicy: true,
  crossOriginOpenerPolicy: true,
  crossOriginResourcePolicy: { policy: "same-site" },
  dnsPrefetchControl: true,
  frameguard: { action: 'deny' },
  hsts: { maxAge: 31536000, includeSubDomains: true, preload: true },
  ieNoOpen: true,
  noSniff: true,
  permittedCrossDomainPolicies: { permittedPolicies: "none" },
  referrerPolicy: { policy: "strict-origin-when-cross-origin" },
  xssFilter: true,
}));
```

### 3.5 Request Size Limits

```javascript
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));
```

For file upload endpoints (if any), use `multer` with explicit file size and type restrictions.

### 3.6 SQL Injection Prevention

**Mandatory:** Use parameterized queries or an ORM (Prisma, Knex, Sequelize) for all database operations. Never concatenate user input into SQL strings.

**Vulnerable (NEVER do this):**

```javascript
// DANGEROUS - SQL injection vulnerability
const result = await db.query(
  `SELECT * FROM cartons WHERE id = '${req.params.id}'`
);
```

**Secure:**

```javascript
// Parameterized query
const result = await db.query(
  'SELECT * FROM cartons WHERE id = $1',
  [req.params.id]
);
```

**Additional measures:**

- Enable PostgreSQL's `log_statement = 'all'` in staging to catch any raw query construction during development.
- Use a static analysis tool (e.g., `eslint-plugin-security`) in the CI pipeline to flag string concatenation in query contexts.

### 3.7 JSONB Injection Prevention

PostgreSQL JSONB fields are vulnerable to injection if query operators are constructed from user input.

**Vulnerable:**

```javascript
// DANGEROUS - allows injection of JSONB operators
const filter = req.query.filter;
const result = await db.query(
  `SELECT * FROM products WHERE metadata @> '${filter}'`
);
```

**Secure:**

```javascript
const result = await db.query(
  'SELECT * FROM products WHERE metadata @> $1::jsonb',
  [JSON.stringify(validatedFilter)]
);
```

Always validate and sanitize any user input before it is used in JSONB queries. Define explicit schemas for JSONB filter parameters.

---

## 4. QR Code Security

### 4.1 QR Code Content Design

**Rule: QR codes must encode only an opaque identifier, never sensitive or business-critical data.**

| Approach | Security | Recommendation |
|----------|----------|----------------|
| Encode full product details in QR | Tamperable. Anyone with a QR generator can create fake codes. | **DO NOT USE** |
| Encode a URL with embedded ID | Acceptable if URL points to a whitelisted domain and the ID is validated server-side. | **ACCEPTABLE** |
| Encode only a UUID/short ID | Most secure. All data is fetched server-side after scanning. | **RECOMMENDED** |

**Recommended QR content format:**

```
https://inventory.binnyfootwear.com/scan/{entity_type}/{uuid}
```

Where `entity_type` is one of `box`, `carton`, or `pallet`, and `uuid` is a v4 UUID stored in the database. The URL serves dual purpose: it is scannable by the app (which extracts the UUID) and by any standard QR reader (which opens the company website with product information).

### 4.2 QR URL Validation

When the `html5-qrcode` library returns a scanned value, the frontend MUST:

1. Parse the URL and verify the hostname matches the whitelist:
   ```javascript
   const ALLOWED_HOSTS = ['inventory.binnyfootwear.com'];

   function validateQRUrl(scannedValue) {
     try {
       const url = new URL(scannedValue);
       if (!ALLOWED_HOSTS.includes(url.hostname)) {
         throw new Error('Invalid QR code origin');
       }
       const pathParts = url.pathname.split('/');
       const entityType = pathParts[2]; // 'box', 'carton', 'pallet'
       const entityId = pathParts[3];   // UUID

       if (!['box', 'carton', 'pallet'].includes(entityType)) {
         throw new Error('Invalid entity type');
       }
       if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(entityId)) {
         throw new Error('Invalid entity ID format');
       }
       return { entityType, entityId };
     } catch (e) {
       throw new Error('Malformed QR code');
     }
   }
   ```

2. Send only the extracted `entityType` and `entityId` to the backend API. Never forward the raw scanned URL to the backend.

3. The backend MUST independently validate the entity exists in the database and the user has permission to act on it.

### 4.3 QR Code Tampering Risks

| Threat | Mitigation |
|--------|------------|
| Attacker prints a fake QR code pointing to a different entity | Server validates entity exists and user has permission. Audit log records all scans. Anomaly detection flags unusual scan patterns. |
| Attacker replaces QR sticker on a physical box | Physical security controls (tamper-evident labels). Server-side state validation prevents illogical operations (e.g., scanning a box that is already dispatched). |
| QR code encodes a malicious URL | Frontend URL validation against whitelist. Backend never processes URLs from QR codes directly. |

### 4.4 Duplicate and Replay Attack Prevention

**Idempotency and state checks are mandatory for all scan-triggered operations.**

| Operation | Protection |
|-----------|------------|
| Pack child box into carton | DB unique constraint: `UNIQUE(child_box_id, active_carton_id)` with a check that the child box has status `unpacked` or `available`. An already-packed box must be unpacked first. |
| Unpack child box from carton | Check that the box is currently in status `packed` and belongs to the specified carton. |
| Dispatch carton | Check that the carton is in status `packed` (not `dispatched` or `empty`). Use `SELECT ... FOR UPDATE` to lock the row during the transaction. |
| Rapid double-scan | Implement a per-user, per-entity cooldown of 3 seconds on the backend. Reject duplicate operations within the cooldown window. |

**Database constraint example:**

```sql
ALTER TABLE carton_items
  ADD CONSTRAINT unique_active_child_box
  EXCLUDE USING gist (
    child_box_id WITH =,
    daterange(packed_at::date, unpacked_at::date, '[]') WITH &&
  )
  WHERE (status = 'packed');
```

---

## 5. Data Security

### 5.1 PostgreSQL Security

#### Encrypted Connections

```
# postgresql.conf
ssl = on
ssl_cert_file = '/path/to/server.crt'
ssl_key_file = '/path/to/server.key'
ssl_ca_file = '/path/to/ca.crt'
ssl_min_protocol_version = 'TLSv1.2'
```

The application connection string must enforce SSL:

```
postgresql://user:pass@host:5432/dbname?sslmode=verify-full&sslrootcert=/path/to/ca.crt
```

#### Least Privilege Database Users

Create separate database users for different application roles:

| DB User | Privileges | Used By |
|---------|------------|---------|
| `app_readonly` | SELECT on all tables | Reporting and analytics queries |
| `app_readwrite` | SELECT, INSERT, UPDATE on business tables | Main application backend |
| `app_admin` | Full privileges | Migration scripts only (never used at runtime) |

```sql
-- Create read-write application user
CREATE ROLE app_readwrite WITH LOGIN PASSWORD '<strong-random>';
GRANT CONNECT ON DATABASE inventory TO app_readwrite;
GRANT USAGE ON SCHEMA public TO app_readwrite;
GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA public TO app_readwrite;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO app_readwrite;

-- Explicitly deny DELETE on critical tables
REVOKE DELETE ON cartons, carton_items, dispatch_records FROM app_readwrite;
```

**Note:** The application should use soft deletes (a `deleted_at` timestamp) rather than hard deletes for all inventory-related tables. This preserves audit integrity.

#### Connection Pooling Security

Use `pg-pool` or PgBouncer with the following settings:

- Maximum pool size: 20 connections (adjust based on load testing).
- Idle timeout: 30 seconds.
- Connection timeout: 5 seconds.
- Do not share a single pool user across services. Each microservice or function gets its own pool with its own credentials.

### 5.2 Data at Rest

#### Sensitive Field Encryption

Fields that require application-level encryption (beyond PostgreSQL's disk encryption):

| Field | Encryption | Rationale |
|-------|-----------|-----------|
| User passwords | bcrypt (12+ rounds) | One-way hash; passwords are never decrypted |
| Refresh token values | SHA-256 hash | Stored hashed; compared by hashing the incoming token |
| API keys (if any) | AES-256-GCM | Reversible encryption; needed for integration calls |

For AES-256-GCM encryption, use a dedicated encryption key stored in environment variables or a secrets manager, never in the database.

#### Disk-Level Encryption

- Enable Transparent Data Encryption (TDE) or use encrypted volumes (e.g., LUKS on Linux, BitLocker on Windows) for the PostgreSQL data directory.
- Docker volumes storing database data must be on encrypted host filesystems.

### 5.3 Data in Transit

#### HTTPS Enforcement

- All client-server communication must use HTTPS. HTTP requests must be redirected to HTTPS with a `301 Permanent Redirect`.
- HSTS header must be set with a `max-age` of at least 1 year (31536000 seconds), with `includeSubDomains` and `preload` directives.
- TLS configuration must disable TLS 1.0 and TLS 1.1. Only TLS 1.2 and TLS 1.3 are permitted.

**Nginx configuration (if used as reverse proxy):**

```nginx
ssl_protocols TLSv1.2 TLSv1.3;
ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384;
ssl_prefer_server_ciphers on;
ssl_session_timeout 1d;
ssl_session_cache shared:SSL:10m;
ssl_session_tickets off;
```

#### Internal Service Communication

If the Express.js backend communicates with other internal services (e.g., a notification service), these connections must also use TLS, or be restricted to a private Docker network with no external access.

### 5.4 Backup Security

| Requirement | Implementation |
|-------------|----------------|
| Encryption | `pg_dump` output piped through `gpg --symmetric --cipher-algo AES256` or encrypted using cloud-native backup encryption |
| Access control | Backup files accessible only to a dedicated backup service account |
| Retention | Daily backups retained for 30 days, weekly backups retained for 90 days, monthly backups retained for 1 year |
| Integrity | SHA-256 checksum generated for each backup file and stored separately |
| Testing | Automated restore test performed weekly against a staging environment |
| Off-site storage | Backups replicated to a geographically separate location |

---

## 6. Infrastructure Security

### 6.1 Docker Security

#### Non-Root Containers

All containers MUST run as a non-root user.

```dockerfile
# In Dockerfile
RUN addgroup --system appgroup && adduser --system appuser --ingroup appgroup
USER appuser
```

Verify in `docker-compose.yml`:

```yaml
services:
  api:
    user: "1001:1001"
    read_only: true
    tmpfs:
      - /tmp
    security_opt:
      - no-new-privileges:true
```

#### Container Hardening Checklist

| Control | Implementation |
|---------|----------------|
| Non-root user | `USER appuser` in Dockerfile |
| Read-only filesystem | `read_only: true` in compose, with `tmpfs` for writable dirs |
| No privilege escalation | `security_opt: [no-new-privileges:true]` |
| Resource limits | `deploy.resources.limits` for CPU and memory |
| No unnecessary capabilities | `cap_drop: [ALL]`, then `cap_add` only what is needed |
| Minimal base image | Use `node:20-alpine` or `node:20-slim`, not `node:20` |
| Multi-stage builds | Build dependencies in a builder stage; copy only production artifacts to the final image |
| No secrets in image | Never `COPY .env` or embed credentials. Use Docker secrets or environment injection. |

#### Image Vulnerability Scanning

- Integrate `trivy` or `docker scout` into the CI pipeline.
- Fail the build if any Critical or High severity vulnerabilities are found.
- Scan images on every push and on a weekly schedule for newly discovered CVEs.

```yaml
# Example CI step
- name: Scan image
  run: trivy image --exit-code 1 --severity CRITICAL,HIGH app:latest
```

### 6.2 Environment Variables and Secrets

#### Rules

- `.env` files must be listed in `.gitignore` and `.dockerignore`. Verify this before every release.
- Never log environment variables. If startup logging includes config, mask all secrets.
- Rotate secrets (JWT secret, DB password, API keys) on a quarterly schedule or immediately upon suspected compromise.

#### Secrets Management Strategy

| Environment | Strategy |
|-------------|----------|
| Local development | `.env` file (gitignored), with `.env.example` committed as a template (no real values) |
| Staging | Environment variables injected via CI/CD pipeline secrets |
| Production | Docker secrets (`docker secret create`) or a dedicated secrets manager (AWS Secrets Manager, HashiCorp Vault) |

**Required secrets inventory:**

| Secret | Rotation Schedule |
|--------|-------------------|
| `JWT_SECRET` | Quarterly |
| `DATABASE_URL` | Quarterly |
| `REFRESH_TOKEN_SECRET` | Quarterly |
| `ENCRYPTION_KEY` (for AES fields) | Annually (with re-encryption migration) |
| `BACKUP_ENCRYPTION_KEY` | Annually |

### 6.3 Network Security

```yaml
# docker-compose.yml network isolation
networks:
  frontend:
    driver: bridge
  backend:
    driver: bridge
    internal: true  # No external access

services:
  nginx:
    networks:
      - frontend
      - backend
    ports:
      - "443:443"

  api:
    networks:
      - backend
    # No ports exposed to host

  db:
    networks:
      - backend
    # No ports exposed to host
```

**Firewall rules (host level):**

| Port | Source | Destination | Allow |
|------|--------|-------------|-------|
| 443 | Any | Nginx container | Yes |
| 80 | Any | Nginx container | Yes (redirect to 443) |
| 5432 | API container | DB container | Yes (internal network only) |
| 5432 | Any external | DB container | **DENY** |
| 3000 | Nginx container | API container | Yes (internal network only) |

---

## 7. Client-Side Security

### 7.1 PWA Security

#### Service Worker Scope

- The service worker must be scoped to the application's path only.
- The service worker must not intercept or cache requests to third-party domains.
- Service worker registration must occur only over HTTPS.

```javascript
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js', {
    scope: '/'
  });
}
```

#### Cache Security

| Resource Type | Cache Strategy | Sensitive |
|--------------|----------------|-----------|
| Static assets (JS, CSS, images) | Cache-first | No |
| API responses (inventory data) | Network-first | Yes -- do not cache |
| Authentication tokens | Never cache in service worker | Yes |
| User profile data | Network-only | Yes |

**Service worker must not cache:**

- Any response from `/api/*` that contains inventory data, user data, or authentication tokens.
- Any response with `Cache-Control: no-store` headers.

```javascript
// In service worker
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Never cache API responses
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(fetch(event.request));
    return;
  }

  // Cache-first for static assets only
  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request))
  );
});
```

#### HTTPS-Only PWA

The `manifest.json` and service worker will only function over HTTPS (browser enforcement). Ensure the `start_url` in `manifest.json` uses HTTPS.

### 7.2 XSS Prevention

#### React's Built-in Protection

React escapes all values embedded in JSX by default. This provides baseline protection against XSS.

**However, the following patterns bypass React's escaping and must be avoided:**

```javascript
// DANGEROUS - never use with user input
<div dangerouslySetInnerHTML={{ __html: userInput }} />

// DANGEROUS - never construct URLs from user input without validation
<a href={userProvidedUrl}>Link</a>

// DANGEROUS - never use user input in event handlers via string interpolation
<div onClick={`handleClick('${userInput}')`} />
```

#### Content Security Policy

The CSP header (configured via Helmet.js as shown in section 3.4) prevents inline script execution and restricts resource loading to trusted origins.

**Additional CSP considerations for the QR scanner:**

- The `html5-qrcode` library requires camera access. Ensure `media-src: 'self'` and the Permissions-Policy header allows camera:
  ```
  Permissions-Policy: camera=(self)
  ```
- If the library uses Web Workers, ensure `worker-src: 'self'` is included.

#### DOMPurify

If the application displays any user-generated content (e.g., carton labels, notes), sanitize it before rendering:

```javascript
import DOMPurify from 'dompurify';

function SafeDisplay({ content }) {
  return <span>{DOMPurify.sanitize(content, { ALLOWED_TAGS: [] })}</span>;
}
```

Using `ALLOWED_TAGS: []` strips all HTML, which is appropriate for plain-text fields like labels and notes.

### 7.3 CSRF Protection

#### SameSite Cookies

Using `SameSite=Strict` on authentication cookies (as recommended in section 2.1) prevents CSRF for most scenarios, as the browser will not send cookies on cross-site requests.

#### CSRF Tokens (Defense in Depth)

For state-changing operations (POST, PUT, PATCH, DELETE), implement CSRF token validation as an additional layer:

1. Server generates a CSRF token on session creation and sends it to the client via a non-httpOnly cookie (`X-CSRF-Token`).
2. Client reads this cookie and includes it as a header (`X-CSRF-Token`) in every state-changing request.
3. Server validates the header matches the cookie.

```javascript
// Backend middleware
const csrfProtection = (req, res, next) => {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    return next();
  }

  const cookieToken = req.cookies['csrf-token'];
  const headerToken = req.headers['x-csrf-token'];

  if (!cookieToken || !headerToken || cookieToken !== headerToken) {
    return res.status(403).json({ error: 'CSRF validation failed' });
  }

  next();
};
```

---

## 8. Audit & Monitoring

### 8.1 Audit Log Implementation

**Every state change in the inventory system must be logged.** This is both a security requirement and a business requirement for inventory accountability.

#### Audit Log Schema

```sql
CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  user_id UUID NOT NULL REFERENCES users(id),
  user_role VARCHAR(50) NOT NULL,
  action VARCHAR(100) NOT NULL,
  entity_type VARCHAR(50) NOT NULL,
  entity_id UUID NOT NULL,
  details JSONB,
  ip_address INET,
  user_agent TEXT,
  request_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_audit_logs_timestamp ON audit_logs(timestamp);
CREATE INDEX idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX idx_audit_logs_entity ON audit_logs(entity_type, entity_id);
CREATE INDEX idx_audit_logs_action ON audit_logs(action);
```

#### Actions to Log

| Action | Entity Type | Details |
|--------|-------------|---------|
| `user.login` | user | `{ "method": "password" }` |
| `user.login_failed` | user | `{ "reason": "invalid_password", "attempt_count": 3 }` |
| `user.logout` | user | `{}` |
| `user.password_changed` | user | `{}` |
| `carton.created` | carton | `{ "label": "C-001", "warehouse_id": "..." }` |
| `carton.child_packed` | carton | `{ "child_box_id": "...", "position": 5 }` |
| `carton.child_unpacked` | carton | `{ "child_box_id": "...", "reason": "damaged" }` |
| `carton.dispatched` | carton | `{ "destination": "...", "child_count": 12 }` |
| `carton.received` | carton | `{ "received_by": "...", "condition": "intact" }` |
| `qr.scanned` | box/carton | `{ "scan_result": "success", "action_taken": "pack" }` |
| `qr.scan_rejected` | box/carton | `{ "reason": "already_packed", "attempted_action": "pack" }` |
| `role.changed` | user | `{ "old_role": "operator", "new_role": "supervisor" }` |

#### Audit Log Integrity

- Audit logs must be append-only. The application database user must not have DELETE or UPDATE permissions on the `audit_logs` table.
- Consider using a separate database or write-once storage for audit logs in high-security deployments.

### 8.2 Log Format Standardization

Use structured JSON logging with a consistent format across all services:

```json
{
  "timestamp": "2026-03-12T10:30:00.000Z",
  "level": "info",
  "service": "inventory-api",
  "request_id": "req-uuid-here",
  "user_id": "user-uuid-here",
  "method": "POST",
  "path": "/api/cartons/abc/pack",
  "status": 200,
  "duration_ms": 45,
  "message": "Child box packed into carton"
}
```

Use `winston` or `pino` for structured logging. Pino is recommended for production due to lower overhead.

### 8.3 Sensitive Data Masking in Logs

The following must NEVER appear in logs:

| Data | Masking |
|------|---------|
| Passwords | Never log, even masked |
| JWT tokens | Log only last 8 characters: `...abc12345` |
| Database connection strings | Log only host and database name, never credentials |
| QR code content | Log only entity type and ID, never full URL |
| User email | Mask: `j***@example.com` |
| IP addresses | Retain in audit logs, mask in application logs if not needed |

### 8.4 Monitoring Recommendations

#### Security-Critical Alerts

| Condition | Threshold | Action |
|-----------|-----------|--------|
| Failed login attempts | > 5 per user per 15 min | Lock account, alert admin |
| Failed login attempts (distributed) | > 20 from same IP per hour | Block IP, alert security team |
| Rate limit violations | > 10 per user per hour | Alert admin, investigate |
| Unusual scan patterns | > 100 scans per user per hour | Alert supervisor |
| Bulk status changes | > 50 dispatches per user per hour | Require supervisor approval |
| Failed authorization checks | Any occurrence | Log and alert; may indicate privilege escalation attempt |
| Refresh token reuse | Any occurrence | Revoke token family, alert user and admin |

#### Operational Monitoring

- API response time (P50, P95, P99)
- Error rate (5xx responses)
- Database connection pool utilization
- Memory and CPU usage per container
- Disk usage on database volume

---

## 9. Business Logic Security

### 9.1 Inventory Manipulation Prevention

All inventory state changes must be atomic. A partial failure must not leave the system in an inconsistent state.

**Transaction pattern for packing a child box:**

```javascript
const packChildBox = async (cartonId, childBoxId, userId) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Lock the carton row to prevent concurrent modifications
    const carton = await client.query(
      'SELECT * FROM cartons WHERE id = $1 FOR UPDATE',
      [cartonId]
    );

    if (!carton.rows[0]) throw new NotFoundError('Carton not found');
    if (carton.rows[0].status !== 'packing') throw new ConflictError('Carton is not in packing state');

    // Lock the child box row
    const childBox = await client.query(
      'SELECT * FROM child_boxes WHERE id = $1 FOR UPDATE',
      [childBoxId]
    );

    if (!childBox.rows[0]) throw new NotFoundError('Child box not found');
    if (childBox.rows[0].status !== 'available') throw new ConflictError('Child box is not available for packing');

    // Perform the pack operation
    await client.query(
      'INSERT INTO carton_items (carton_id, child_box_id, packed_at, packed_by) VALUES ($1, $2, NOW(), $3)',
      [cartonId, childBoxId, userId]
    );

    await client.query(
      'UPDATE child_boxes SET status = $1, current_carton_id = $2 WHERE id = $3',
      ['packed', cartonId, childBoxId]
    );

    await client.query(
      'UPDATE cartons SET child_count = child_count + 1, updated_at = NOW() WHERE id = $1',
      [cartonId]
    );

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};
```

#### Database Constraints

```sql
-- A child box can only be in one active carton at a time
ALTER TABLE child_boxes
  ADD CONSTRAINT check_single_active_carton
  CHECK (
    (status = 'available' AND current_carton_id IS NULL) OR
    (status = 'packed' AND current_carton_id IS NOT NULL) OR
    (status = 'dispatched' AND current_carton_id IS NOT NULL)
  );

-- Prevent duplicate entries in carton_items for the same child box
CREATE UNIQUE INDEX idx_unique_active_packing
  ON carton_items (child_box_id)
  WHERE status = 'packed';
```

### 9.2 Status Transition Enforcement

Implement a finite state machine for each entity type. Only valid transitions are permitted.

#### Child Box States

```
available -> packed -> dispatched -> received
                  \-> available (unpack)
```

#### Carton States

```
created -> packing -> packed -> dispatched -> received
              \-> created (unpack all, only if no dispatches)
```

**Implementation:**

```javascript
const VALID_TRANSITIONS = {
  child_box: {
    available: ['packed'],
    packed: ['available', 'dispatched'],
    dispatched: ['received'],
    received: [],
  },
  carton: {
    created: ['packing'],
    packing: ['packed', 'created'],
    packed: ['dispatched'],
    dispatched: ['received'],
    received: [],
  },
};

function validateTransition(entityType, currentStatus, newStatus) {
  const allowed = VALID_TRANSITIONS[entityType]?.[currentStatus];
  if (!allowed || !allowed.includes(newStatus)) {
    throw new ConflictError(
      `Invalid status transition: ${entityType} cannot go from '${currentStatus}' to '${newStatus}'`
    );
  }
}
```

**Rules enforced by this state machine:**

- A carton cannot be dispatched unless it is in `packed` status.
- A child box cannot be unpacked from a dispatched carton.
- A dispatched carton cannot be re-packed.
- A received carton cannot be re-dispatched.

### 9.3 Concurrency Handling

#### Optimistic Locking

For operations initiated from the UI (where the user views data before submitting a change), implement optimistic locking using a `version` column:

```sql
ALTER TABLE cartons ADD COLUMN version INTEGER NOT NULL DEFAULT 1;
```

```javascript
// When updating, include version check
const result = await client.query(
  `UPDATE cartons
   SET status = $1, version = version + 1, updated_at = NOW()
   WHERE id = $2 AND version = $3
   RETURNING *`,
  [newStatus, cartonId, expectedVersion]
);

if (result.rowCount === 0) {
  throw new ConflictError(
    'Carton was modified by another user. Please refresh and try again.'
  );
}
```

#### Pessimistic Locking (Critical Operations)

For scan-triggered operations where two warehouse operators might scan the same box simultaneously, use `SELECT ... FOR UPDATE` (as shown in the packing transaction example above) to serialize access.

#### Race Condition Scenarios

| Scenario | Risk | Mitigation |
|----------|------|------------|
| Two operators scan the same child box to pack into different cartons | Child box assigned to both cartons | `SELECT ... FOR UPDATE` on child box row; unique index on active packing |
| Operator packs a box while another dispatches the carton | Inconsistent child count in dispatched carton | `SELECT ... FOR UPDATE` on carton row; status check within transaction |
| Two operators dispatch the same carton simultaneously | Duplicate dispatch records | `SELECT ... FOR UPDATE` on carton row; status transition validation |
| Rapid double-tap on scan button | Duplicate API calls | Backend deduplication via 3-second cooldown; frontend button debounce (500ms) |

---

## 10. Compliance & Data Privacy

### 10.1 Data Retention Policies

| Data Type | Retention Period | Deletion Method |
|-----------|-----------------|-----------------|
| Active inventory records | Indefinite (while active) | Soft delete when no longer needed |
| Completed dispatch records | 7 years | Archived to cold storage after 1 year |
| Audit logs | 7 years | Write-once storage; no deletion |
| User accounts (active) | Duration of employment | Soft delete on deactivation |
| User accounts (deactivated) | 2 years after deactivation | Hard delete PII, retain anonymized audit references |
| QR scan logs | 3 years | Archived after 1 year |
| Application logs | 90 days | Automated rotation and deletion |
| Backup files | Per backup schedule (section 5.4) | Secure deletion with verification |
| Customer records (active) | Indefinite (while active) | Soft delete on deactivation |
| Customer records (deactivated) | 7 years | PII anonymized after 2 years, business references retained for audit |
| Customer GSTIN | Indefinite (while active) | Encrypted at rest; masked in logs; anonymized on deletion |

### 10.2 User Data Handling

| Data Point | Collected | Purpose | Shared With |
|------------|-----------|---------|-------------|
| Full name | Yes | User identification in audit logs | Internal only |
| Email address | Yes | Login credential, notifications | Internal only |
| Phone number | Optional | Account recovery, notifications | Internal only |
| Password (hashed) | Yes | Authentication | Never shared |
| IP address | Yes (in logs) | Security monitoring | Internal only |
| Device info / User-Agent | Yes (in logs) | Security monitoring | Internal only |

### 10.2.1 Customer Data Handling (NEW — March 2026)

The Customer Master module stores business-sensitive data that requires specific handling:

| Data Point | Sensitivity | Handling |
|------------|-------------|----------|
| Firm Name | Low | Business name — no special restrictions |
| Address | Medium | Business address — standard access control |
| Delivery Location | Low | Logistics data — accessible to dispatch operators |
| **GSTIN** | **High** | **Tax identification number — PII equivalent. Must be masked in logs, API responses limited to authorized roles, encrypted at rest if possible** |
| Private Marka | Medium | Trade secret — customer's private brand mark. Access restricted to Admin/Supervisor |
| GR (Goods Receipt) | Low | Business document reference |
| **Contact Person Name** | **Medium** | **PII — access restricted, must be anonymizable for data deletion requests** |
| **Contact Person Mobile** | **High** | **PII — must be masked in logs (show only last 4 digits), access restricted to Admin/Supervisor** |

**Security Rules for Customer Data:**
- GSTIN must never appear in application logs or error messages
- Contact mobile must be masked in API list responses (show as `XXXXXX1234`)
- Full customer details visible only to Admin and Supervisor roles
- Warehouse and Dispatch operators see only firm name and delivery location
- Customer data export must be limited to Admin role
- Customer soft-delete must retain records for dispatch history but allow PII anonymization

### 10.3 Audit Trail Retention

- Audit logs are considered business-critical records and must be retained for a minimum of 7 years.
- Audit logs must not be modified or deleted by any application user, including admins.
- Audit log access for review purposes must itself be logged.
- Consider database partitioning by month for the `audit_logs` table to manage query performance over time.

### 10.4 GDPR Considerations

If the system processes data of individuals covered by GDPR (e.g., EU-based employees or partners), the following applies:

| Requirement | Implementation |
|-------------|----------------|
| Right to access | Admin can export all data associated with a user account |
| Right to erasure | PII can be anonymized (replace name/email with "DELETED_USER_xxxx") while retaining audit integrity |
| Data minimization | Collect only data necessary for system operation |
| Consent | Employee consent obtained as part of onboarding |
| Data Processing Agreement | Required with any third-party service that processes user data |
| Breach notification | Notify affected users and authorities within 72 hours of discovering a breach |

---

## 11. Recommendations Priority Matrix

### Critical (Must Fix Before Launch)

| ID | Finding | Risk | Recommendation |
|----|---------|------|----------------|
| C-1 | JWT tokens stored in localStorage | Token theft via XSS allows full account takeover | Migrate to httpOnly Secure cookies with SameSite=Strict |
| C-2 | HTTPS not enforced | All data transmitted in plaintext; session hijacking | Configure TLS termination, HSTS header, HTTP->HTTPS redirect |
| C-3 | Database credentials in source code or Docker image | Full database compromise | Move all secrets to environment variables or Docker secrets; verify .gitignore |
| C-4 | Raw SQL queries with string concatenation | SQL injection leading to data breach or destruction | Audit all database queries; replace with parameterized queries or ORM |

### High (Fix Within First Sprint Post-Launch)

| ID | Finding | Risk | Recommendation |
|----|---------|------|----------------|
| H-1 | No rate limiting on authentication endpoints | Brute force password attacks | Implement express-rate-limit: 10 attempts per 15 minutes per IP |
| H-2 | RBAC not enforced at API level | Privilege escalation; unauthorized data access | Add authorization middleware to every route; test with role-based integration tests |
| H-3 | QR code content not validated on scan | Malicious QR codes could trigger unintended actions | Implement URL whitelist validation and entity type/ID extraction on frontend |
| H-4 | Docker containers running as root | Container escape leads to host compromise | Add `USER` directive to all Dockerfiles; set `no-new-privileges` |
| H-5 | No CSRF protection on state-changing endpoints | Cross-site request forgery on operator actions | Implement SameSite cookies + CSRF token validation |
| H-6 | Database backups not encrypted | Backup theft leads to full data breach | Encrypt all backups with AES-256; store encryption key separately |

### Medium (Fix Within 30 Days of Launch)

| ID | Finding | Risk | Recommendation |
|----|---------|------|----------------|
| M-1 | Weak password policy | Credential compromise via guessing or spraying | Enforce 8+ chars with complexity requirements; implement account lockout |
| M-2 | No Content Security Policy header | XSS attacks harder to mitigate without CSP | Configure CSP via Helmet.js as detailed in section 3.4 |
| M-3 | Sensitive data visible in application logs | Log exposure leads to data breach | Implement log masking for tokens, passwords, and PII |
| M-4 | No concurrent session limits | Account sharing; harder to attribute actions | Limit to 2 active sessions per user |
| M-5 | Service worker caches API responses | Sensitive inventory data persisted on device | Configure service worker to skip caching for `/api/*` routes |
| M-6 | Database connection pool shared across roles | Compromised connection has excessive privileges | Create separate DB users with least-privilege access |
| M-7 | No optimistic locking on inventory operations | Silent data overwrites in concurrent usage | Add `version` column and check on every update |
| M-8 | No data retention policy implemented | Unbounded data growth; compliance risk | Implement retention policies as defined in section 10.1 |

### Low (Backlog)

| ID | Finding | Risk | Recommendation |
|----|---------|------|----------------|
| L-1 | No automated cache invalidation strategy | Stale data displayed to operators after updates | Implement cache busting for static assets on deploy |
| L-2 | Audit log format not standardized | Difficult to parse and analyze logs at scale | Adopt structured JSON logging with pino |
| L-3 | No GDPR compliance documentation | Legal risk if processing EU data | Document data processing activities; prepare DPA template |
| L-4 | No automated Docker image scanning in CI | Vulnerable dependencies deployed to production | Integrate trivy into CI pipeline |
| L-5 | No security monitoring dashboard | Delayed detection of security incidents | Set up alerts for failed logins, rate limit violations, and anomalous scans |

---

## 12. Security Checklist (Pre-Launch)

### Authentication & Authorization

- [ ] JWT access tokens expire in 15 minutes
- [ ] JWT refresh tokens expire in 7 days
- [ ] Refresh token rotation is implemented (old token invalidated on use)
- [ ] Refresh token reuse detection triggers family revocation
- [ ] Tokens stored in httpOnly Secure SameSite=Strict cookies
- [ ] JWT `algorithms` option is explicitly set in `verify()` calls
- [ ] JWT payload contains no sensitive PII
- [ ] Password policy enforces 8+ chars with complexity requirements
- [ ] Passwords hashed with bcrypt (12+ salt rounds)
- [ ] Password max length set to 128 to prevent bcrypt DoS
- [ ] Account lockout after 5 failed login attempts
- [ ] Login error messages are generic ("Invalid email or password")
- [ ] RBAC middleware applied to every API route
- [ ] Horizontal authorization checks (user can only access own resources)
- [ ] Admin can force logout any user
- [ ] Password change revokes all refresh tokens for that user
- [ ] Role change revokes all refresh tokens for that user

### API Security

- [ ] All endpoints have input validation schemas (Zod or Joi)
- [ ] Unknown fields are stripped from validated requests
- [ ] Rate limiting configured on auth endpoints (10/15min)
- [ ] Rate limiting configured on scan endpoints (60/min)
- [ ] Rate limiting configured on general API (100/min)
- [ ] CORS whitelist contains only production origins
- [ ] CORS does not use wildcard origin
- [ ] Helmet.js configured with all recommended headers
- [ ] Request body size limited to 1MB
- [ ] All database queries use parameterized queries or ORM
- [ ] No raw SQL string concatenation in codebase

### QR Code Security

- [ ] QR codes encode URLs with opaque UUIDs, not sensitive data
- [ ] Frontend validates QR URL against domain whitelist before processing
- [ ] Frontend extracts only entity type and ID from QR URL
- [ ] Backend validates entity existence and user permission on every scan
- [ ] Double-scan prevention (3-second cooldown per user per entity)
- [ ] Database constraints prevent child box in multiple active cartons

### Data Security

- [ ] PostgreSQL connections use SSL (sslmode=verify-full)
- [ ] Separate DB users with least-privilege access
- [ ] Application DB user cannot DELETE from critical tables
- [ ] Sensitive fields (API keys) encrypted with AES-256-GCM
- [ ] HTTPS enforced on all endpoints
- [ ] HTTP redirects to HTTPS (301)
- [ ] HSTS header set with 1-year max-age, includeSubDomains, preload
- [ ] TLS 1.0 and 1.1 disabled
- [ ] Backups encrypted with AES-256
- [ ] Backup integrity verified with checksums
- [ ] Backup restore tested

### Infrastructure

- [ ] All Docker containers run as non-root
- [ ] Docker containers use read-only filesystems where possible
- [ ] `no-new-privileges` set on all containers
- [ ] Base images are minimal (alpine or slim)
- [ ] No secrets embedded in Docker images
- [ ] `.env` file in `.gitignore` and `.dockerignore`
- [ ] `.env.example` committed with placeholder values only
- [ ] Database not exposed to external network
- [ ] Internal services communicate over private Docker network
- [ ] Firewall rules block all unnecessary ports
- [ ] Docker image vulnerability scan passes (no Critical/High)

### Client-Side Security

- [ ] Service worker does not cache API responses
- [ ] Service worker scoped to application path only
- [ ] PWA manifest uses HTTPS start_url
- [ ] No use of `dangerouslySetInnerHTML` with user input
- [ ] Content Security Policy header configured
- [ ] DOMPurify used for any user-generated content rendering
- [ ] SameSite=Strict set on all authentication cookies
- [ ] CSRF token validation on all state-changing endpoints
- [ ] Camera permissions requested only when QR scan is initiated
- [ ] Frontend debounces scan button (500ms minimum)

### Audit & Monitoring

- [ ] All state changes logged to audit_logs table
- [ ] Audit log table is append-only (no UPDATE/DELETE for app user)
- [ ] Structured JSON logging configured (pino or winston)
- [ ] No passwords, tokens, or connection strings in logs
- [ ] PII masked in application logs
- [ ] Failed login monitoring alert configured
- [ ] Rate limit violation alert configured
- [ ] Anomalous scan pattern alert configured
- [ ] Refresh token reuse alert configured

### Business Logic

- [ ] Pack/unpack/dispatch operations are atomic (full transaction)
- [ ] `SELECT ... FOR UPDATE` used on concurrent scan operations
- [ ] State machine validates all status transitions
- [ ] Optimistic locking (`version` column) on UI-initiated updates
- [ ] Carton cannot be dispatched unless in `packed` status
- [ ] Child box cannot be unpacked from a dispatched carton
- [ ] Database constraints enforce business rules at the DB level

### Compliance

- [ ] Data retention policy documented and automated
- [ ] User data export capability available (right to access)
- [ ] User data anonymization procedure documented (right to erasure)
- [ ] Audit logs retained for minimum 7 years
- [ ] Breach notification procedure documented

---

## Appendix A: Security Testing Recommendations

### Pre-Launch Testing

| Test Type | Tool | Frequency |
|-----------|------|-----------|
| Static Application Security Testing (SAST) | ESLint (eslint-plugin-security), SonarQube | Every CI build |
| Dependency vulnerability scanning | npm audit, Snyk | Every CI build |
| Container image scanning | Trivy | Every CI build |
| API security testing | OWASP ZAP (automated scan) | Weekly in staging |
| Penetration testing | Manual (third-party firm) | Before launch, then annually |
| Load testing (for rate limit validation) | k6, Artillery | Before launch |

### Ongoing Testing

| Test Type | Frequency |
|-----------|-----------|
| Dependency vulnerability scanning | Daily automated scan |
| Container image scanning | Weekly (catches newly disclosed CVEs) |
| Penetration testing | Annually or after major changes |
| Incident response drill | Bi-annually |

---

## Appendix B: Incident Response Outline

In the event of a security incident:

1. **Identify:** Detect and confirm the incident via monitoring alerts or user reports.
2. **Contain:** Isolate affected systems. Revoke compromised credentials. Block malicious IPs.
3. **Eradicate:** Remove the root cause (patch vulnerability, rotate secrets, rebuild containers).
4. **Recover:** Restore from verified backups if data was affected. Re-deploy with fixes.
5. **Notify:** Inform affected users and authorities per legal requirements (72 hours for GDPR).
6. **Post-mortem:** Document the incident, root cause, timeline, and remediation. Update security controls to prevent recurrence.

---

*This report should be reviewed and updated quarterly, or immediately following any significant architecture change or security incident.*

*End of Report*
