"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { Copy, Download, Save } from "lucide-react";

import { finalizeDocument } from "@/lib/api";
import type { DocumentResult } from "@/types";

interface ReviewFormProps {
  documentId: string;
  extractedData: Record<string, unknown> | null;
  onFinalized?: (result: DocumentResult) => void;
  onToast?: (message: string, kind?: "info" | "success" | "error") => void;
}

function createDownload(documentId: string, data: Record<string, unknown>): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `document-${documentId}-finalized.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export default function ReviewForm({ documentId, extractedData, onFinalized, onToast }: ReviewFormProps) {
  const [jsonText, setJsonText] = useState<string>(JSON.stringify(extractedData ?? {}, null, 2));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    setJsonText(JSON.stringify(extractedData ?? {}, null, 2));
  }, [extractedData]);

  const parsedJson = useMemo(() => {
    try {
      return JSON.parse(jsonText) as Record<string, unknown>;
    } catch {
      return null;
    }
  }, [jsonText]);

  async function handleFinalize(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!parsedJson) {
      setError("JSON is invalid. Please fix formatting before saving.");
      setSuccess(null);
      return;
    }

    try {
      setSaving(true);
      setError(null);
      setSuccess(null);

      const result = await finalizeDocument(documentId, {
        extracted_data: parsedJson,
        is_finalized: true,
      });

      setSuccess("Document finalized and saved.");
      onToast?.("Document finalized successfully.", "success");
      onFinalized?.(result);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Failed to finalize document.");
      onToast?.("Failed to finalize document.", "error");
    } finally {
      setSaving(false);
    }
  }

  function handleExport() {
    if (!parsedJson) {
      setError("JSON is invalid. Fix it before exporting.");
      onToast?.("JSON is invalid. Fix it before exporting.", "error");
      return;
    }
    createDownload(documentId, parsedJson);
    onToast?.("Export started.", "info");
  }

  async function handleCopyJson() {
    if (!parsedJson) {
      setError("JSON is invalid. Fix it before copying.");
      onToast?.("JSON is invalid. Fix it before copying.", "error");
      return;
    }

    try {
      await navigator.clipboard.writeText(JSON.stringify(parsedJson, null, 2));
      onToast?.("JSON copied to clipboard.", "success");
    } catch {
      onToast?.("Clipboard permission blocked. Copy failed.", "error");
    }
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="mb-3 text-lg font-semibold text-slate-900">Review and Finalize</h2>
      <form onSubmit={handleFinalize} className="space-y-4">
        <textarea
          value={jsonText}
          onChange={(event) => setJsonText(event.target.value)}
          className="min-h-[260px] w-full rounded-lg border border-slate-300 p-3 font-mono text-sm focus:border-slate-500 focus:outline-none"
          spellCheck={false}
        />

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Save className="h-4 w-4" />
            {saving ? "Saving..." : "Finalize & Save"}
          </button>

          <button
            type="button"
            onClick={handleExport}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            <Download className="h-4 w-4" />
            Export JSON
          </button>

          <button
            type="button"
            onClick={() => void handleCopyJson()}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            <Copy className="h-4 w-4" />
            Copy JSON
          </button>
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}
        {success && <p className="text-sm text-emerald-600">{success}</p>}
      </form>
    </section>
  );
}


