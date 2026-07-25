export type ComplianceColor = 'green' | 'yellow' | 'red';

export type OnboardingCascadeStage = 'day1' | 'day8' | 'day11' | 'escalated';
export type RecurringCascadeStage = 'reminderEarly' | 'reminderEndOfDay' | 'finalCheck' | 'escalated';

export type OnboardingDocType = 'COI' | 'W9';
export type RecurringDocType = 'PAYROLL' | 'WORKFORCE';
export type DocType = OnboardingDocType | RecurringDocType;

export type DocSubmissionStatus = 'valid' | 'invalid' | 'missing';

export interface Subcontractor {
  entityType: 'SUBCONTRACTOR';
  subId: string;
  name: string;
  trade: string;
  contactEmail: string;
  contactName: string;
  /** true once COI + W-9 have both passed AI field-validation */
  onboardingStatus: 'onboarded' | 'pending' | 'suspended';
  onboardingCascadeStage?: OnboardingCascadeStage;
  onboardingCascadeStartedAt?: string;
  suspended: boolean;
  suspendedReason?: string;
  createdAt: string;
}

export interface OnboardingDocument {
  subId: string;
  docType: OnboardingDocType;
  submittedAt: string;
  status: DocSubmissionStatus;
  /** yearly for COI; not applicable for W-9 (once per vendor relationship) */
  expiresAt?: string;
  rejectionReason?: string;
}

export interface SubActionLogEntry {
  subId: string;
  timestamp: string;
  actor: 'ai' | 'human';
  actorName?: string;
  action:
    | 'reminder_sent'
    | 'escalated'
    | 'suspended'
    | 'reinstated'
    | 'document_submitted'
    | 'document_validated';
  detail?: string;
  reason?: string;
}

export interface Project {
  entityType: 'PROJECT';
  projectId: string;
  name: string;
  address: string;
  /** e.g. 'friday' — the weekday certified payroll is due each week */
  payrollDueWeekday: string;
  /** day of month the monthly workforce report is due */
  workforceReportDueDay: number;
  isPublicFunded: boolean;
  createdAt: string;
}

export interface ProjectSubcontractor {
  projectId: string;
  subId: string;
  subName: string;
  subTrade: string;
  mobilizedDate: string;
  payrollCascadeStage?: RecurringCascadeStage;
  payrollCascadeStartedAt?: string;
  workforceCascadeStage?: RecurringCascadeStage;
  workforceCascadeStartedAt?: string;
  /** submitted after the due date, but eventually received */
  lateCount: number;
  /** never submitted for that period */
  missingCount: number;
  suspended: boolean;
  suspendedReason?: string;
  paymentWithheld: boolean;
  paymentWithheldReason?: string;
}

export interface RecurringDocument {
  projectId: string;
  subId: string;
  docType: RecurringDocType;
  /** weekEndingDate for PAYROLL (ISO date), yyyy-mm for WORKFORCE */
  period: string;
  dueDate: string;
  submittedAt?: string;
  status: DocSubmissionStatus;
  late: boolean;
}

export interface ProjectActionLogEntry {
  projectId: string;
  subId: string;
  timestamp: string;
  actor: 'ai' | 'human';
  actorName?: string;
  action:
    | 'reminder_sent'
    | 'escalated'
    | 'payment_withheld'
    | 'payment_released'
    | 'suspended'
    | 'reinstated'
    | 'document_submitted';
  detail?: string;
  reason?: string;
}

/** What the frontend renders for a single sub's compliance state. */
export interface SubcontractorStatusSummary {
  subId: string;
  name: string;
  trade: string;
  color: ComplianceColor;
  onboardingStatus: Subcontractor['onboardingStatus'];
  suspended: boolean;
  paymentWithheld?: boolean;
  missingDocTypes: DocType[];
}
