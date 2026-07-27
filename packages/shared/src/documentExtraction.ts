import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';

const MODEL_ID = 'us.anthropic.claude-haiku-4-5-20251001-v1:0';

let client: BedrockRuntimeClient | null = null;
function getBedrock(): BedrockRuntimeClient {
  if (!client) client = new BedrockRuntimeClient({ region: 'us-west-2' });
  return client;
}

type ExtractableDocType = 'COI' | 'W9' | 'PAYROLL' | 'WORKFORCE';

const TOOLS: Record<ExtractableDocType, { name: string; description: string; input_schema: Record<string, unknown> }> = {
  COI: {
    name: 'extract_coi_fields',
    description: 'Extract the fields needed to validate a Certificate of Insurance (COI).',
    input_schema: {
      type: 'object',
      properties: {
        coverageLimit: { type: 'number', description: 'General liability coverage limit in USD, e.g. 1000000 for $1,000,000. 0 if not found.' },
        expiresAt: { type: 'string', description: 'Policy expiration date in ISO 8601 (YYYY-MM-DD). Empty string if not found.' },
        namedInsured: { type: 'string', description: 'The named insured / policyholder business name.' },
      },
      required: ['coverageLimit', 'expiresAt', 'namedInsured'],
    },
  },
  W9: {
    name: 'extract_w9_fields',
    description: 'Extract the fields needed to validate a W-9 form.',
    input_schema: {
      type: 'object',
      properties: {
        taxId: { type: 'string', description: 'The EIN or SSN in the format XX-XXXXXXX. Empty string if not found.' },
        businessName: { type: 'string', description: 'The business name on line 1 of the form.' },
      },
      required: ['taxId', 'businessName'],
    },
  },
  PAYROLL: {
    name: 'extract_payroll_fields',
    description: 'Extract the fields needed to validate a Certified Payroll Report.',
    input_schema: {
      type: 'object',
      properties: {
        totalHours: { type: 'number', description: 'Total hours worked across all listed employees for the period. 0 if not found.' },
        employeeCount: { type: 'number', description: 'Number of distinct employees listed on the report.' },
      },
      required: ['totalHours', 'employeeCount'],
    },
  },
  WORKFORCE: {
    name: 'extract_workforce_fields',
    description: 'Extract the fields needed to validate a Monthly Workforce Report.',
    input_schema: {
      type: 'object',
      properties: {
        participationPercent: { type: 'number', description: 'MWBE/DBE participation percentage reported, as a number (e.g. 22.5 for 22.5%).' },
      },
      required: ['participationPercent'],
    },
  },
};

function contentBlockFor(mediaType: string, base64Data: string) {
  if (mediaType === 'application/pdf') {
    return { type: 'document', source: { type: 'base64', media_type: mediaType, data: base64Data } };
  }
  return { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64Data } };
}

/**
 * Sends an uploaded COI or W-9 (image or PDF) to Claude via Bedrock and
 * returns structured fields via tool-use — a forced tool call gets a
 * guaranteed JSON shape back, rather than asking the model to describe its
 * answer in prose and hoping a regex finds it.
 */
const DOC_LABEL: Record<ExtractableDocType, string> = {
  COI: 'Certificate of Insurance',
  W9: 'W-9 form',
  PAYROLL: 'Certified Payroll Report',
  WORKFORCE: 'Monthly Workforce Report',
};

export async function extractDocumentFields(docType: ExtractableDocType, mediaType: string, base64Data: string): Promise<Record<string, unknown>> {
  const tool = TOOLS[docType];
  const payload = {
    anthropic_version: 'bedrock-2023-05-31',
    max_tokens: 1024,
    tools: [tool],
    tool_choice: { type: 'tool', name: tool.name },
    messages: [
      {
        role: 'user',
        content: [contentBlockFor(mediaType, base64Data), { type: 'text', text: `Extract the required fields from this ${DOC_LABEL[docType]}.` }],
      },
    ],
  };

  const response = await getBedrock().send(
    new InvokeModelCommand({
      modelId: MODEL_ID,
      contentType: 'application/json',
      accept: 'application/json',
      body: Buffer.from(JSON.stringify(payload)),
    })
  );

  const decoded = JSON.parse(Buffer.from(response.body).toString());
  const toolUseBlock = decoded.content?.find((b: { type: string }) => b.type === 'tool_use');
  if (!toolUseBlock) throw new Error('Model did not return a tool_use block');
  return toolUseBlock.input as Record<string, unknown>;
}
