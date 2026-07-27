import axios from 'axios';
import { getAuthHeader, clearCredentials } from './authStorage';

const baseURL = import.meta.env.VITE_API_URL || 'https://8lr32bnqsc.execute-api.ca-west-1.amazonaws.com/prod';

const client = axios.create({ baseURL });

client.interceptors.request.use((config) => {
  const header = getAuthHeader('sub');
  if (header) config.headers.Authorization = header;
  return config;
});

client.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      clearCredentials('sub');
      window.location.href = '/sub-portal/login';
    }
    return Promise.reject(err);
  }
);

export interface SubPortalDocument {
  SK: string;
  docType: string;
  submittedAt: string;
  status: string;
  expiresAt?: string;
  rejectionReason?: string;
  sourceKey?: string;
  period?: string;
  late?: boolean;
}

export interface SubPortalProject {
  projectId: string;
  mobilizedDate: string;
  suspended: boolean;
  paymentWithheld: boolean;
  lateCount: number;
  missingCount: number;
  payrollCascadeStage?: string;
  workforceCascadeStage?: string;
  documents: SubPortalDocument[];
}

export async function tryLogin(subId: string, password: string): Promise<boolean> {
  try {
    const header = `Basic ${btoa(`${subId}:${password}`)}`;
    await axios.get(`${baseURL}/sub-portal/${subId}`, { headers: { Authorization: header } });
    return true;
  } catch {
    return false;
  }
}

export const subPortalApi = {
  getProfile: (subId: string) =>
    client
      .get<{ data: { subcontractor: { subId: string; name: string; trade: string; onboardingStatus: string; suspended: boolean; color: string }; documents: SubPortalDocument[]; projects: SubPortalProject[] } }>(
        `/sub-portal/${subId}`
      )
      .then((r) => r.data.data),

  requestUploadUrl: (subId: string, docType: 'COI' | 'W9', filename: string, contentType: string) =>
    client.post<{ data: { uploadUrl: string; key: string } }>(`/sub-portal/${subId}/documents/${docType}/upload-url`, { filename, contentType }).then((r) => r.data.data),

  requestProjectUploadUrl: (
    subId: string,
    projectId: string,
    docType: 'PAYROLL' | 'WORKFORCE',
    params: { period: string; dueDate: string; filename: string; contentType: string }
  ) =>
    client
      .post<{ data: { uploadUrl: string; key: string } }>(`/sub-portal/${subId}/projects/${projectId}/documents/${docType}/upload-url`, params)
      .then((r) => r.data.data),

  uploadToS3: (uploadUrl: string, file: File) => axios.put(uploadUrl, file, { headers: { 'Content-Type': file.type || 'application/pdf' } }),

  getDocumentViewUrl: (subId: string, key: string) =>
    client.get<{ data: { url: string } }>(`/sub-portal/${subId}/documents/view-url`, { params: { key } }).then((r) => r.data.data.url),
};
