# Real Estate Sales System — Database Structure

Generated from `prisma/schema.prisma` (PostgreSQL). Every business table carries `companyId` for tenant isolation.

## Enums

- **Role** — OWNER · MANAGER · AGENT · ACCOUNTANT · ADMIN
- **PayoutStatus** — APPROVED · PAID
- **CalendarPref** — ETHIOPIAN · GREGORIAN
- **LeadSource** — FACEBOOK · TELEGRAM · WALK_IN · REFERRAL · WEBSITE · TIKTOK · PHONE · BILLBOARD · OTHER
- **LeadStatus** — NEW · CONTACTED · SITE_VISIT · NEGOTIATION · WON · LOST
- **ActivityType** — CALL · MEETING · SITE_VISIT · TELEGRAM · NOTE · STATUS_CHANGE · REASSIGNED
- **TaskType** — CALL · MESSAGE · SITE_VISIT · MEETING · OTHER
- **VisitOutcome** — INTERESTED · NEEDS_TIME · NOT_INTERESTED · NO_SHOW
- **UnitStatus** — AVAILABLE · RESERVED · SOLD · HANDED_OVER · BLOCKED
- **UnitKind** — APARTMENT · PLOT
- **PlanType** — CASH · INSTALLMENT · MORTGAGE · MILESTONE
- **PenaltyStatus** — OPEN · WAIVED · COLLECTED
- **ReservationStatus** — ACTIVE · EXPIRED · CANCELLED · CONVERTED
- **DealStatus** — ACTIVE · COMPLETED · CANCELLED
- **PaymentMethod** — BANK_TRANSFER · CASH · TELEBIRR · CBE_BIRR · CHEQUE · OTHER
- **PaymentStatus** — PENDING · CONFIRMED · REJECTED · VOID
- **DocumentType** — CONTRACT · ID · RECEIPT · PAYMENT_PROOF · TITLE · OTHER
- **ApprovalStatus** — PENDING · APPROVED · REJECTED

## Company

| Column | Type | Notes |
|---|---|---|
| id | text | PK |
| name | text |  |
| reservationDays | int | default 7 |
| followUpDays | int | default 2 |
| calendar | calendarpref | default ETHIOPIAN |
| locale | text | default "en" |
| staleLeadDays | int | default 3 |
| receiptSeq | int | default 0 |
| discountApprovalPct | decimal(5,2) | default 5 |
| commissionPayablePct | decimal(5,2) | default 30 |
| milestoneDueDays | int | default 30 |
| penaltyEnabled | bool | default false |
| penaltyGraceDays | int | default 7 |
| penaltyPctPerMonth | decimal(5,2) | default 0 |
| penaltyCapPct | decimal(5,2) NULL |  |
| active | bool | default true |
| suspendedAt | timestamp NULL |  |
| createdAt | timestamp |  |

*Back-relations (not columns): priceApprovals, users, projects, units, leads, clients, reservations, deals, payments, documents, payouts, auditLogs, followUps, activities, targets, notifications, documentRequirements, commissionTiers, commissionSplits, constructionMilestones, penalties*

## User

| Column | Type | Notes |
|---|---|---|
| id | text | PK |
| companyId | text | FK → Company |
| name | text |  |
| email | text | unique |
| phone | text NULL |  |
| passwordHash | text |  |
| role | role | default AGENT |
| external | bool | default false |
| active | bool | default true |
| createdAt | timestamp |  |
| company | — | relation → Company (FK cols: companyId) |

*@@index([companyId])*

*Back-relations (not columns): leads, commissionSplits, notifications, activities, followUps, reservations, depositsConfirmed, approvalsRequested, approvalsDecided, deals, paymentsRecorded, paymentsConfirmed, documents, payouts, payoutsMade, payoutsApproved, targets, auditLogs*

## Client

| Column | Type | Notes |
|---|---|---|
| id | text | PK |
| companyId | text | FK → Company |
| fullName | text |  |
| phone | text |  |
| email | text NULL |  |
| idNumber | text NULL |  |
| address | text NULL |  |
| leadId | text NULL | FK → Lead |
| createdAt | timestamp |  |
| company | — | relation → Company (FK cols: companyId) |
| lead | — | relation → Lead (FK cols: leadId) |

*@@unique([companyId, phone])*

*Back-relations (not columns): reservations, deals, documents*

## Lead

| Column | Type | Notes |
|---|---|---|
| id | text | PK |
| companyId | text | FK → Company |
| name | text |  |
| phone | text |  |
| email | text NULL |  |
| source | leadsource |  |
| sourceDetail | text NULL |  |
| status | leadstatus | default NEW |
| budget | decimal(14,2) NULL |  |
| notes | text NULL |  |
| ownerId | text NULL | FK → User |
| interestProjectId | text NULL | FK → Project |
| lastActivityAt | timestamp NULL |  |
| lostReason | text NULL |  |
| createdAt | timestamp |  |
| company | — | relation → Company (FK cols: companyId) |
| owner | — | relation → User (FK cols: ownerId) |
| interestProject | — | relation → Project (FK cols: interestProjectId) |

*@@unique([companyId, phone])*

*@@index([companyId, ownerId])*

*@@index([companyId, status])*

*Back-relations (not columns): activities, followUps, clients*

## Activity

| Column | Type | Notes |
|---|---|---|
| id | text | PK |
| companyId | text | FK → Company |
| leadId | text | FK → Lead |
| userId | text | FK → User |
| type | activitytype |  |
| note | text NULL |  |
| createdAt | timestamp |  |
| company | — | relation → Company (FK cols: companyId) |
| lead | — | relation → Lead (FK cols: leadId) |
| user | — | relation → User (FK cols: userId) |

*@@index([leadId, createdAt])*

## FollowUp

| Column | Type | Notes |
|---|---|---|
| id | text | PK |
| companyId | text | FK → Company |
| leadId | text | FK → Lead |
| assigneeId | text | FK → User |
| type | tasktype | default CALL |
| dueAt | timestamp |  |
| note | text NULL |  |
| projectId | text NULL | FK → Project |
| visitOutcome | visitoutcome NULL |  |
| doneAt | timestamp NULL |  |
| outcome | text NULL |  |
| createdAt | timestamp |  |
| company | — | relation → Company (FK cols: companyId) |
| lead | — | relation → Lead (FK cols: leadId) |
| assignee | — | relation → User (FK cols: assigneeId) |
| project | — | relation → Project (FK cols: projectId) |

*@@index([companyId, assigneeId, doneAt])*

## Notification

| Column | Type | Notes |
|---|---|---|
| id | text | PK |
| companyId | text | FK → Company |
| userId | text | FK → User |
| kind | text |  |
| title | text |  |
| link | text NULL |  |
| dedupeKey | text NULL |  |
| readAt | timestamp NULL |  |
| emailedAt | timestamp NULL |  |
| createdAt | timestamp |  |
| company | — | relation → Company (FK cols: companyId) |
| user | — | relation → User (FK cols: userId) |

*@@unique([userId, dedupeKey])*

*@@index([userId, readAt, createdAt])*

## Project

| Column | Type | Notes |
|---|---|---|
| id | text | PK |
| companyId | text | FK → Company |
| name | text |  |
| location | text NULL |  |
| commissionRate | decimal(5,2) | default 2 |
| createdAt | timestamp |  |
| company | — | relation → Company (FK cols: companyId) |

*@@index([companyId])*

*Back-relations (not columns): units, leads, milestones, commissionTiers, followUps*

## Unit

| Column | Type | Notes |
|---|---|---|
| id | text | PK |
| companyId | text | FK → Company |
| projectId | text | FK → Project |
| code | text |  |
| block | text NULL |  |
| floor | int NULL |  |
| kind | unitkind | default APARTMENT |
| type | text NULL |  |
| sizeSqm | decimal(10,2) NULL |  |
| zoning | text NULL |  |
| titleStatus | text NULL |  |
| price | decimal(14,2) |  |
| status | unitstatus | default AVAILABLE |
| createdAt | timestamp |  |
| company | — | relation → Company (FK cols: companyId) |
| project | — | relation → Project (FK cols: projectId) |

*@@unique([projectId, code])*

*@@index([companyId, status])*

*Back-relations (not columns): reservations, deals*

## Reservation

| Column | Type | Notes |
|---|---|---|
| id | text | PK |
| companyId | text | FK → Company |
| unitId | text | FK → Unit |
| clientId | text | FK → Client |
| agentId | text | FK → User |
| depositAmount | decimal(14,2) | default 0 |
| depositRef | text NULL |  |
| depositConfirmedAt | timestamp NULL |  |
| depositConfirmedById | text NULL | FK → User |
| expiresAt | timestamp |  |
| status | reservationstatus | default ACTIVE |
| note | text NULL |  |
| createdAt | timestamp |  |
| closedAt | timestamp NULL |  |
| company | — | relation → Company (FK cols: companyId) |
| unit | — | relation → Unit (FK cols: unitId) |
| client | — | relation → Client (FK cols: clientId) |
| agent | — | relation → User (FK cols: agentId) |
| depositConfirmedBy | — | relation → User (FK cols: depositConfirmedById) |

*@@index([companyId, status, expiresAt])*

*Back-relations (not columns): deal, priceApprovals*

## Deal

| Column | Type | Notes |
|---|---|---|
| id | text | PK |
| companyId | text | FK → Company |
| contractNo | text |  |
| unitId | text | FK → Unit |
| clientId | text | FK → Client |
| agentId | text | FK → User |
| reservationId | text NULL | unique, FK → Reservation |
| price | decimal(14,2) |  |
| commissionRate | decimal(5,2) |  |
| commissionPayablePct | decimal(5,2) NULL |  |
| status | dealstatus | default ACTIVE |
| signedAt | timestamp |  |
| cancelReason | text NULL |  |
| createdAt | timestamp |  |
| company | — | relation → Company (FK cols: companyId) |
| unit | — | relation → Unit (FK cols: unitId) |
| client | — | relation → Client (FK cols: clientId) |
| agent | — | relation → User (FK cols: agentId) |
| reservation | — | relation → Reservation (FK cols: reservationId) |

*@@unique([companyId, contractNo])*

*@@index([companyId, agentId])*

*Back-relations (not columns): plan, installments, payments, documents, payouts, penalties, splits*

## PaymentPlan

| Column | Type | Notes |
|---|---|---|
| id | text | PK |
| dealId | text | unique, FK → Deal |
| type | plantype |  |
| downPct | decimal(5,2) | default 0 |
| months | int | default 0 |
| bankName | text NULL |  |
| createdAt | timestamp |  |
| deal | — | relation → Deal (FK cols: dealId) |

## Installment

| Column | Type | Notes |
|---|---|---|
| id | text | PK |
| dealId | text | FK → Deal |
| seq | int |  |
| label | text |  |
| dueDate | timestamp |  |
| amount | decimal(14,2) |  |
| milestoneId | text NULL | FK → ConstructionMilestone |
| deal | — | relation → Deal (FK cols: dealId) |
| milestone | — | relation → ConstructionMilestone (FK cols: milestoneId) |

*@@unique([dealId, seq])*

*Back-relations (not columns): penalties*

## Payment

| Column | Type | Notes |
|---|---|---|
| id | text | PK |
| companyId | text | FK → Company |
| dealId | text | FK → Deal |
| amount | decimal(14,2) |  |
| paidAt | timestamp |  |
| method | paymentmethod |  |
| reference | text NULL |  |
| status | paymentstatus | default PENDING |
| recordedById | text | FK → User |
| confirmedById | text NULL | FK → User |
| confirmedAt | timestamp NULL |  |
| rejectReason | text NULL |  |
| reversalOfId | text NULL | unique, FK → Payment |
| voidReason | text NULL |  |
| receiptNo | int NULL |  |
| receiptId | text NULL | unique, FK → Document |
| createdAt | timestamp |  |
| company | — | relation → Company (FK cols: companyId) |
| deal | — | relation → Deal (FK cols: dealId) |
| recordedBy | — | relation → User (FK cols: recordedById) |
| confirmedBy | — | relation → User (FK cols: confirmedById) |
| reversalOf | — | relation → Payment (FK cols: reversalOfId) |
| receipt | — | relation → Document (FK cols: receiptId) |

*@@unique([companyId, receiptNo])*

*@@index([companyId, status])*

*@@index([dealId])*

*Back-relations (not columns): reversedBy*

## CommissionPayout

| Column | Type | Notes |
|---|---|---|
| id | text | PK |
| companyId | text | FK → Company |
| agentId | text | FK → User |
| dealId | text | FK → Deal |
| amount | decimal(14,2) |  |
| status | payoutstatus | default APPROVED |
| approvedById | text | FK → User |
| approvedAt | timestamp |  |
| reference | text NULL |  |
| paidById | text NULL | FK → User |
| paidAt | timestamp NULL |  |
| company | — | relation → Company (FK cols: companyId) |
| agent | — | relation → User (FK cols: agentId) |
| deal | — | relation → Deal (FK cols: dealId) |
| approvedBy | — | relation → User (FK cols: approvedById) |
| paidBy | — | relation → User (FK cols: paidById) |

*@@index([companyId, agentId])*

## CommissionTier

| Column | Type | Notes |
|---|---|---|
| id | text | PK |
| companyId | text | FK → Company |
| projectId | text | FK → Project |
| fromAmount | decimal(14,2) |  |
| rate | decimal(5,2) |  |
| createdAt | timestamp |  |
| company | — | relation → Company (FK cols: companyId) |
| project | — | relation → Project (FK cols: projectId) |

*@@unique([projectId, fromAmount])*

*@@index([companyId])*

## CommissionSplit

| Column | Type | Notes |
|---|---|---|
| id | text | PK |
| companyId | text | FK → Company |
| dealId | text | FK → Deal |
| userId | text | FK → User |
| sharePct | decimal(5,2) |  |
| createdAt | timestamp |  |
| company | — | relation → Company (FK cols: companyId) |
| deal | — | relation → Deal (FK cols: dealId) |
| user | — | relation → User (FK cols: userId) |

*@@unique([dealId, userId])*

*@@index([companyId])*

## ConstructionMilestone

| Column | Type | Notes |
|---|---|---|
| id | text | PK |
| companyId | text | FK → Company |
| projectId | text | FK → Project |
| seq | int |  |
| name | text |  |
| pct | decimal(5,2) |  |
| expectedAt | timestamp |  |
| reachedAt | timestamp NULL |  |
| reachedById | text NULL |  |
| createdAt | timestamp |  |
| company | — | relation → Company (FK cols: companyId) |
| project | — | relation → Project (FK cols: projectId) |

*@@unique([projectId, seq])*

*@@index([companyId])*

*Back-relations (not columns): installments*

## Penalty

| Column | Type | Notes |
|---|---|---|
| id | text | PK |
| companyId | text | FK → Company |
| dealId | text | FK → Deal |
| installmentId | text | FK → Installment |
| monthNo | int |  |
| amount | decimal(14,2) |  |
| status | penaltystatus | default OPEN |
| reason | text NULL |  |
| reference | text NULL |  |
| decidedById | text NULL |  |
| decidedAt | timestamp NULL |  |
| createdAt | timestamp |  |
| company | — | relation → Company (FK cols: companyId) |
| deal | — | relation → Deal (FK cols: dealId) |
| installment | — | relation → Installment (FK cols: installmentId) |

*@@unique([installmentId, monthNo])*

*@@index([companyId, status])*

## SalesTarget

| Column | Type | Notes |
|---|---|---|
| id | text | PK |
| companyId | text | FK → Company |
| userId | text | FK → User |
| month | text |  |
| amount | decimal(14,2) |  |
| company | — | relation → Company (FK cols: companyId) |
| user | — | relation → User (FK cols: userId) |

*@@unique([userId, month])*

*@@index([companyId, month])*

## DocumentRequirement

| Column | Type | Notes |
|---|---|---|
| id | text | PK |
| companyId | text | FK → Company |
| type | documenttype |  |
| label | text |  |
| createdAt | timestamp |  |
| company | — | relation → Company (FK cols: companyId) |

*@@unique([companyId, type])*

## Document

| Column | Type | Notes |
|---|---|---|
| id | text | PK |
| companyId | text | FK → Company |
| type | documenttype |  |
| fileName | text |  |
| storagePath | text |  |
| mimeType | text |  |
| size | int |  |
| clientId | text NULL | FK → Client |
| dealId | text NULL | FK → Deal |
| uploadedById | text | FK → User |
| createdAt | timestamp |  |
| company | — | relation → Company (FK cols: companyId) |
| client | — | relation → Client (FK cols: clientId) |
| deal | — | relation → Deal (FK cols: dealId) |
| uploadedBy | — | relation → User (FK cols: uploadedById) |

*@@index([companyId, clientId])*

*@@index([companyId, dealId])*

*Back-relations (not columns): payment*

## AuditLog

| Column | Type | Notes |
|---|---|---|
| id | text | PK |
| companyId | text | FK → Company |
| userId | text NULL | FK → User |
| action | text |  |
| entity | text |  |
| entityId | text NULL |  |
| detail | text NULL |  |
| before | json NULL |  |
| after | json NULL |  |
| createdAt | timestamp |  |
| company | — | relation → Company (FK cols: companyId) |
| user | — | relation → User (FK cols: userId) |

*@@index([companyId, createdAt])*

*@@index([companyId, entity, entityId])*

## PriceApproval

| Column | Type | Notes |
|---|---|---|
| id | text | PK |
| companyId | text | FK → Company |
| reservationId | text | FK → Reservation |
| listPrice | decimal(14,2) |  |
| price | decimal(14,2) |  |
| reason | text NULL |  |
| status | approvalstatus | default PENDING |
| requestedById | text | FK → User |
| decidedById | text NULL | FK → User |
| decidedAt | timestamp NULL |  |
| decisionNote | text NULL |  |
| createdAt | timestamp |  |
| company | — | relation → Company (FK cols: companyId) |
| reservation | — | relation → Reservation (FK cols: reservationId) |
| requestedBy | — | relation → User (FK cols: requestedById) |
| decidedBy | — | relation → User (FK cols: decidedById) |

*@@index([companyId, status])*

*@@index([reservationId])*
