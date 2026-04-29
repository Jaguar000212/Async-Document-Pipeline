"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { CheckCircle2, CircleDot, Loader2, XCircle } from "lucide-react";

import { getDocument, getDocumentStreamUrl } from "@/lib/api";
import { formatAbsoluteDate, formatRelativeTime } from "@/lib/time";
import ReviewForm from "@/components/ReviewForm";
import ToastStack, { type ToastItem, type ToastKind } from "@/components/ToastStack";
import type { DocumentDetail, DocumentResult, JobEventName, JobEventPayload } from "@/types";

type ProgressState = "pending" | "active" | "done" | "failed";

interface ProgressModel {
  parsing: ProgressState;
  extraction: ProgressState;
  finalized: ProgressState;
}

function buildProgress(status: DocumentDetail["status"]): ProgressModel {
  if (status === "Completed") {
    return { parsing: "done", extraction: "done", finalized: "active" };
  }
  if (status === "Failed") {
    return { parsing: "failed", extraction: "failed", finalized: "failed" };
  }
  if (status === "Processing") {
    return { parsing: "active", extraction: "pending", finalized: "pending" };
  }
  return { parsing: "pending", extraction: "pending", finalized: "pending" };
}

function parseSsePayload(raw: string): JobEventPayload | null {
  try {
    const parsed = JSON.parse(raw) as JobEventPayload;
    if (!parsed?.event) return null;
    return parsed;
  } catch {
    return null;
  }
}

function stateIcon(state: ProgressState) {
  if (state === "done") return <CheckCircle2 className="h-4 w-4 text-emerald-600" />;
  if (state === "failed") return <XCircle className="h-4 w-4 text-red-600" />;
  if (state === "active") return <Loader2 className="h-4 w-4 animate-spin text-blue-600" />;
  return <CircleDot className="h-4 w-4 text-slate-400" />;
}

export default function DocumentDetailPage() {
  const params = useParams<{ id: string }>();
  const documentId = params.id;

  const [document, setDocument] = useState<DocumentDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [events, setEvents] = useState<JobEventName[]>([]);
  const [progress, setProgress] = useState<ProgressModel>({
    parsing: "pending",
    extraction: "pending",
    finalized: "pending",
  });
  const [isPolling, setIsPolling] = useState(false);
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const eventSourceRef = useRef<EventSource | null>(null);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const isTerminal = document?.status === "Completed" || document?.status === "Failed";

  const pushToast = useCallback((message: string, kind: ToastKind = "info") => {
    const id = Date.now() + Math.floor(Math.random() * 1000);
    setToasts((current) => [...current, { id, message, kind }]);
    window.setTimeout(() => {
      setToasts((current) => current.filter((item) => item.id !== id));
    }, 3200);
  }, []);

  const dismissToast = useCallback((id: number) => {
    setToasts((current) => current.filter((item) => item.id !== id));
  }, []);

  const loadDocument = useCallback(async (silent = false) => {
    try {
      if (!silent) {
        setLoading(true);
      }
      setError(null);
      const detail = await getDocument(documentId);
      setDocument(detail);
      setProgress(buildProgress(detail.status));
      if (detail.status === "Completed" || detail.status === "Failed") {
        setIsPolling(false);
        if (pollingRef.current) {
          clearInterval(pollingRef.current);
          pollingRef.current = null;
        }
      }
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load document.");
    } finally {
      if (!silent) {
        setLoading(false);
      }
    }
  }, [documentId]);

  const closeStream = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
  }, []);

  const stopPolling = useCallback(() => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
    setIsPolling(false);
  }, []);

  const startPolling = useCallback(() => {
    if (pollingRef.current) return;
    setIsPolling(true);
    pollingRef.current = setInterval(() => {
      void loadDocument(true);
    }, 3000);
  }, [loadDocument]);

  const applyJobEvent = useCallback((event: JobEventName) => {
    setEvents((current) => (current.includes(event) ? current : [...current, event]));

    setProgress((current) => {
      switch (event) {
        case "document_parsing_started":
          return { ...current, parsing: "active" };
        case "document_parsing_completed":
          return { ...current, parsing: "done" };
        case "field_extraction_started":
          return { ...current, extraction: "active" };
        case "field_extraction_completed":
          return { ...current, extraction: "done" };
        case "job_completed":
          return { ...current, parsing: "done", extraction: "done", finalized: "active" };
        case "job_failed":
          return { ...current, parsing: "failed", extraction: "failed", finalized: "failed" };
        default:
          return current;
      }
    });
  }, []);

  useEffect(() => {
    void loadDocument(false);
    return () => {
      closeStream();
      stopPolling();
    };
  }, [loadDocument, closeStream, stopPolling]);

  useEffect(() => {
    if (!document || isTerminal) {
      closeStream();
      stopPolling();
      return;
    }

    if (document.status !== "Queued" && document.status !== "Processing") {
      return;
    }

    if (eventSourceRef.current) {
      return;
    }

    const source = new EventSource(getDocumentStreamUrl(documentId));
    eventSourceRef.current = source;

    source.onmessage = (message) => {
      const payload = parseSsePayload(message.data);
      if (!payload) return;

      applyJobEvent(payload.event);

      if (payload.event === "job_completed" || payload.event === "job_failed") {
        closeStream();
        stopPolling();
        void loadDocument(true);
        if (payload.event === "job_completed") {
          pushToast("Processing completed.", "success");
        } else {
          pushToast("Processing failed.", "error");
        }
      }
    };

    source.onerror = () => {
      closeStream();
      startPolling();
      pushToast("Live updates disconnected. Switched to polling.", "info");
    };

    return () => closeStream();
  }, [applyJobEvent, closeStream, document, documentId, isTerminal, loadDocument, pushToast, startPolling, stopPolling]);

  const progressItems = useMemo(
    () => [
      { key: "parsing", label: "Document Parsing", state: progress.parsing },
      { key: "extraction", label: "Field Extraction", state: progress.extraction },
      { key: "finalized", label: "Ready for Review", state: progress.finalized },
    ],
    [progress],
  );

  return (
    <main className="mx-auto max-w-4xl px-4 py-10">
      <ToastStack items={toasts} onDismiss={dismissToast} />
      <div className="mb-4">
        <Link href="/" className="text-sm text-slate-600 hover:text-slate-900">
          ← Back to Dashboard
        </Link>
      </div>

      {loading ? (
        <p className="text-sm text-slate-600">Loading document...</p>
      ) : error ? (
        <p className="text-sm text-red-600">{error}</p>
      ) : !document ? (
        <p className="text-sm text-slate-600">Document not found.</p>
      ) : (
        <div className="space-y-6">
          <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <h1 className="mb-2 text-xl font-bold text-slate-900">{document.filename}</h1>
            <p className="text-sm text-slate-600">Status: {document.status}</p>
            <p className="text-sm text-slate-500" title={formatAbsoluteDate(document.created_at)}>
              Uploaded: {formatRelativeTime(document.created_at)}
            </p>
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="mb-3 text-lg font-semibold text-slate-900">Live Progress</h2>
            {isPolling && (
              <p className="mb-3 text-xs font-medium text-blue-700">Live stream unavailable, polling every 3s.</p>
            )}
            <ul className="space-y-2">
              {progressItems.map((item) => (
                <li key={item.key} className="flex items-center gap-2 text-sm text-slate-700">
                  {stateIcon(item.state)}
                  <span>{item.label}</span>
                </li>
              ))}
            </ul>

            {events.length > 0 && (
              <div className="mt-4 rounded-lg bg-slate-50 p-3">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Events</p>
                <div className="flex flex-wrap gap-2">
                  {events.map((event) => (
                    <span key={event} className="rounded-md bg-slate-200 px-2 py-1 text-xs text-slate-700">
                      {event}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </section>

          {document.status === "Completed" && (
            <ReviewForm
              documentId={document.id}
              extractedData={document.result?.extracted_data ?? null}
              onToast={pushToast}
              onFinalized={(result: DocumentResult) => {
                setDocument((current) => {
                  if (!current) return current;
                  return {
                    ...current,
                    result,
                  };
                });
                setProgress((current) => ({ ...current, finalized: "done" }));
              }}
            />
          )}
        </div>
      )}
    </main>
  );
}


