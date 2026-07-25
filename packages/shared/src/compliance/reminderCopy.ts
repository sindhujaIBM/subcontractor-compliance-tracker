export interface ReminderCopy {
  subject: string;
  body: string;
}

export function onboardingReminderCopy(params: {
  subName: string;
  missingDocTypes: string[];
  isFollowUp: boolean;
}): ReminderCopy {
  const docs = params.missingDocTypes.join(' and ');
  if (!params.isFollowUp) {
    return {
      subject: `Action needed: ${docs} required before you can be onboarded`,
      body: `Hi ${params.subName},\n\nBefore you can be onboarded to this project, we need a valid ${docs} on file. Please submit it as soon as possible.\n\nThanks,\nCompliance Team`,
    };
  }
  return {
    subject: `Following up: ${docs} still outstanding`,
    body: `Hi ${params.subName},\n\nWe received your recent submission, but ${docs} still isn't showing as valid on our end. Please double-check and resubmit — happy to help if something's unclear.\n\nThanks,\nCompliance Team`,
  };
}

export function recurringReminderCopy(params: {
  subName: string;
  docType: 'Certified Payroll Report' | 'Monthly Workforce Report';
  period: string;
  isFollowUp: boolean;
}): ReminderCopy {
  if (!params.isFollowUp) {
    return {
      subject: `${params.docType} due — ${params.period}`,
      body: `Hi ${params.subName},\n\nJust a heads up that your ${params.docType} for ${params.period} is coming due. Please submit it before the deadline.\n\nThanks,\nCompliance Team`,
    };
  }
  return {
    subject: `Still missing: ${params.docType} for ${params.period}`,
    body: `Hi ${params.subName},\n\nWe still don't have a valid ${params.docType} on file for ${params.period}. If you already sent something, we may need it resubmitted — please check and resend.\n\nThanks,\nCompliance Team`,
  };
}

export function escalationInternalNote(params: { subName: string; context: string }): string {
  return `${params.subName} has been escalated (${params.context}) and needs a human decision — the system does not suspend or withhold payment automatically.`;
}
