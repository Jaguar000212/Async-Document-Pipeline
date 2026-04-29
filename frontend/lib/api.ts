import type {
  Document,
  DocumentDetail,
  ExportFormat,
  FinalizeDocumentPayload,
  FinalizeDocumentResponse,
  RetryDocumentResponse,
  UploadDocumentResponse,
} from "@/types";

export class ApiError extends Error {
  status: number;
  detail?: unknown;

  constructor(message: string, status: number, detail?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.detail = detail;
  }
}

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";

function buildUrl(path: string): string {
  return `${API_BASE_URL}${path}`;
}

export function getDocumentStreamUrl(documentId: string): string {
  return buildUrl(`/api/documents/${documentId}/stream`);
}

async function parseJsonSafely(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(buildUrl(path), {
    ...init,
    headers: {
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
  });

  if (!response.ok) {
    const payload = await parseJsonSafely(response);
    const detail = payload && typeof payload === "object" && "detail" in payload
      ? (payload as { detail?: unknown }).detail
      : payload;

    throw new ApiError(`Request failed with status ${response.status}`, response.status, detail);
  }

  return (await response.json()) as T;
}

export async function uploadDocuments(files: File[]): Promise<UploadDocumentResponse> {
  const formData = new FormData();
  for (const file of files) {
    formData.append("files", file);
  }

  return request<UploadDocumentResponse>("/api/documents", {
    method: "POST",
    body: formData,
  });
}

export { uploadDocuments as uploadDocument };

export function retryDocument(documentId: string): Promise<RetryDocumentResponse> {
  return request<RetryDocumentResponse>(`/api/documents/${documentId}/retry`, {
    method: "POST",
  });
}

export function listDocuments(): Promise<Document[]> {
  return request<Document[]>("/api/documents");
}

export function getDocument(documentId: string): Promise<DocumentDetail> {
  return request<DocumentDetail>(`/api/documents/${documentId}`);
}

export function finalizeDocument(
  documentId: string,
  payload: FinalizeDocumentPayload,
): Promise<FinalizeDocumentResponse> {
  return request<FinalizeDocumentResponse>(`/api/documents/${documentId}/finalize`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      ...payload,
      is_finalized: payload.is_finalized ?? true,
    }),
  });
}

export async function exportDocument(documentId: string, format: ExportFormat): Promise<Blob> {
  const response = await fetch(buildUrl(`/api/documents/${documentId}/export?format=${format}`), {
    method: "GET",
    cache: "no-store",
  });

  if (!response.ok) {
    const payload = await parseJsonSafely(response);
    const detail = payload && typeof payload === "object" && "detail" in payload
      ? (payload as { detail?: unknown }).detail
      : payload;
    throw new ApiError(`Request failed with status ${response.status}`, response.status, detail);
  }

  return await response.blob();
}


