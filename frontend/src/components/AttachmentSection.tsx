import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api, toErrorMessage } from "../api/client";
import { useToast } from "../context/ToastContext";
import { PaperclipIcon } from "./PaperclipIcon";
import type { Contract } from "../types/contract";

export function AttachmentSection({ orgId, contract }: { orgId: string; contract: Contract }) {
  const { showToast } = useToast();
  const queryClient = useQueryClient();

  const uploadAttachmentMutation = useMutation({
    mutationFn: (file: File) => api.uploadAttachment(orgId, contract.id, file),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["contract", contract.id] });
      showToast("Attachment uploaded");
    },
    onError: (err) => showToast(toErrorMessage(err, "Failed to upload attachment")),
  });

  const deleteAttachmentMutation = useMutation({
    mutationFn: () => api.deleteAttachment(orgId, contract.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["contract", contract.id] });
      showToast("Attachment removed");
    },
    onError: (err) => showToast(toErrorMessage(err, "Failed to remove attachment")),
  });

  const handleFileSelect = (file: File | undefined) => {
    if (file) uploadAttachmentMutation.mutate(file);
  };

  return (
    <div className="mb-8 rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-800">
      <h2 className="mb-3 flex items-center gap-1.5 text-sm font-semibold text-gray-700 dark:text-gray-300">
        <PaperclipIcon />
        Attachment
      </h2>
      {contract.attachmentFilename ? (
        <div>
          <div className="flex items-center justify-between rounded-md border border-indigo-100 bg-indigo-50 px-3 py-2.5 text-sm dark:border-indigo-900/50 dark:bg-indigo-900/40">
            <a
              href={api.attachmentUrl(orgId, contract.id)}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-2 font-medium text-indigo-500 transition-colors hover:underline dark:text-indigo-300"
            >
              <PaperclipIcon />
              {contract.attachmentFilename}
              {contract.attachmentSize != null && (
                <span className="font-normal text-indigo-400 dark:text-indigo-500">
                  ({Math.round(contract.attachmentSize / 1024)} KB)
                </span>
              )}
            </a>
            <div className="flex items-center gap-1">
              <label className="cursor-pointer rounded px-2 py-1 text-xs font-medium text-indigo-500 transition-colors hover:bg-indigo-100 dark:text-indigo-300 dark:hover:bg-indigo-900/50">
                {uploadAttachmentMutation.isPending ? "Uploading…" : "Replace"}
                <input
                  type="file"
                  accept="application/pdf"
                  disabled={uploadAttachmentMutation.isPending}
                  onChange={(e) => {
                    handleFileSelect(e.target.files?.[0]);
                    e.target.value = "";
                  }}
                  className="hidden"
                />
              </label>
              <button
                onClick={() => deleteAttachmentMutation.mutate()}
                disabled={deleteAttachmentMutation.isPending}
                className="rounded px-2 py-1 text-xs font-medium text-red-600 transition-colors hover:bg-red-50 disabled:opacity-40 dark:text-red-400 dark:hover:bg-red-950"
              >
                Remove
              </button>
            </div>
          </div>
          {contract.attachmentMimeType === "application/pdf" && (
            <iframe
              key={contract.attachmentUploadedAt}
              src={`${api.attachmentUrl(orgId, contract.id)}&t=${encodeURIComponent(
                contract.attachmentUploadedAt ?? "",
              )}`}
              title={`Preview of ${contract.attachmentFilename}`}
              className="mt-3 h-[600px] w-full rounded-md border border-gray-200 dark:border-gray-800"
            />
          )}
        </div>
      ) : (
        <label
          className={`flex cursor-pointer flex-col items-center gap-1 rounded-md border-2 border-dashed px-4 py-6 text-center transition-colors ${
            uploadAttachmentMutation.isPending
              ? "border-gray-200 bg-gray-50 dark:border-gray-800 dark:bg-gray-800/40"
              : "border-gray-300 hover:border-indigo-400 hover:bg-indigo-50 dark:border-gray-700 dark:hover:border-indigo-500 dark:hover:bg-indigo-900/30"
          }`}
        >
          <input
            type="file"
            accept="application/pdf"
            disabled={uploadAttachmentMutation.isPending}
            onChange={(e) => {
              handleFileSelect(e.target.files?.[0]);
              e.target.value = "";
            }}
            className="hidden"
          />
          <PaperclipIcon className="h-5 w-5 text-gray-400 dark:text-gray-500" />
          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
            {uploadAttachmentMutation.isPending ? "Uploading…" : "Click to upload a PDF"}
          </span>
          <span className="text-xs text-gray-400 dark:text-gray-500">Optional — PDF only, up to 10MB</span>
        </label>
      )}
    </div>
  );
}
