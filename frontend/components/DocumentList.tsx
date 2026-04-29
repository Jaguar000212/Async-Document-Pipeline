"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Eye, RefreshCw } from "lucide-react";

import { listDocuments, retryDocument } from "@/lib/api";
import { formatAbsoluteDate, formatRelativeTime, parseTimestamp } from "@/lib/time";
import type { Document, DocumentStatus } from "@/types";

const statusClassMap: Record<DocumentStatus, string> = {
  Queued: "bg-yellow-100 text-yellow-800",
  Processing: "bg-blue-100 text-blue-800",
  Completed: "bg-green-100 text-green-800",
  Failed: "bg-red-100 text-red-800",
};

export default function DocumentList() {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<DocumentStatus | "All">("All");
  const [sortBy, setSortBy] = useState<"newest" | "oldest" | "filename-asc" | "filename-desc" | "status">("newest");
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const inFlightRef = useRef(false);

  const fetchDocuments = useCallback(async (mode: "initial" | "manual" | "background" = "initial") => {
    if (inFlightRef.current) return;
    try {
      inFlightRef.current = true;
      if (mode === "manual") {
        setRefreshing(true);
      } else if (mode === "initial") {
        setLoading(true);
      }
      setError(null);
      const data = await listDocuments();
      setDocuments(data);
    } catch (fetchError) {
      setError(fetchError instanceof Error ? fetchError.message : "Failed to load documents.");
    } finally {
      inFlightRef.current = false;
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void fetchDocuments("initial");
  }, [fetchDocuments]);

  useEffect(() => {
    const hasActiveJobs = documents.some((doc) => doc.status === "Queued" || doc.status === "Processing");

    if (!hasActiveJobs) {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
      return;
    }

    if (pollingRef.current) {
      return;
    }

    pollingRef.current = setInterval(() => {
      void fetchDocuments("background");
    }, 3000);

    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
    };
  }, [documents, fetchDocuments]);

  const visibleDocuments = useMemo(() => {
    const filtered = documents.filter((doc) => {
      const matchesSearch = doc.filename.toLowerCase().includes(search.toLowerCase());
      const matchesStatus = statusFilter === "All" || doc.status === statusFilter;
      return matchesSearch && matchesStatus;
    });

    const sorters: Record<typeof sortBy, (a: Document, b: Document) => number> = {
      newest: (a, b) => parseTimestamp(b.created_at) - parseTimestamp(a.created_at),
      oldest: (a, b) => parseTimestamp(a.created_at) - parseTimestamp(b.created_at),
      "filename-asc": (a, b) => a.filename.localeCompare(b.filename),
      "filename-desc": (a, b) => b.filename.localeCompare(a.filename),
      status: (a, b) => a.status.localeCompare(b.status) || parseTimestamp(b.created_at) - parseTimestamp(a.created_at),
    };

    return filtered.sort(sorters[sortBy]);
  }, [documents, search, sortBy, statusFilter]);

  return (
    <section className="w-full rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-slate-900">Processing Jobs</h2>
        <button
          type="button"
          onClick={() => void fetchDocuments("manual")}
          disabled={loading || refreshing}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      <div className="mb-4 grid gap-3 md:grid-cols-3">
        <input
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search by filename"
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
        />
        <select
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value as DocumentStatus | "All")}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
        >
          <option value="All">All statuses</option>
          <option value="Queued">Queued</option>
          <option value="Processing">Processing</option>
          <option value="Completed">Completed</option>
          <option value="Failed">Failed</option>
        </select>
        <select
          value={sortBy}
          onChange={(event) => setSortBy(event.target.value as typeof sortBy)}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
        >
          <option value="newest">Newest first</option>
          <option value="oldest">Oldest first</option>
          <option value="filename-asc">Filename A-Z</option>
          <option value="filename-desc">Filename Z-A</option>
          <option value="status">By status</option>
        </select>
      </div>

      {loading ? (
        <p className="text-sm text-slate-600">Loading documents...</p>
      ) : error ? (
        <p className="text-sm text-red-600">{error}</p>
      ) : visibleDocuments.length === 0 ? (
        <p className="text-sm text-slate-600">
          {documents.length === 0 ? "No documents yet. Upload one to start." : "No documents match your search/filter."}
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-4 py-3 text-left font-semibold text-slate-700">Filename</th>
                <th className="px-4 py-3 text-left font-semibold text-slate-700">Status</th>
                <th className="px-4 py-3 text-left font-semibold text-slate-700">Uploaded</th>
                <th className="px-4 py-3 text-right font-semibold text-slate-700">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {visibleDocuments.map((doc) => (
                <tr key={doc.id}>
                  <td className="px-4 py-3 text-slate-800">{doc.filename}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${statusClassMap[doc.status]}`}>
                      {doc.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-600" title={formatAbsoluteDate(doc.created_at)}>
                    {formatRelativeTime(doc.created_at)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="inline-flex items-center gap-2">
                      {doc.status === "Failed" && (
                        <button
                          type="button"
                          onClick={async () => {
                            try {
                              await retryDocument(doc.id);
                              await fetchDocuments("background");
                            } catch (retryError) {
                              setError(retryError instanceof Error ? retryError.message : "Retry failed.");
                            }
                          }}
                          className="inline-flex items-center gap-1 rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                        >
                          Retry
                        </button>
                      )}
                      <Link
                        href={`/documents/${doc.id}`}
                        className="inline-flex items-center gap-1 rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                      >
                        <Eye className="h-3.5 w-3.5" />
                        View
                      </Link>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}


