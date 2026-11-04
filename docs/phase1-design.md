# Phase 1 design: ERD, screens, API

Status key: **Built** = already running on the preview · **Change** = exists, needs changes to meet the spec · **New** = not built yet.

## 1. ERD (Phase 1)

```mermaid
erDiagram
  Company ||--o{ User : employs
  Company ||--o{ Project : owns
  Project ||--o{ Unit : contains
  Company ||--o{ Lead : has
  Lead ||--o{ LeadActivity : "history (calls, notes, visits)"
  Lead ||--o{ Task : "follow-ups"
  User ||--o{ Lead : "owner (locked to first registrant)"
  Lead ||--o| Client : "becomes"
  Client ||--o{ Reservation : makes
  Unit ||--o{ Reservation : "max 1 ACTIVE"
  Reservation ||--o| Sale : "converted to"
  Unit ||--o{ Sale : "max 1 live"
  Client ||--o{ Sale : buys
  User ||--o{ Sale : "selling agent"
  Sale ||--|| PaymentPlan : has
  PaymentPlan ||--o{ Installment : schedule
  Sale ||--o{ Payment : receives
  Payment ||--o| Payment : "reversal of"
  Payment ||--o| Receipt : "issued on confirm"
  Sale ||--o{ PriceApproval : "discount above threshold"
  Client ||--o{ Document : files
  Sale ||--o{ Document : files
  Company ||--o{ AuditLog : records
  User ||--o{ SalesTarget : "monthly"

  Company { string name; string currency "ETB"; int reservationDays; int staleLeadDays; decimal discountApprovalPct; string calendar; string locale; int receiptSeq }
  User { string name; string email; string phone; Role role "OWNER|MANAGER|AGENT|ACCOUNTANT|ADMIN"; bool external; bool active }
  Project { string name; string location; ProjectKind kind "APARTMENT|LAND|MIXED"; decimal commissionRate }
  Unit { string code; UnitKind kind "APARTMENT|PLOT"; string type; int floor; decimal sizeSqm; decimal listPrice; UnitStatus status "AVAILABLE|RESERVED|SOLD|HANDED_OVER|BLOCKED"; string zoning "plot"; string titleStatus "plot" }
  Lead { string name; string phone "unique per company"; LeadSource source "FACEBOOK|TELEGRAM|REFERRAL|WALK_IN|BILLBOARD|WEBSITE|OTHER"; decimal budget; string preferences; LeadStatus status; string ownerId }
  LeadActivity { ActivityType type "CALL|MESSAGE|NOTE|SITE_VISIT|STATUS_CHANGE|REASSIGNED"; string note; datetime at "immutable" }
  Task { datetime dueAt; string note; datetime doneAt; string assigneeId }
  Client { string fullName; string phone "unique per company"; string idNumber }
  Reservation { decimal depositAmount; datetime depositConfirmedAt "held after expiry when set"; datetime expiresAt; ReservationStatus status "ACTIVE|EXPIRED|CANCELLED|CONVERTED" }
  Sale { string contractNo "unique per company"; decimal listPrice; decimal price; decimal commissionRate; SaleStatus status "ACTIVE|COMPLETED|CANCELLED"; string cancelReason }
  PaymentPlan { PlanType type "CASH|INSTALLMENT|MORTGAGE"; decimal downPayment; int months; string bankName }
  Installment { int seq; string label; date dueDate; decimal amount }
  Payment { decimal amount "negative for reversals"; PaymentMethod method "CASH|BANK_TRANSFER|TELEBIRR|CBE_BIRR|CHEQUE"; string reference; PaymentStatus status "PENDING|CONFIRMED|REJECTED|VOID"; string reversalOfId; string voidReason }
  Receipt { int number "unique per company"; string pdfPath; datetime issuedAt }
  PriceApproval { decimal requestedPrice; ApprovalStatus status "PENDING|APPROVED|REJECTED"; string decidedById }
  Document { DocumentType type "ID|CONTRACT|RECEIPT|PAYMENT_PROOF|TITLE|OTHER"; string storageKey "S3" }
  AuditLog { string action; string entity; string before; string after; datetime at }
```

Rules carried by the schema (section 7):
- One ACTIVE reservation and one live sale per unit: partial unique indexes + conditional `UPDATE … WHERE status='AVAILABLE'` inside a transaction. **Built**
- Money is `DECIMAL(14,2)`; timestamps stored in UTC, shown in Africa/Addis_Ababa (Ethiopian or Gregorian). **Built**
- Every table has `companyId`; every query filters on it. **Built**
- No hard deletes of financial rows: sales are cancelled with a reason, payments are rejected/voided with a reason. **Change**
- Confirmed payments can't be edited; a correction is a new reversal payment linked to the original (needs accountant confirmation too). **New**
- Price below list price by more than `discountApprovalPct` creates a PriceApproval; the sale can't be signed until a Sales Manager/Owner approves (their own sales are recorded as self-approved). **Built**
- Lead owner is locked to the agent who registered it; only Admin/Owner can override, always audited. Sales Managers can only assign leads with no owner. **Built**
- Audit log records before/after for price, status, payment and delete/void changes. **Change** (today: action + short detail)

## 2. Screens (Phase 1)

| Screen | Who | Status |
|---|---|---|
| Login, register company | all | Built |
| Manager Home (6 cards, 2 charts, Needs attention) | Owner, Sales Manager, Agent ("My day"), Accountant | Built |
| Who owes us money (collections + aging, Excel/PDF) | Owner, Sales Manager, Accountant, Agent (own) | Built |
| Projects list; project units grid with filters | all | Change: plots, Handed over, list price |
| Unit detail (history, current reservation/sale) | all | New |
| Leads list (search, filters, duplicate warning), lead detail with activity history and tasks, new lead | Owner, Sales Manager, Agent (own) | Change: Billboard source, preferences, ownership lock |
| Follow-ups / tasks (today, overdue, quiet leads) | Owner, Sales Manager, Agent (own) | Built (uses old "quiet" rule) |
| Reservations list, new reservation (deposit, expiry) | Owner, Sales Manager, Agent (own) | Change: deposit confirmation |
| Sales list, new sale from reservation (plan type, discount), sale detail (schedule, payments, documents) | Owner, Sales Manager, Accountant, Agent (own) | Change: plan types, price approval |
| Price approvals queue | Owner, Sales Manager | New |
| Payments queue (confirm / reject / reverse) | Accountant, Owner | Change: reversal |
| Receipt (numbered PDF), client statement (PDF) | Accountant, Owner, Agent (own) | Change: real PDF; statement New |
| Clients and documents | Owner, Sales Manager, Accountant, Agent (own) | Built |
| Basic reports: sales, collections, overdue, inventory, lead sources, agent performance (Excel/PDF) | Owner, Sales Manager, Accountant | Change: one Reports page |
| Settings: company, users/roles, reservation days, discount threshold, language | Admin, Owner | Change |
| Audit log (search, filter) | Owner, Admin, Sales Manager | Change |

Commissions, targets, site-visit scheduling and the pipeline board are Phase 2. The commission pages I've already built stay, and get redone in Phase 2 against the full rule engine.

## 3. API (Phase 1)

Mutations are Next.js server actions, validated with Zod and checked against roles on the server. Read-only data and files come from route handlers.

| Area | Endpoint / action | Roles |
|---|---|---|
| Auth | `login`, `logout`, `registerCompany` | public / any |
| Projects & units | `createProject`, `updateProject`, `addUnits`, `updateUnit` (price change audited), `setUnitStatus` (incl. HANDED_OVER) | Admin, Owner |
| Leads | `createLead` (duplicate check), `updateLead`, `logActivity`, `addTask`, `completeTask`, `overrideLeadOwner` | Sales roles (own); override: Admin, Owner |
| Reservations | `createReservation` (transactional), `confirmDeposit` (Accountant), `extendReservation` (Sales Manager), `cancelReservation`; `GET /api/cron/expire-reservations` | as listed |
| Sales | `createSale` (plan + schedule), `requestPriceApproval` / `decidePriceApproval`, `cancelSale` (reason) | Sales roles; approvals: Sales Manager, Owner |
| Payments | `recordPayment` (proof upload), `confirmPayment` (issues receipt), `rejectPayment`, `reversePayment` (reason) | record: Sales roles; rest: Accountant, Owner |
| Documents | `uploadDocument`, `GET /api/documents/:id` | scoped per role |
| PDFs | `GET /api/receipts/:id.pdf`, `GET /api/statements/:saleId.pdf` | Accountant, Owner, Agent (own) |
| Reports | `GET /api/export/:report?…` (xlsx), print view for PDF | per report |
| Settings & users | `updateCompany`, `addUser`, `updateUser`, `deactivateUser` | Admin, Owner |
| Audit | `GET /audit?entity&user&from&to` | Owner, Admin, Sales Manager |

## 4. Definition of done for Phase 1
- Works on phone and desktop. Each role is checked with automated tests, including that one agent can't see another agent's data.
- Section 7 rules covered by automated tests: concurrent reserve of the same unit, no hard delete, confirmed payments can't be edited or reversed without a linked reversal, discount approval, tenant isolation. Playwright end-to-end test for: lead → reservation → sale → payment → confirm → receipt.
- Seed: 2 projects, 30 units (mix of apartments and plots), 20 leads, 5 sales with partly paid installments.
- README: setup, environment variables, and a one-page guide for the manager. Dockerfile + docker-compose (app, Postgres, MinIO for S3 files) and a daily `pg_dump` backup job.

## 5. Stack choices
- As suggested: Next.js + TypeScript, Tailwind, PostgreSQL + Prisma migrations, Zod, Recharts for the two home charts, S3-compatible storage (MinIO locally), server-side PDF generation, cron route for expiry and reminders.
- shadcn/ui: I'd use it for new forms, dialogs and the Kanban board, and keep the existing simple Tailwind components rather than rewriting working screens.

## Decisions confirmed by the product owner

- Confirmed reservation deposit: unit stays held after expiry until the Sales Manager extends, converts or cancels (with a reason). The deposit counts toward the price; refunds are handled outside the system.
- Discount approval threshold defaults to 5% below list; approvers are Sales Manager or Owner.
- Only Owner/Admin can move an owned lead.
- Milestone-based schedules and late penalties are Phase 2.
