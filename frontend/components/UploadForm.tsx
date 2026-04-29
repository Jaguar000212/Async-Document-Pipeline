"use client";

import { FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, CheckCircle2, Loader2, UploadCloud } from "lucide-react";

import { uploadDocuments } from "@/lib/api";

type UploadState = "idle" | "uploading" | "success" | "error";

export default function UploadForm() {
  const router = useRouter();
  const [files, setFiles] = useState<File[]>([]);
  const [state, setState] = useState<UploadState>("idle");
  const [error, setError] = useState<string | null>(null);

  const isUploading = state === "uploading";

  const statusText = useMemo(() => {
    switch (state) {
      case "uploading":
        return "Uploading document...";
      case "success":
        return "Upload successful. Redirecting...";
      case "error":
        return error ?? "Upload failed.";
      default:
        return "Select a file to start processing.";
    }
  }, [state, error]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (files.length === 0) {
      setState("error");
      setError("Please select at least one file.");
      return;
    }

    try {
      setState("uploading");
      setError(null);
      const response = await uploadDocuments(files);
      setState("success");
      if (response.documents.length === 1) {
        router.push(`/documents/${response.documents[0].id}`);
      } else {
        router.push("/");
      }
    } catch (submitError) {
      setState("error");
      setError(submitError instanceof Error ? submitError.message : "Unexpected upload error.");
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="w-full rounded-xl border border-slate-200 bg-white p-6 shadow-sm"
    >
      <div className="mb-4 flex items-center gap-2">
        <UploadCloud className="h-5 w-5 text-slate-700" />
        <h2 className="text-lg font-semibold text-slate-900">Upload Document</h2>
      </div>

      <label className="mb-2 block text-sm font-medium text-slate-700" htmlFor="document-file">
        File
      </label>
        <input
        id="document-file"
        type="file"
        multiple
        onChange={(event) => setFiles(Array.from(event.target.files ?? []))}
        className="mb-4 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm file:mr-3 file:rounded-md file:border-0 file:bg-slate-100 file:px-3 file:py-1.5 file:text-sm file:font-medium hover:file:bg-slate-200"
        disabled={isUploading}
      />

      <button
        type="submit"
        disabled={files.length === 0 || isUploading}
        className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isUploading ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Uploading...
          </>
        ) : (
          <>
            <UploadCloud className="h-4 w-4" />
            Upload & Process
          </>
        )}
      </button>

      <div className="mt-4 text-sm">
        {state === "success" && (
          <p className="inline-flex items-center gap-2 text-emerald-600">
            <CheckCircle2 className="h-4 w-4" />
            {statusText}
          </p>
        )}

        {state === "error" && (
          <p className="inline-flex items-center gap-2 text-red-600">
            <AlertCircle className="h-4 w-4" />
            {statusText}
          </p>
        )}

        {(state === "idle" || state === "uploading") && (
          <p className="text-slate-600">
            {files.length > 1 ? `${files.length} files selected. ` : files.length === 1 ? `${files[0].name} selected. ` : ""}
            {statusText}
          </p>
        )}
      </div>
    </form>
  );
}

