import axios from 'axios';
import { getAuthHeader, clearCredentials } from './authStorage';

const baseURL = import.meta.env.VITE_API_URL || 'https://8lr32bnqsc.execute-api.ca-west-1.amazonaws.com/prod';

const client = axios.create({ baseURL });

client.interceptors.request.use((config) => {
  const header = getAuthHeader('compliance');
  if (header) config.headers.Authorization = header;
  return config;
});

client.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      clearCredentials('compliance');
      window.location.href = '/login';
    }
    return Promise.reject(err);
  }
);

export async function tryComplianceLogin(username: string, password: string): Promise<boolean> {
  try {
    const header = `Basic ${btoa(`${username}:${password}`)}`;
    await axios.get(`${baseURL}/subcontractors`, { headers: { Authorization: header } });
    return true;
  } catch {
    return false;
  }
}

export interface SubcontractorSummary {
  subId: string;
  name: string;
  trade: string;
  onboardingStatus: string;
  suspended: boolean;
  color: 'green' | 'yellow' | 'red';
}

export interface ProjectSummary {
  projectId: string;
  name: string;
  address: string;
  isPublicFunded: boolean;
}

export interface Assignment {
  subId: string;
  subName: string;
  subTrade: string;
  mobilizedDate: string;
  suspended: boolean;
  suspendedReason?: string;
  paymentWithheld: boolean;
  paymentWithheldReason?: string;
  lateCount: number;
  missingCount: number;
  payrollCascadeStage?: string;
  workforceCascadeStage?: string;
  color: 'green' | 'yellow' | 'red';
}

export interface MissingDocEntry {
  subId: string;
  subName: string;
  trade: string;
  projectId?: string;
  projectName?: string;
  reason: string;
  urgency: number;
  suspended: boolean;
  paymentWithheld: boolean;
}

export const api = {
  listSubcontractors: () => client.get<{ data: { subcontractors: SubcontractorSummary[] } }>('/subcontractors').then((r) => r.data.data.subcontractors),

  getSubcontractor: (subId: string) => client.get(`/subcontractors/${subId}`).then((r) => r.data.data),

  listProjects: () => client.get<{ data: { projects: ProjectSummary[] } }>('/projects').then((r) => r.data.data.projects),

  getProjectStatus: (projectId: string) =>
    client.get<{ data: { project: ProjectSummary; assignments: Assignment[] } }>(`/projects/${projectId}/status`).then((r) => r.data.data),

  listMissingDocuments: () => client.get<{ data: { missingDocuments: MissingDocEntry[] } }>('/missing-documents').then((r) => r.data.data.missingDocuments),

  runSubCascadeCheck: (subId: string) => client.post(`/subcontractors/${subId}/run-cascade-check`, {}).then((r) => r.data.data),

  runProjectCascadeCheck: (projectId: string, subId: string, body: { docType: 'PAYROLL' | 'WORKFORCE'; period: string; dueDate: string }) =>
    client.post(`/projects/${projectId}/subcontractors/${subId}/run-cascade-check`, body).then((r) => r.data.data),

  suspendSubOnboarding: (subId: string, reason: string, actorName: string) =>
    client.post(`/subcontractors/${subId}/suspend`, { reason, actorName }).then((r) => r.data.data),

  reinstateSubOnboarding: (subId: string, actorName: string) =>
    client.post(`/subcontractors/${subId}/reinstate`, { actorName }).then((r) => r.data.data),

  withholdPayment: (projectId: string, subId: string, reason: string, actorName: string) =>
    client.post(`/projects/${projectId}/subcontractors/${subId}/withhold-payment`, { reason, actorName }).then((r) => r.data.data),

  releasePayment: (projectId: string, subId: string, actorName: string) =>
    client.post(`/projects/${projectId}/subcontractors/${subId}/release-payment`, { actorName }).then((r) => r.data.data),

  suspendSubcontractor: (projectId: string, subId: string, reason: string, actorName: string) =>
    client.post(`/projects/${projectId}/subcontractors/${subId}/suspend`, { reason, actorName }).then((r) => r.data.data),

  reinstateSubcontractor: (projectId: string, subId: string, actorName: string) =>
    client.post(`/projects/${projectId}/subcontractors/${subId}/reinstate`, { actorName }).then((r) => r.data.data),

  getDocumentViewUrl: (subId: string, key: string) =>
    client.get<{ data: { url: string } }>(`/subcontractors/${subId}/documents/view-url`, { params: { key } }).then((r) => r.data.data.url),
};
