export type DocumentStatus = "Queued" | "Processing" | "Completed" | "Failed";

export interface DocumentResult {
  extracted_data: Record<string, unknown> | null;
  is_finalized: boolean;
}

export interface Document {
  id: string;
  filename: string;
  status: DocumentStatus;
  created_at: string;
}

export interface DocumentDetail extends Document {
  result: DocumentResult | null;
}

export interface UploadDocumentResponse {
  documents: Document[];
}

export interface RetryDocumentResponse extends DocumentDetail {}

export type ExportFormat = "json" | "csv";

export interface FinalizeDocumentPayload {
  extracted_data: Record<string, unknown>;
  is_finalized?: boolean;
}

export type FinalizeDocumentResponse = DocumentResult;

export type JobEventName =
  | "job_queued"
  | "job_started"
  | "document_parsing_started"
  | "document_parsing_completed"
  | "field_extraction_started"
  | "field_extraction_completed"
  | "job_completed"
  | "job_failed";

export interface JobEventPayload {
  event: JobEventName;
  data?: Record<string, unknown> | null;
}


